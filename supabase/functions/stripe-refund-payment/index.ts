// Refund a Stripe payment recorded against an invoice.
//
// Body: { company_id, payment_id, amount?, reason? }
//   amount: optional; defaults to the FULL remaining refundable amount
//           (payment.amount - payment.refunded_amount)
//   reason: optional free-text, stored on the payment row + sent to Stripe
//
// Returns: { success, refund_id, refunded_amount, total_refunded }
//
// On success:
//   - Refund created via Stripe Refunds API on the original payment_intent
//   - payments.refunded_amount += amount
//   - payments.stripe_refund_id = re_...
//   - payments.refunded_at = now()
//   - payments.status flipped to 'Refunded' (full) or 'Partially Refunded'
//   - parent invoice.payment_status recomputed (Paid → Partially Paid → Sent)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { company_id, payment_id, amount, reason } = await req.json();
    if (!company_id || !payment_id) {
      return jsonResponse({ error: 'company_id and payment_id are required' }, 400);
    }

    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .select('id, amount, refunded_amount, stripe_payment_intent_id, status, invoice_id')
      .eq('id', payment_id)
      .eq('company_id', company_id)
      .single();
    if (pErr || !payment) return jsonResponse({ error: 'Payment not found' }, 404);
    if (!payment.stripe_payment_intent_id) {
      return jsonResponse({ error: 'This payment has no Stripe charge — refund must be done outside JobScout' }, 400);
    }

    const alreadyRefunded = parseFloat(String(payment.refunded_amount || 0));
    const totalAmount = parseFloat(String(payment.amount || 0));
    const refundable = totalAmount - alreadyRefunded;
    if (refundable <= 0) return jsonResponse({ error: 'Payment is already fully refunded' }, 400);

    const refundDollars = amount != null ? Math.min(parseFloat(String(amount)), refundable) : refundable;
    if (refundDollars <= 0) return jsonResponse({ error: 'Refund amount must be > 0' }, 400);
    const refundCents = Math.round(refundDollars * 100);

    // Tenant Stripe key
    const { data: configRow } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', company_id)
      .eq('key', 'payment_config')
      .single();
    let stripeKey: string | null = null;
    if (configRow?.value) {
      try { stripeKey = JSON.parse(configRow.value).stripe_secret_key; } catch { /* ignore */ }
    }
    if (!stripeKey) return jsonResponse({ error: 'Stripe is not configured for this tenant' }, 400);

    // Issue the refund
    const params = new URLSearchParams({
      payment_intent: payment.stripe_payment_intent_id,
      amount: String(refundCents),
    });
    if (reason) params.append('metadata[reason]', String(reason).slice(0, 500));

    const refRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const ref = await refRes.json();
    if (!refRes.ok) return jsonResponse({ error: `Stripe refund: ${ref.error?.message || 'unknown'}` }, 500);

    // Record the refund on the payment row
    const newRefunded = alreadyRefunded + refundDollars;
    const isFull = newRefunded >= totalAmount - 0.005;
    const newStatus = isFull ? 'Refunded' : 'Partially Refunded';

    await supabase.from('payments').update({
      refunded_amount: newRefunded,
      refunded_at: new Date().toISOString(),
      stripe_refund_id: ref.id,
      refund_reason: reason || null,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id);

    // Recompute parent invoice payment_status
    if (payment.invoice_id) {
      const { data: allPayments } = await supabase
        .from('payments')
        .select('amount, refunded_amount, status')
        .eq('invoice_id', payment.invoice_id);

      const netPaid = (allPayments || []).reduce((sum: number, p: { amount: number; refunded_amount: number | null }) => {
        return sum + (parseFloat(String(p.amount || 0)) - parseFloat(String(p.refunded_amount || 0)));
      }, 0);

      const { data: invoice } = await supabase
        .from('invoices')
        .select('amount')
        .eq('id', payment.invoice_id)
        .single();
      const invoiceAmount = parseFloat(String(invoice?.amount || 0));

      let newInvStatus = 'Sent';
      if (netPaid >= invoiceAmount - 0.005) newInvStatus = 'Paid';
      else if (netPaid > 0) newInvStatus = 'Partially Paid';

      await supabase.from('invoices').update({
        payment_status: newInvStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', payment.invoice_id);
    }

    return jsonResponse({
      success: true,
      refund_id: ref.id,
      refunded_amount: refundDollars,
      total_refunded: newRefunded,
      payment_status: newStatus,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
