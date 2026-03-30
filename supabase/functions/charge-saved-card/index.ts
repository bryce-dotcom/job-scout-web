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
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { company_id, invoice_id, payment_method_id } = await req.json();

    if (!company_id || !invoice_id) {
      return jsonResponse({ error: 'company_id and invoice_id are required' }, 400);
    }

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, amount, customer_id, payment_status, credit_card_fee')
      .eq('id', invoice_id)
      .eq('company_id', company_id)
      .single();

    if (invErr || !invoice) return jsonResponse({ error: 'Invoice not found' }, 404);
    if (invoice.payment_status === 'Paid') return jsonResponse({ error: 'Invoice is already paid' }, 400);

    // Fetch customer
    const { data: customer } = await supabase
      .from('customers')
      .select('id, stripe_customer_id')
      .eq('id', invoice.customer_id)
      .single();

    if (!customer?.stripe_customer_id) {
      return jsonResponse({ error: 'Customer has no saved payment methods' }, 400);
    }

    // Get payment method — specified or default
    let pmQuery = supabase
      .from('customer_payment_methods')
      .select('stripe_payment_method_id, brand, last_four')
      .eq('company_id', company_id)
      .eq('customer_id', customer.id)
      .eq('status', 'active');

    if (payment_method_id) {
      pmQuery = pmQuery.eq('id', payment_method_id);
    } else {
      pmQuery = pmQuery.eq('is_default', true);
    }

    const { data: pm } = await pmQuery.single();
    if (!pm) return jsonResponse({ error: 'No payment method found. Ask customer to add a card.' }, 404);

    // Get Stripe key
    const { data: configRow } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', company_id)
      .eq('key', 'payment_config')
      .single();

    let stripeKey = null;
    if (configRow?.value) {
      try { stripeKey = JSON.parse(configRow.value).stripe_secret_key; } catch {}
    }
    if (!stripeKey) return jsonResponse({ error: 'Stripe is not configured' }, 400);

    // Calculate amount — get existing payments to find balance
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoice.id);

    const totalPaid = (existingPayments || []).reduce((s: number, p: { amount: number }) => s + (parseFloat(String(p.amount)) || 0), 0);
    const invoiceAmount = parseFloat(String(invoice.amount)) || 0;
    const balanceDue = invoiceAmount - totalPaid;

    if (balanceDue <= 0) return jsonResponse({ error: 'No balance due' }, 400);

    // Check CC fee settings
    const feeKeys = ['invoice_cc_fee_enabled', 'invoice_cc_fee_percent', 'invoice_accept_credit_card'];
    const { data: feeSettings } = await supabase
      .from('settings')
      .select('key, value')
      .eq('company_id', company_id)
      .in('key', feeKeys);

    const parsed: Record<string, unknown> = {};
    if (feeSettings) {
      for (const s of feeSettings) {
        try { parsed[s.key] = JSON.parse(s.value); } catch { parsed[s.key] = s.value; }
      }
    }
    const ccFeeEnabled = (parsed.invoice_cc_fee_enabled ?? true) && (parsed.invoice_accept_credit_card ?? false);
    const ccFeePercent = (parsed.invoice_cc_fee_percent as number) ?? 1.9;

    let ccFeeAmount = 0;
    if (ccFeeEnabled) {
      ccFeeAmount = Math.round(balanceDue * (ccFeePercent / 100) * 100) / 100;
    }

    const chargeAmountCents = Math.round((balanceDue + ccFeeAmount) * 100);

    // Create PaymentIntent (off-session, confirmed)
    const piParams = new URLSearchParams();
    piParams.append('amount', String(chargeAmountCents));
    piParams.append('currency', 'usd');
    piParams.append('customer', customer.stripe_customer_id);
    piParams.append('payment_method', pm.stripe_payment_method_id);
    piParams.append('off_session', 'true');
    piParams.append('confirm', 'true');
    piParams.append('metadata[company_id]', String(company_id));
    piParams.append('metadata[invoice_id]', String(invoice.id));
    piParams.append('metadata[source]', 'saved_card_charge');

    const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: piParams.toString(),
    });

    const piData = await piRes.json();

    if (!piRes.ok || piData.error) {
      const errMsg = piData.error?.message || 'Payment failed';
      console.error('Stripe charge error:', piData.error);
      return jsonResponse({ error: errMsg }, 400);
    }

    // Payment succeeded — record it
    await supabase.from('payments').insert({
      company_id,
      invoice_id: invoice.id,
      customer_id: customer.id,
      amount: balanceDue,
      date: new Date().toISOString().split('T')[0],
      method: 'Credit Card',
      status: 'Completed',
      notes: `Charged ${pm.brand} ****${pm.last_four} (${piData.id})`,
    });

    // Update CC fee on invoice if applicable
    if (ccFeeAmount > 0) {
      await supabase.from('invoices').update({
        credit_card_fee: (parseFloat(String(invoice.credit_card_fee)) || 0) + ccFeeAmount,
        updated_at: new Date().toISOString(),
      }).eq('id', invoice.id);
    }

    // Update invoice payment status
    const newTotalPaid = totalPaid + balanceDue;
    const newStatus = newTotalPaid >= invoiceAmount ? 'Paid' : 'Partially Paid';
    await supabase.from('invoices').update({
      payment_status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', invoice.id);

    return jsonResponse({
      success: true,
      payment_intent_id: piData.id,
      amount_charged: balanceDue + ccFeeAmount,
      cc_fee: ccFeeAmount,
      new_status: newStatus,
    });

  } catch (error) {
    console.error('charge-saved-card error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});
