import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { invoiceCustomerTotal } from "../_shared/money.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handles webhooks from financing providers (Wisetack, GreenSky, Service Finance, Hearth)
// Each provider sends a notification when a loan is approved/funded.
//
// This endpoint inserts a payment and can mark an invoice Paid or an
// estimate Won, so it is gated on a shared secret we put in the webhook
// URL ourselves (create-checkout-session builds it from the same env var).
// It has to be publicly reachable — a provider cannot send a Supabase JWT —
// and "publicly reachable" plus "writes money" with nothing in between is
// how you get an invoice marked paid by anyone who guesses the URL.
//
// Until this was pinned in config.toml the function answered 401 to every
// provider, so no financing payment could EVER have been recorded: the
// customer would be funded at Wisetack and JobScout would never know.
const WEBHOOK_SECRET = Deno.env.get("FINANCING_WEBHOOK_SECRET") || "";

/** Constant-time-ish compare so a wrong token cannot be found a byte at a time. */
function secretOk(given: string | null): boolean {
  if (!WEBHOOK_SECRET) return false;          // not configured = closed, never open
  const a = new TextEncoder().encode(String(given || ""));
  const b = new TextEncoder().encode(WEBHOOK_SECRET);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const url = new URL(req.url);
    const token = url.searchParams.get("t") || req.headers.get("x-financing-token");
    if (!secretOk(token)) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();

    // Wisetack webhook format
    if (body.event_type && body.loan_application_id) {
      return await handleWisetack(supabase, body);
    }

    // GreenSky webhook format
    if (body.applicationId && body.status) {
      return await handleGreenSky(supabase, body);
    }

    // Generic format (Service Finance, Hearth, etc.)
    if (body.provider && body.reference_id && body.status) {
      return await handleGeneric(supabase, body);
    }

    return new Response(JSON.stringify({ received: true, message: 'Unrecognized format' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('financing-webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function handleWisetack(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const eventType = body.event_type as string;
  const merchantRefId = body.merchant_reference_id as string;
  const loanAmount = body.loan_amount as number;
  const loanId = body.loan_application_id as string;

  // merchant_reference_id format: "invoice_<uuid>" or "estimate_<uuid>"
  if (!merchantRefId) {
    return new Response(JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  const [docType, docId] = merchantRefId.split('_', 2);

  // Only process funded/approved events
  if (eventType !== 'loan_funded' && eventType !== 'loan_approved') {
    return new Response(JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  await recordFinancingPayment(supabase, {
    documentType: docType,
    documentId: docId,
    amount: loanAmount || 0,
    method: 'Wisetack Financing',
    transactionId: loanId,
    provider: 'wisetack',
  });

  return new Response(JSON.stringify({ received: true }),
    { headers: { 'Content-Type': 'application/json' } });
}

async function handleGreenSky(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const status = body.status as string;
  const applicationId = body.applicationId as string;
  const merchantRefId = body.merchantReferenceId as string || '';
  const loanAmount = body.approvedAmount as number || body.amount as number || 0;

  if (status !== 'FUNDED' && status !== 'APPROVED') {
    return new Response(JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  const [docType, docId] = merchantRefId.split('_', 2);

  await recordFinancingPayment(supabase, {
    documentType: docType,
    documentId: docId,
    amount: loanAmount,
    method: 'GreenSky Financing',
    transactionId: applicationId,
    provider: 'greensky',
  });

  return new Response(JSON.stringify({ received: true }),
    { headers: { 'Content-Type': 'application/json' } });
}

async function handleGeneric(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const status = body.status as string;
  const refId = body.reference_id as string;
  const amount = body.amount as number || 0;
  const txnId = body.transaction_id as string || body.application_id as string || '';
  const provider = body.provider as string;

  if (status !== 'funded' && status !== 'approved' && status !== 'completed') {
    return new Response(JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  const [docType, docId] = refId.split('_', 2);
  const providerName = {
    hearth: 'Hearth Financing',
    service_finance: 'Service Finance',
    greensky: 'GreenSky Financing',
    wisetack: 'Wisetack Financing',
  }[provider] || `${provider} Financing`;

  await recordFinancingPayment(supabase, {
    documentType: docType,
    documentId: docId,
    amount,
    method: providerName,
    transactionId: txnId,
    provider,
  });

  return new Response(JSON.stringify({ received: true }),
    { headers: { 'Content-Type': 'application/json' } });
}

// Shared function to record a financing payment against an invoice or estimate
async function recordFinancingPayment(
  supabase: ReturnType<typeof createClient>,
  opts: {
    documentType: string;
    documentId: string;
    amount: number;
    method: string;
    transactionId: string;
    provider: string;
  }
) {
  const { documentType, documentId, amount, method, transactionId, provider } = opts;

  if (!documentId) return;

  if (documentType === 'invoice') {
    const { data: invoice } = await supabase
      .from('invoices')
      // discount_applied and tax_amount decide what the CUSTOMER owes. This
      // selected neither and then compared the money in against the GROSS,
      // so an Energy Scout invoice the utility covers most of would never
      // read Paid however much the customer financed.
      .select('id, amount, discount_applied, tax_amount, customer_id, company_id')
      .eq('id', documentId)
      .single();

    if (invoice) {
      // A provider retries until it gets a 2xx. external_payment_id carries
      // a unique index, so a redelivery is refused by the database rather
      // than quietly inserting a second payment for the same loan.
      const { error: payErr } = await supabase.from('payments').insert({
        company_id: invoice.company_id,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        method: method,
        status: 'Completed',
        notes: `${provider} (${transactionId})`,
        external_payment_id: transactionId || null,
      });
      if (payErr && (payErr.code === '23505' || /duplicate key/i.test(payErr.message || ''))) {
        console.log(`financing: ${provider} ${transactionId} already recorded, ignoring redelivery`);
        return;
      }
      if (payErr) throw new Error(`financing payment insert failed: ${payErr.message}`);

      const { data: allPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoice.id);

      const totalPaid = (allPayments || []).reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
      // What the customer owes, not the gross — _shared/money is the rule.
      const owed = invoiceCustomerTotal(invoice.amount, invoice.discount_applied, invoice.tax_amount);
      // 'Partially Paid' is the app's word. 'Partial' is in no colour map and
      // matches no other check in the codebase.
      const newStatus = totalPaid >= owed - 0.01 ? 'Paid' : 'Partially Paid';

      await supabase.from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', invoice.id);
    }
  } else if (documentType === 'estimate') {
    const { data: estimate } = await supabase
      .from('quotes')
      .select('id, company_id, lead_id, customer_id, salesperson_id, estimate_name, job_title, quote_amount, discount, quote_id, utility_incentive, summary, service_date, job_id, lead:leads(business_name, customer_name), customer:customers(business_name, name)')
      .eq('id', documentId)
      .single();

    if (estimate) {
      await supabase.from('quotes')
        .update({
          deposit_amount: amount,
          deposit_method: method,
          deposit_date: new Date().toISOString().split('T')[0],
          status: 'Approved',
        })
        .eq('id', documentId);

      if (estimate.lead_id) {
        await supabase.from('leads')
          .update({ status: 'Won' })
          .eq('id', estimate.lead_id);
      }
      // Auto-create job if none exists, so the deal shows up in Sales Won.
      if (!estimate.job_id) {
        try {
          const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`;
          // Title the job business-name-first (customer → lead), matching
          // EstimateDetail.convertToJob and approve-document. quotes has no
          // customer_name column, so the name comes from the joined records.
          const jobCustomerName = estimate.customer?.business_name || estimate.customer?.name
            || estimate.lead?.business_name || estimate.lead?.customer_name || 'Customer';
          const { data: newJob, error: jobErr } = await supabase
            .from('jobs')
            .insert([{
              company_id: estimate.company_id,
              job_id: jobNumber,
              job_title: estimate.estimate_name || estimate.job_title || `${jobCustomerName} - Job`,
              customer_id: estimate.customer_id || null,
              lead_id: estimate.lead_id ? parseInt(String(estimate.lead_id)) : null,
              salesperson_id: estimate.salesperson_id || null,
              quote_id: estimate.id,
              status: 'Chillin',
              start_date: estimate.service_date || new Date().toISOString(),
              job_total: parseFloat(String(estimate.quote_amount || 0)) || 0,
              // Carry the rep's whole-project discount — without it the invoice
              // has nothing to deduct and over-bills the customer.
              discount: parseFloat(String(estimate.discount || 0)) || 0,
              utility_incentive: parseFloat(String(estimate.utility_incentive || 0)) || 0,
              details: estimate.summary || null,
              updated_at: new Date().toISOString(),
            }])
            .select('id')
            .single();
          if (!jobErr && newJob?.id) {
            await supabase.from('quotes').update({ job_id: newJob.id }).eq('id', estimate.id);
          } else if (jobErr) {
            console.error('[financing-webhook] job auto-create failed', jobErr);
          }
        } catch (e) {
          console.error('[financing-webhook] job auto-create exception', e);
        }
      }
    }
  }
}
