// Returns a tenant's Stripe transactions (charges) for a date range
// so the Books page can render a searchable list + CSV download.
//
// Body: { company_id, days?: 90, limit?: 1000 }
// Returns:
//   {
//     configured: boolean,
//     window_days: number,
//     transactions: [{
//       id, created_iso, amount, currency, status, paid,
//       payment_method, customer_email, customer_name,
//       description, receipt_url, refunded, refund_amount,
//       matched_invoice_id, matched_invoice_number, matched_job_id
//     }],
//     totals: { count, gross, refunded, net },
//   }
//
// "Matched" means we found a corresponding payments row in the DB whose
// stripe_payment_intent_id equals this charge's payment_intent.

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

interface StripeCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  created: number;
  payment_intent: string | null;
  payment_method_details?: { type?: string } | null;
  billing_details?: { email?: string | null; name?: string | null } | null;
  receipt_email?: string | null;
  description?: string | null;
  receipt_url?: string | null;
}

interface StripeListResp<T> { data: T[]; has_more: boolean; }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const company_id = Number(body?.company_id);
    const days = Math.min(Math.max(Number(body?.days || 90), 1), 365);
    const maxRecords = Math.min(Math.max(Number(body?.limit || 1000), 1), 5000);
    if (!company_id) return jsonResponse({ error: 'company_id is required' }, 400);

    // 1. Tenant Stripe key
    const { data: cfgRow } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', company_id)
      .eq('key', 'payment_config')
      .single();
    let stripeKey: string | null = null;
    if (cfgRow?.value) {
      try { stripeKey = JSON.parse(cfgRow.value as string).stripe_secret_key; } catch { /* ignore */ }
    }
    if (!stripeKey) return jsonResponse({ configured: false });

    // 2. Paginate charges across the window
    const since = Math.floor((Date.now() - days * 86400 * 1000) / 1000);
    const charges: StripeCharge[] = [];
    let startingAfter: string | null = null;
    let safety = 0;
    while (safety++ < 60 && charges.length < maxRecords) {
      const params = new URLSearchParams({ limit: '100', 'created[gte]': String(since) });
      if (startingAfter) params.append('starting_after', startingAfter);
      const r = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return jsonResponse({ error: `Stripe charges: ${(err as { error?: { message?: string } })?.error?.message || r.status}` }, 502);
      }
      const page = await r.json() as StripeListResp<StripeCharge>;
      charges.push(...(page.data || []));
      if (!page.has_more || (page.data?.length || 0) === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }

    // 3. Cross-reference with our payments table to mark matched/unmatched
    const piIds = charges.map((c) => c.payment_intent).filter(Boolean) as string[];
    const matchedByPi = new Map<string, { invoice_id: number | null; job_id: number | null; invoice_number: string | null }>();
    if (piIds.length > 0) {
      // Supabase .in() is fine up to a few thousand; chunk just in case.
      const chunkSize = 200;
      for (let i = 0; i < piIds.length; i += chunkSize) {
        const chunk = piIds.slice(i, i + chunkSize);
        const { data: pays } = await supabase
          .from('payments')
          .select('stripe_payment_intent_id, invoice_id, job_id, invoice:invoices(invoice_id)')
          .eq('company_id', company_id)
          .in('stripe_payment_intent_id', chunk);
        for (const p of pays || []) {
          const piRow = p as { stripe_payment_intent_id: string; invoice_id: number | null; job_id: number | null; invoice?: { invoice_id?: string | null } | null };
          if (piRow.stripe_payment_intent_id) {
            matchedByPi.set(piRow.stripe_payment_intent_id, {
              invoice_id: piRow.invoice_id,
              job_id: piRow.job_id,
              invoice_number: piRow.invoice?.invoice_id ?? null,
            });
          }
        }
      }
    }

    // 4. Shape the response
    const transactions = charges.map((c) => {
      const matched = c.payment_intent ? matchedByPi.get(c.payment_intent) : undefined;
      return {
        id: c.id,
        payment_intent: c.payment_intent,
        created_iso: new Date(c.created * 1000).toISOString(),
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        paid: c.paid,
        refunded: c.refunded,
        refund_amount: c.amount_refunded / 100,
        payment_method: c.payment_method_details?.type || null,
        customer_email: c.billing_details?.email || c.receipt_email || null,
        customer_name: c.billing_details?.name || null,
        description: c.description || null,
        receipt_url: c.receipt_url || null,
        matched_invoice_id: matched?.invoice_id ?? null,
        matched_invoice_number: matched?.invoice_number ?? null,
        matched_job_id: matched?.job_id ?? null,
      };
    });

    // 5. Totals
    let gross = 0, refunded = 0;
    for (const t of transactions) {
      if (t.status === 'succeeded') gross += t.amount;
      refunded += t.refund_amount;
    }

    return jsonResponse({
      configured: true,
      window_days: days,
      count: transactions.length,
      transactions,
      totals: {
        count: transactions.length,
        gross: Math.round(gross * 100) / 100,
        refunded: Math.round(refunded * 100) / 100,
        net: Math.round((gross - refunded) * 100) / 100,
      },
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
