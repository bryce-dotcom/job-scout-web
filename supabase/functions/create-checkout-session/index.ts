import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: read per-company payment config from settings table
async function getPaymentConfig(supabase: ReturnType<typeof createClient>, companyId: string) {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'payment_config')
    .single();

  if (!data?.value) return null;
  try { return JSON.parse(data.value); } catch { return null; }
}

// Helper: read CC fee settings
async function getCcFeeSettings(supabase: ReturnType<typeof createClient>, companyId: string) {
  const keys = ['invoice_cc_fee_enabled', 'invoice_cc_fee_percent', 'invoice_accept_credit_card'];
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .eq('company_id', companyId)
    .in('key', keys);

  const parsed: Record<string, unknown> = {};
  if (data) {
    for (const s of data) {
      try { parsed[s.key] = JSON.parse(s.value); } catch { parsed[s.key] = s.value; }
    }
  }
  return {
    enabled: (parsed.invoice_cc_fee_enabled ?? true) && (parsed.invoice_accept_credit_card ?? false),
    percent: (parsed.invoice_cc_fee_percent as number) ?? 1.9,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { token, payment_type, amount_cents, provider, stripe_method } = await req.json();
    // provider: 'stripe' | 'paypal' (default: 'stripe')
    // stripe_method: 'card' | 'us_bank_account' (default: both)

    if (!token || !payment_type || !amount_cents) {
      return new Response(JSON.stringify({ error: 'token, payment_type, and amount_cents are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate token
    const { data: tokenRow, error: tokenError } = await supabase
      .from('customer_portal_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tokenRow.is_revoked || new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link is no longer valid' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Read per-company payment config from DB
    const paymentConfig = await getPaymentConfig(supabase, tokenRow.company_id);

    // Resolve portal base URL: DB setting > env var > fallback
    const portalBaseUrl = paymentConfig?.portal_base_url
      || Deno.env.get('PORTAL_BASE_URL')
      || 'https://app.jobscout.com';
    const portalUrl = `${portalBaseUrl}/portal/${token}`;

    // Get document info for description
    let description = 'Payment';
    if (tokenRow.document_type === 'invoice') {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_id')
        .eq('id', tokenRow.document_id)
        .single();
      description = `Invoice ${inv?.invoice_id || tokenRow.document_id} Payment`;
    } else if (tokenRow.document_type === 'estimate') {
      const { data: est } = await supabase
        .from('quotes')
        .select('quote_id, estimate_name')
        .eq('id', tokenRow.document_id)
        .single();
      description = `Estimate ${est?.quote_id || ''} Deposit`;
    }

    // Get company name
    const { data: company } = await supabase
      .from('companies')
      .select('company_name')
      .eq('id', tokenRow.company_id)
      .single();

    const chosenProvider = provider || 'stripe';

    // ---- STRIPE ----
    if (chosenProvider === 'stripe') {
      // Per-company key from DB, fallback to global env var
      const stripeKey = paymentConfig?.stripe_secret_key || Deno.env.get('STRIPE_SECRET_KEY');

      if (!stripeKey) {
        return new Response(JSON.stringify({ error: 'Stripe is not configured for this company. Contact the business to set up payments.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check if save-card-on-file is enabled
      const { data: saveCardSetting } = await supabase
        .from('settings')
        .select('value')
        .eq('company_id', tokenRow.company_id)
        .eq('key', 'invoice_save_card_on_file')
        .single();

      let saveCardEnabled = false;
      if (saveCardSetting?.value) {
        try { saveCardEnabled = JSON.parse(saveCardSetting.value); } catch {}
      }

      // Always get or create a Stripe customer (required for ACH/us_bank_account)
      let stripeCustomerId = '';
      if (tokenRow.customer_id) {
        const { data: cust } = await supabase
          .from('customers')
          .select('id, name, email, stripe_customer_id')
          .eq('id', tokenRow.customer_id)
          .single();

        if (cust) {
          stripeCustomerId = cust.stripe_customer_id || '';

          if (!stripeCustomerId) {
            // Create Stripe customer
            const custParams = new URLSearchParams();
            custParams.append('name', cust.name || '');
            if (cust.email) custParams.append('email', cust.email);
            custParams.append('metadata[jobscout_customer_id]', String(cust.id));
            custParams.append('metadata[company_id]', String(tokenRow.company_id));

            const custRes = await fetch('https://api.stripe.com/v1/customers', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${stripeKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: custParams.toString(),
            });

            if (custRes.ok) {
              const stripeCust = await custRes.json();
              stripeCustomerId = stripeCust.id;
              await supabase.from('customers')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('id', cust.id);
            }
          }
        }
      }

      const params = new URLSearchParams();
      params.append('mode', 'payment');
      params.append('success_url', `${portalUrl}?payment=success`);
      params.append('cancel_url', `${portalUrl}?payment=cancelled`);

      // Set payment method types — ACH, card, or both
      if (stripe_method === 'us_bank_account') {
        params.append('payment_method_types[0]', 'us_bank_account');
      } else if (stripe_method === 'card') {
        params.append('payment_method_types[0]', 'card');
      } else {
        // Default: offer both card and ACH
        params.append('payment_method_types[0]', 'card');
        params.append('payment_method_types[1]', 'us_bank_account');
      }

      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(amount_cents));
      params.append('line_items[0][price_data][product_data][name]', description);
      if (company?.company_name) {
        params.append('line_items[0][price_data][product_data][description]', `Payment to ${company.company_name}`);
      }
      params.append('line_items[0][quantity]', '1');
      params.append('metadata[document_id]', String(tokenRow.document_id));
      params.append('metadata[document_type]', tokenRow.document_type);
      params.append('metadata[company_id]', tokenRow.company_id);
      params.append('metadata[portal_token]', token);
      params.append('metadata[payment_type]', payment_type);

      // Attach Stripe customer (required for ACH, also used for save-card)
      if (stripeCustomerId) {
        params.append('customer', stripeCustomerId);
        params.append('metadata[customer_id]', String(tokenRow.customer_id));

        // Only save payment method for future use if save-card is enabled
        if (saveCardEnabled) {
          params.append('payment_intent_data[setup_future_usage]', 'off_session');
          params.append('metadata[save_card]', 'true');
        }
      }

      // Check if CC fee is included and add to metadata
      const ccFeeSettings = await getCcFeeSettings(supabase, tokenRow.company_id);
      if (ccFeeSettings.enabled) {
        params.append('metadata[cc_fee_percent]', String(ccFeeSettings.percent));
      }

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!stripeRes.ok) {
        const errText = await stripeRes.text();
        console.error('Stripe API error:', errText);
        return new Response(JSON.stringify({ error: 'Failed to create Stripe checkout session' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const session = await stripeRes.json();
      return new Response(JSON.stringify({ checkout_url: session.url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- PAYPAL ----
    if (chosenProvider === 'paypal') {
      const paypalClientId = paymentConfig?.paypal_client_id;
      const paypalSecret = paymentConfig?.paypal_secret;
      const paypalMode = paymentConfig?.paypal_mode || 'sandbox';

      if (!paypalClientId || !paypalSecret) {
        return new Response(JSON.stringify({ error: 'PayPal is not configured for this company.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const paypalBaseUrl = paypalMode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

      // Get OAuth token
      const authRes = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!authRes.ok) {
        console.error('PayPal auth error:', await authRes.text());
        return new Response(JSON.stringify({ error: 'Failed to authenticate with PayPal' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { access_token } = await authRes.json();
      const amountDollars = (amount_cents / 100).toFixed(2);

      // Create PayPal Order
      const orderRes = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: `${tokenRow.document_type}_${tokenRow.document_id}`,
            description: description,
            custom_id: JSON.stringify({
              document_id: tokenRow.document_id,
              document_type: tokenRow.document_type,
              company_id: tokenRow.company_id,
              payment_type: payment_type,
            }),
            amount: {
              currency_code: 'USD',
              value: amountDollars,
            },
          }],
          application_context: {
            return_url: `${portalUrl}?payment=success&provider=paypal`,
            cancel_url: `${portalUrl}?payment=cancelled`,
            brand_name: company?.company_name || 'Payment',
            user_action: 'PAY_NOW',
          },
        }),
      });

      if (!orderRes.ok) {
        console.error('PayPal order error:', await orderRes.text());
        return new Response(JSON.stringify({ error: 'Failed to create PayPal order' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const order = await orderRes.json();
      const approveLink = order.links?.find((l: { rel: string }) => l.rel === 'approve');

      if (!approveLink?.href) {
        return new Response(JSON.stringify({ error: 'PayPal did not return an approval URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ checkout_url: approveLink.href }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- WISETACK ----
    if (chosenProvider === 'wisetack') {
      const wisetackApiKey = paymentConfig?.wisetack_api_key;
      const wisetackMerchantId = paymentConfig?.wisetack_merchant_id;
      const wisetackMode = paymentConfig?.wisetack_mode || 'sandbox';

      if (!wisetackApiKey || !wisetackMerchantId) {
        return new Response(JSON.stringify({ error: 'Wisetack financing is not configured for this company.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const wisetackBaseUrl = wisetackMode === 'live'
        ? 'https://api.wisetack.com'
        : 'https://api.sandbox.wisetack.com';

      // Fetch customer info for Wisetack
      let customerName = '';
      let customerEmail = '';
      let customerPhone = '';
      if (tokenRow.customer_id) {
        const { data: cust } = await supabase
          .from('customers')
          .select('name, email, phone')
          .eq('id', tokenRow.customer_id)
          .single();
        if (cust) {
          customerName = cust.name || '';
          customerEmail = cust.email || '';
          customerPhone = cust.phone || '';
        }
      }

      const amountDollars = (amount_cents / 100).toFixed(2);

      // Create Wisetack loan application
      const wtRes = await fetch(`${wisetackBaseUrl}/v1/loan-applications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${wisetackApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: wisetackMerchantId,
          transaction_amount: parseFloat(amountDollars),
          purpose: description,
          consumer: {
            first_name: customerName.split(' ')[0] || '',
            last_name: customerName.split(' ').slice(1).join(' ') || '',
            email: customerEmail,
            phone: customerPhone.replace(/\D/g, ''),
          },
          merchant_reference_id: `${tokenRow.document_type}_${tokenRow.document_id}`,
          redirect_url: `${portalUrl}?payment=success&provider=wisetack`,
          webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/financing-webhook`,
        }),
      });

      if (!wtRes.ok) {
        const errText = await wtRes.text();
        console.error('Wisetack API error:', errText);
        return new Response(JSON.stringify({ error: 'Failed to create financing application' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const wtData = await wtRes.json();
      const applicationUrl = wtData.consumer_url || wtData.url;

      if (!applicationUrl) {
        return new Response(JSON.stringify({ error: 'Wisetack did not return an application URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ checkout_url: applicationUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- GREENSKY ----
    if (chosenProvider === 'greensky') {
      const gsMerchantId = paymentConfig?.greensky_merchant_id;
      const gsApiKey = paymentConfig?.greensky_api_key;
      const gsMode = paymentConfig?.greensky_mode || 'sandbox';

      if (!gsMerchantId) {
        return new Response(JSON.stringify({ error: 'GreenSky is not configured for this company.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const gsBaseUrl = gsMode === 'live'
        ? 'https://api.greensky.com'
        : 'https://api.sandbox.greensky.com';
      const amountDollars = (amount_cents / 100).toFixed(2);

      // Fetch customer info
      let custName = '', custEmail = '', custPhone = '';
      if (tokenRow.customer_id) {
        const { data: c } = await supabase.from('customers').select('name, email, phone').eq('id', tokenRow.customer_id).single();
        if (c) { custName = c.name || ''; custEmail = c.email || ''; custPhone = c.phone || ''; }
      }

      const gsRes = await fetch(`${gsBaseUrl}/v1/applications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gsApiKey}`,
          'X-Merchant-Id': gsMerchantId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          loan_amount: parseFloat(amountDollars),
          merchant_reference_id: `${tokenRow.document_type}_${tokenRow.document_id}`,
          applicant: { name: custName, email: custEmail, phone: custPhone.replace(/\D/g, '') },
          redirect_url: `${portalUrl}?payment=success&provider=greensky`,
        }),
      });

      if (!gsRes.ok) {
        console.error('GreenSky error:', await gsRes.text());
        return new Response(JSON.stringify({ error: 'Failed to create GreenSky application' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const gsData = await gsRes.json();
      const gsUrl = gsData.application_url || gsData.url;
      if (!gsUrl) {
        return new Response(JSON.stringify({ error: 'GreenSky did not return an application URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ checkout_url: gsUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- HEARTH ----
    if (chosenProvider === 'hearth') {
      const hearthPartnerId = paymentConfig?.hearth_partner_id;
      const hearthApiKey = paymentConfig?.hearth_api_key;

      if (!hearthPartnerId) {
        return new Response(JSON.stringify({ error: 'Hearth is not configured for this company.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const amountDollars = (amount_cents / 100).toFixed(2);

      let custName = '', custEmail = '', custPhone = '', custAddress = '';
      if (tokenRow.customer_id) {
        const { data: c } = await supabase.from('customers').select('name, email, phone, address').eq('id', tokenRow.customer_id).single();
        if (c) { custName = c.name || ''; custEmail = c.email || ''; custPhone = c.phone || ''; custAddress = c.address || ''; }
      }

      const hRes = await fetch('https://api.gethearth.com/v1/loan-applications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hearthApiKey}`,
          'X-Partner-Id': hearthPartnerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amountDollars),
          reference_id: `${tokenRow.document_type}_${tokenRow.document_id}`,
          homeowner: { name: custName, email: custEmail, phone: custPhone.replace(/\D/g, ''), address: custAddress },
          redirect_url: `${portalUrl}?payment=success&provider=hearth`,
          webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/financing-webhook`,
        }),
      });

      if (!hRes.ok) {
        console.error('Hearth error:', await hRes.text());
        return new Response(JSON.stringify({ error: 'Failed to create Hearth application' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const hData = await hRes.json();
      const hUrl = hData.application_url || hData.url;
      if (!hUrl) {
        return new Response(JSON.stringify({ error: 'Hearth did not return an application URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ checkout_url: hUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- SERVICE FINANCE ----
    if (chosenProvider === 'service_finance') {
      const sfDealerId = paymentConfig?.service_finance_dealer_id;
      const sfApiKey = paymentConfig?.service_finance_api_key;

      if (!sfDealerId) {
        return new Response(JSON.stringify({ error: 'Service Finance is not configured for this company.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const amountDollars = (amount_cents / 100).toFixed(2);

      let custName = '', custEmail = '', custPhone = '';
      if (tokenRow.customer_id) {
        const { data: c } = await supabase.from('customers').select('name, email, phone').eq('id', tokenRow.customer_id).single();
        if (c) { custName = c.name || ''; custEmail = c.email || ''; custPhone = c.phone || ''; }
      }

      const sfRes = await fetch('https://api.svcfin.com/v1/applications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sfApiKey}`,
          'X-Dealer-Id': sfDealerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amountDollars),
          reference_id: `${tokenRow.document_type}_${tokenRow.document_id}`,
          consumer: { name: custName, email: custEmail, phone: custPhone.replace(/\D/g, '') },
          redirect_url: `${portalUrl}?payment=success&provider=service_finance`,
          webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/financing-webhook`,
        }),
      });

      if (!sfRes.ok) {
        console.error('Service Finance error:', await sfRes.text());
        return new Response(JSON.stringify({ error: 'Failed to create Service Finance application' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const sfData = await sfRes.json();
      const sfUrl = sfData.application_url || sfData.url;
      if (!sfUrl) {
        return new Response(JSON.stringify({ error: 'Service Finance did not return an application URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ checkout_url: sfUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unsupported payment provider: ${chosenProvider}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('create-checkout-session error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
