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

    if (!documentId || !companyId) {
      console.error('Missing metadata in checkout session');
      return new Response(JSON.stringify({ error: 'Missing metadata' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Look up per-company webhook secret from settings, fall back to global env
    let webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
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

    const amountDollars = amountTotal / 100;

    if (paymentType === 'invoice_payment' && documentType === 'invoice') {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, amount, customer_id')
        .eq('id', documentId)
        .single();

      if (invoice) {
        // Insert payment record
        await supabase.from('payments').insert({
          company_id: companyId,
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          amount: amountDollars,
          date: new Date().toISOString().split('T')[0],
          method: 'Credit Card',
          status: 'Completed',
          notes: `Stripe payment (${paymentIntent})`,
        });

        // Recalculate total paid
        const { data: allPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('invoice_id', invoice.id);

        const totalPaid = (allPayments || []).reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
        const invoiceAmount = parseFloat(String(invoice.amount)) || 0;
        const newStatus = totalPaid >= invoiceAmount ? 'Paid' : 'Partial';

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
