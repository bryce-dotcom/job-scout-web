import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // This endpoint is called when a customer returns from PayPal with ?payment=success&provider=paypal
    // We also support PayPal IPN/webhook notifications
    const body = await req.json();

    // Handle PayPal capture callback
    // PayPal redirects back to portal, but we need to capture the order server-side
    const { token: portalToken, paypal_order_id } = body;

    if (!portalToken || !paypal_order_id) {
      return new Response(JSON.stringify({ error: 'portal token and paypal_order_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get the portal token to find company
    const { data: tokenRow } = await supabase
      .from('customer_portal_tokens')
      .select('*')
      .eq('token', portalToken)
      .single();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get company payment config for PayPal credentials
    const { data: configRow } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', tokenRow.company_id)
      .eq('key', 'payment_config')
      .single();

    if (!configRow?.value) {
      return new Response(JSON.stringify({ error: 'Payment not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cfg = JSON.parse(configRow.value);
    const paypalMode = cfg.paypal_mode || 'sandbox';
    const paypalBaseUrl = paypalMode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    // Authenticate with PayPal
    const authRes = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${cfg.paypal_client_id}:${cfg.paypal_secret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: 'PayPal authentication failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { access_token } = await authRes.json();

    // Capture the order
    const captureRes = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${paypal_order_id}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!captureRes.ok) {
      const errText = await captureRes.text();
      console.error('PayPal capture error:', errText);
      return new Response(JSON.stringify({ error: 'Payment capture failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const captureData = await captureRes.json();

    if (captureData.status !== 'COMPLETED') {
      return new Response(JSON.stringify({ error: 'Payment not completed', status: captureData.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Extract payment details
    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    const amountDollars = parseFloat(capture?.amount?.value || '0');
    const transactionId = capture?.id || paypal_order_id;

    // Parse the custom_id we stored in the order
    let customData: Record<string, string> = {};
    const customId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id
      || captureData.purchase_units?.[0]?.custom_id;
    if (customId) {
      try { customData = JSON.parse(customId); } catch { /* ignore */ }
    }

    const documentType = customData.document_type || tokenRow.document_type;
    const documentId = customData.document_id || tokenRow.document_id;
    const paymentType = customData.payment_type || (documentType === 'invoice' ? 'invoice_payment' : 'estimate_deposit');
    const companyId = tokenRow.company_id;

    // Record payment same as Stripe webhook
    if (paymentType === 'invoice_payment' && documentType === 'invoice') {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, amount, customer_id')
        .eq('id', documentId)
        .single();

      if (invoice) {
        await supabase.from('payments').insert({
          company_id: companyId,
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          amount: amountDollars,
          date: new Date().toISOString().split('T')[0],
          method: 'PayPal',
          status: 'Completed',
          notes: `PayPal payment (${transactionId})`,
        });

        const { data: allPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('invoice_id', invoice.id);

        const totalPaid = (allPayments || []).reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
        const invoiceAmount = parseFloat(String(invoice.amount)) || 0;
        const newStatus = totalPaid >= invoiceAmount ? 'Paid' : 'Partial';

        await supabase.from('invoices')
          .update({ payment_status: newStatus })
          .eq('id', invoice.id);
      }
    } else if (paymentType === 'estimate_deposit' && documentType === 'estimate') {
      await supabase.from('quotes')
        .update({
          deposit_amount: amountDollars,
          deposit_method: 'PayPal',
          deposit_date: new Date().toISOString().split('T')[0],
          status: 'Approved',
        })
        .eq('id', documentId);

      const { data: estimate } = await supabase
        .from('quotes')
        .select('lead_id')
        .eq('id', documentId)
        .single();

      if (estimate?.lead_id) {
        await supabase.from('leads')
          .update({ status: 'Won' })
          .eq('id', estimate.lead_id);
      }
    }

    return new Response(JSON.stringify({ success: true, transaction_id: transactionId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('paypal-webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
