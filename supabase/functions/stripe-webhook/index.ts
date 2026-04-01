import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Manual Stripe signature verification (no SDK)
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',');
  let timestamp = '';
  let signature = '';

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signature = value;
  }

  if (!timestamp || !signature) return false;

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return expectedSig === signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.text();
    const sigHeader = req.headers.get('stripe-signature') || '';
    const event = JSON.parse(body);

    if (event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ received: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    const session = event.data.object;
    const metadata = session.metadata || {};
    const companyId = metadata.company_id;
    const documentId = metadata.document_id;
    const documentType = metadata.document_type;
    const paymentType = metadata.payment_type;
    const amountTotal = session.amount_total; // cents
    const paymentIntent = session.payment_intent;

    if (!companyId) {
      console.error('Missing company_id in checkout session metadata');
      return new Response(JSON.stringify({ error: 'Missing metadata' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Look up per-company webhook secret from settings, fall back to global env
    let webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
    let stripeKey = '';
    const { data: configRow } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'payment_config')
      .single();

    if (configRow?.value) {
      try {
        const cfg = JSON.parse(configRow.value);
        if (cfg.stripe_webhook_secret) webhookSecret = cfg.stripe_webhook_secret;
        if (cfg.stripe_secret_key) stripeKey = cfg.stripe_secret_key;
      } catch { /* use env fallback */ }
    }

    if (!webhookSecret) {
      console.error('No webhook secret found for company', companyId);
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Verify signature with per-company (or global fallback) secret
    const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // ---- SETUP MODE: Save card from setup session ----
    if (session.mode === 'setup') {
      const customerId = metadata.customer_id;
      const setupIntentId = session.setup_intent;

      if (!setupIntentId || !stripeKey || !customerId) {
        console.error('Setup session missing required data');
        return new Response(JSON.stringify({ received: true }),
          { headers: { 'Content-Type': 'application/json' } });
      }

      // Fetch the SetupIntent to get the payment method
      const siRes = await fetch(`https://api.stripe.com/v1/setup_intents/${setupIntentId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      });
      const setupIntent = await siRes.json();
      const pmId = setupIntent.payment_method;

      if (pmId) {
        // Fetch payment method details
        const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        });
        const pmData = await pmRes.json();
        const card = pmData.card || {};

        // Check if this card already exists (same last4 + exp)
        const { data: existing } = await supabase
          .from('customer_payment_methods')
          .select('id')
          .eq('company_id', companyId)
          .eq('customer_id', customerId)
          .eq('last_four', card.last4 || '')
          .eq('exp_month', card.exp_month || 0)
          .eq('exp_year', card.exp_year || 0)
          .eq('status', 'active')
          .limit(1);

        if (!existing || existing.length === 0) {
          // Check if customer has any existing methods (to set default)
          const { data: existingMethods } = await supabase
            .from('customer_payment_methods')
            .select('id')
            .eq('company_id', companyId)
            .eq('customer_id', customerId)
            .eq('status', 'active')
            .limit(1);

          const isFirst = !existingMethods || existingMethods.length === 0;

          await supabase.from('customer_payment_methods').insert({
            company_id: parseInt(companyId),
            customer_id: parseInt(customerId),
            stripe_payment_method_id: pmId,
            stripe_customer_id: session.customer || '',
            brand: card.brand || 'unknown',
            last_four: card.last4 || '',
            exp_month: card.exp_month || 0,
            exp_year: card.exp_year || 0,
            is_default: isFirst,
          });
        }
      }

      return new Response(JSON.stringify({ received: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // ---- PAYMENT MODE: Handle normal payment checkout ----
    if (!documentId) {
      console.error('Missing document_id in payment checkout session');
      return new Response(JSON.stringify({ received: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    const amountDollars = amountTotal / 100;

    // If setup_future_usage was set, save the payment method from this payment
    if (paymentIntent && stripeKey && metadata.save_card === 'true' && metadata.customer_id) {
      try {
        // Fetch the PaymentIntent to get the payment method used
        const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntent}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        });
        const piData = await piRes.json();
        const pmId = piData.payment_method;

        if (pmId) {
          const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
            headers: { 'Authorization': `Bearer ${stripeKey}` },
          });
          const pmData = await pmRes.json();
          const card = pmData.card || {};

          // Check if already saved
          const { data: existing } = await supabase
            .from('customer_payment_methods')
            .select('id')
            .eq('company_id', companyId)
            .eq('customer_id', metadata.customer_id)
            .eq('last_four', card.last4 || '')
            .eq('exp_month', card.exp_month || 0)
            .eq('exp_year', card.exp_year || 0)
            .eq('status', 'active')
            .limit(1);

          if (!existing || existing.length === 0) {
            const { data: existingMethods } = await supabase
              .from('customer_payment_methods')
              .select('id')
              .eq('company_id', companyId)
              .eq('customer_id', metadata.customer_id)
              .eq('status', 'active')
              .limit(1);

            await supabase.from('customer_payment_methods').insert({
              company_id: parseInt(companyId),
              customer_id: parseInt(metadata.customer_id),
              stripe_payment_method_id: pmId,
              stripe_customer_id: session.customer || '',
              brand: card.brand || 'unknown',
              last_four: card.last4 || '',
              exp_month: card.exp_month || 0,
              exp_year: card.exp_year || 0,
              is_default: !existingMethods || existingMethods.length === 0,
            });
          }
        }
      } catch (e) {
        console.error('Error saving card from payment:', e);
        // Non-fatal — payment still recorded below
      }
    }

    if (paymentType === 'invoice_payment' && documentType === 'invoice') {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, amount, customer_id, job_id')
        .eq('id', documentId)
        .single();

      if (invoice) {
        // Determine payment method from Stripe session
        const paymentMethodType = session.payment_method_types?.[0] === 'us_bank_account' ? 'ACH' : 'Credit Card';

        // Insert payment record
        await supabase.from('payments').insert({
          company_id: companyId,
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          job_id: invoice.job_id || null,
          amount: amountDollars,
          date: new Date().toISOString().split('T')[0],
          method: paymentMethodType,
          status: 'Completed',
          notes: `Stripe payment (${paymentIntent})`,
          stripe_payment_intent_id: paymentIntent || null,
        });

        // Recalculate total paid
        const { data: allPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('invoice_id', invoice.id);

        const totalPaid = (allPayments || []).reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
        const invoiceAmount = parseFloat(String(invoice.amount)) || 0;
        const newStatus = totalPaid >= invoiceAmount ? 'Paid' : 'Partially Paid';

        await supabase
          .from('invoices')
          .update({ payment_status: newStatus })
          .eq('id', invoice.id);
      }
    } else if (paymentType === 'estimate_deposit' && documentType === 'estimate') {
      await supabase
        .from('quotes')
        .update({
          deposit_amount: amountDollars,
          deposit_method: 'Credit Card',
          deposit_date: new Date().toISOString().split('T')[0],
          status: 'Approved',
        })
        .eq('id', documentId);

      // Update linked lead to Won
      const { data: estimate } = await supabase
        .from('quotes')
        .select('lead_id')
        .eq('id', documentId)
        .single();

      if (estimate?.lead_id) {
        await supabase
          .from('leads')
          .update({ status: 'Won' })
          .eq('id', estimate.lead_id);
      }
    }

    return new Response(JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('stripe-webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
