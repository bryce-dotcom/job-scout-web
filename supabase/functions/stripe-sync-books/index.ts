// Sync Stripe → JobScout Books for a single tenant.
//
// Body: { company_id }
//
// What it does:
//   1. Reads tenant's Stripe secret from settings.payment_config
//   2. Fetches Stripe Balance API → updates bank_accounts row labeled
//      "Stripe (Operating)" with available + pending balances
//   3. Fetches recent payouts (last 30 days) → ensures each is recorded
//      somewhere visible (we add a row per payout to a journal table
//      via plaid_transactions for now — same shape Books already
//      consumes, with a 'stripe' source so we can filter)
//
//   4. Ties each paid payout to the payments it carried and the bank
//      deposit it became (see _shared/stripePayoutLink.ts): the payments
//      get stripe_payout_id + stripe_fee and source_transaction_id, the
//      bank row becomes a matched transfer with its composition in notes.
//      Nothing is invented; charges JobScout never recorded are reported.
//
// Idempotent: re-running on the same tenant updates the same row.
//
// Body: { company_id } | { all: true }, plus
//   link_days  how far back to look at payouts for linking (default 45)
//   dry_run    true = decide everything, write nothing, return the plans
//   link_only  true = skip the balance + payout import, just link
//
// Auth: tenant calls via service role from the cron OR an authenticated
// user with admin access. The function itself uses service role inside.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { planPayoutLink, payoutCharges, intentOf } from "../_shared/stripePayoutLink.ts";
import type { BalanceTxn, PayoutPlan } from "../_shared/stripePayoutLink.ts";

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

interface StripeBalance {
  available: { amount: number; currency: string }[];
  pending:   { amount: number; currency: string }[];
}

interface StripePayout {
  id: string;
  amount: number;
  currency: string;
  arrival_date: number;  // unix seconds
  status: string;        // paid | pending | in_transit | canceled | failed
  destination?: string;  // ba_... bank account id on Stripe
  description?: string | null;
}

interface StripeListResponse<T> {
  data: T[];
  has_more: boolean;
}

interface SyncOptions { linkDays?: number; dryRun?: boolean; linkOnly?: boolean }

async function syncOne(supabase: ReturnType<typeof createClient>, companyId: number, opts: SyncOptions = {}) {
  // 1. Tenant Stripe key
  const { data: cfgRow } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'payment_config')
    .single();

  let stripeKey: string | null = null;
  if (cfgRow?.value) {
    try { stripeKey = JSON.parse(cfgRow.value as string).stripe_secret_key; } catch { /* ignore */ }
  }
  if (!stripeKey) return { company_id: companyId, error: 'Stripe not configured', skipped: true };

  if (opts.linkOnly) {
    const link = await linkPayouts(supabase, companyId, stripeKey, opts);
    return { company_id: companyId, ...link };
  }

  // 2. Balance
  const balRes = await fetch('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  if (!balRes.ok) {
    const err = await balRes.json().catch(() => ({}));
    return { company_id: companyId, error: `Stripe balance: ${(err as { error?: { message?: string } })?.error?.message || balRes.status}` };
  }
  const balance = await balRes.json() as StripeBalance;

  const usd = (entries: { amount: number; currency: string }[]) =>
    (entries || [])
      .filter(e => e.currency === 'usd')
      .reduce((sum, e) => sum + (e.amount || 0), 0) / 100;

  const availableDollars = usd(balance.available);
  const pendingDollars   = usd(balance.pending);
  const totalBalance     = availableDollars + pendingDollars;

  // 3. Upsert the tenant's "Stripe (Operating)" bank_accounts row.
  // Use stable provider_account_id='primary' since a single Stripe
  // account per tenant; if we ever support multiple Stripe accounts
  // per tenant we'd extend this.
  const stripeAccountKey = 'primary';
  const { data: existing } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', 'stripe')
    .eq('provider_account_id', stripeAccountKey)
    .maybeSingle();

  if (existing) {
    await supabase.from('bank_accounts').update({
      current_balance:   totalBalance,
      available_balance: availableDollars,
      pending_balance:   pendingDollars,
      last_synced:       new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await supabase.from('bank_accounts').insert({
      company_id: companyId,
      name: 'Stripe (Operating)',
      account_type: 'checking',
      provider: 'stripe',
      provider_account_id: stripeAccountKey,
      current_balance:   totalBalance,
      available_balance: availableDollars,
      pending_balance:   pendingDollars,
      last_synced:       new Date().toISOString(),
    });
  }

  // 4. Fetch recent payouts (last 30 days, USD)
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000);
  let payoutsImported = 0;
  let payoutsSkipped  = 0;
  let startingAfter: string | null = null;
  let safety = 0;
  while (safety++ < 10) {
    const params = new URLSearchParams({ limit: '100', 'created[gte]': String(thirtyDaysAgo) });
    if (startingAfter) params.append('starting_after', startingAfter);
    const pRes = await fetch(`https://api.stripe.com/v1/payouts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!pRes.ok) break;
    const list = await pRes.json() as StripeListResponse<StripePayout>;
    for (const po of (list.data || [])) {
      if (po.currency !== 'usd') continue;
      const amountDollars = po.amount / 100;
      const arrivalDate = new Date(po.arrival_date * 1000).toISOString().split('T')[0];

      // Idempotency: use plaid_transaction_id with a stripe_ prefix
      // so we can dedupe and so it never collides with real Plaid IDs.
      const txKey = `stripe_${po.id}`;
      const { data: dup } = await supabase
        .from('plaid_transactions')
        .select('id')
        .eq('company_id', companyId)
        .eq('plaid_transaction_id', txKey)
        .maybeSingle();
      if (dup) { payoutsSkipped++; continue; }

      const { error: txErr } = await supabase.from('plaid_transactions').insert({
        company_id: companyId,
        plaid_transaction_id: txKey,
        amount: -amountDollars, // payout = money LEAVING Stripe (negative on Stripe side)
        date: arrivalDate,
        authorized_date: arrivalDate,
        name: 'Stripe Payout',
        merchant_name: 'Stripe',
        plaid_category: ['Transfer', 'Payout'],            // text[] column
        plaid_personal_finance_category: 'TRANSFER_OUT',
        is_transfer: true,
        pending: po.status !== 'paid',
        notes: `Stripe payout ${po.id} · ${po.status}${po.description ? ' · ' + po.description : ''}`,
      });
      if (!txErr) payoutsImported++;
    }
    if (!list.has_more || (list.data || []).length === 0) break;
    startingAfter = list.data[list.data.length - 1]?.id || null;
    if (!startingAfter) break;
  }

  // 5. What each payout carried, and the bank row it became.
  const link = await linkPayouts(supabase, companyId, stripeKey, opts);

  return {
    company_id: companyId,
    available_dollars: availableDollars,
    pending_dollars: pendingDollars,
    total_balance: totalBalance,
    payouts_imported: payoutsImported,
    payouts_skipped: payoutsSkipped,
    ...link,
  };
}

// ─── Payout ↔ payments ↔ bank row ───

async function stripeList<T>(stripeKey: string, path: string, params: URLSearchParams): Promise<T[]> {
  const out: T[] = [];
  let startingAfter: string | null = null;
  for (let safety = 0; safety < 20; safety++) {
    const q = new URLSearchParams(params);
    q.set('limit', '100');
    if (startingAfter) q.set('starting_after', startingAfter);
    const res = await fetch(`https://api.stripe.com/v1/${path}?${q.toString()}`, { headers: { Authorization: `Bearer ${stripeKey}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Stripe ${path}: ${(err as { error?: { message?: string } })?.error?.message || res.status}`);
    }
    const list = await res.json() as StripeListResponse<T & { id: string }>;
    out.push(...(list.data || []));
    if (!list.has_more || !list.data?.length) break;
    startingAfter = list.data[list.data.length - 1].id;
  }
  return out;
}

/**
 * For every payout in the window: read what Stripe says was inside it, find
 * the payment rows those charges became (by payment_intent) and the bank
 * deposit of the same amount, and write the link the plan decides. A dry
 * run returns the plans and writes nothing.
 */
async function linkPayouts(supabase: ReturnType<typeof createClient>, companyId: number, stripeKey: string, opts: SyncOptions) {
  const days = Math.max(1, Math.min(400, Number(opts.linkDays) || 45));
  const dryRun = opts.dryRun === true;
  const since = Math.floor((Date.now() - days * 86400 * 1000) / 1000);
  const summary = { payouts_seen: 0, payouts_linked: 0, payouts_waiting: 0, payouts_conflicts: 0, payouts_already: 0, payments_stamped: 0, payments_linked: 0, link_errors: [] as string[], plans: [] as PayoutPlan[], results: [] as Record<string, unknown>[] };

  let payouts: StripePayout[] = [];
  try {
    payouts = await stripeList<StripePayout>(stripeKey, 'payouts', new URLSearchParams({ 'created[gte]': String(since) }));
  } catch (e) {
    summary.link_errors.push((e as Error).message);
    return summary;
  }

  for (const po of payouts) {
    if (po.currency !== 'usd' || po.status === 'canceled' || po.status === 'failed') continue;
    summary.payouts_seen++;
    try {
      // Done already? The bank row that carries this payout id is the proof.
      const { data: done } = await supabase.from('plaid_transactions').select('id').eq('company_id', companyId).eq('stripe_payout_id', po.id).limit(1);
      if (done && done.length) { summary.payouts_already++; continue; }

      const balanceTxns = await stripeList<BalanceTxn>(stripeKey, 'balance_transactions', new URLSearchParams({ payout: po.id, 'expand[]': 'data.source' }));
      const intents = balanceTxns.map((bt) => intentOf(bt)).filter((x): x is string => !!x);
      const { data: payments } = intents.length
        ? await supabase.from('payments').select('id, invoice_id, amount, stripe_payment_intent_id, source_transaction_id, stripe_payout_id, invoice:invoices(invoice_id)').eq('company_id', companyId).in('stripe_payment_intent_id', intents)
        : { data: [] };
      const arrival = new Date(po.arrival_date * 1000);
      const from = new Date(arrival.getTime() - 3 * 86400000).toISOString().slice(0, 10);
      const to = new Date(arrival.getTime() + 3 * 86400000).toISOString().slice(0, 10);
      const { data: bankRows } = await supabase
        .from('plaid_transactions')
        .select('id, amount, date, name, merchant_name, plaid_transaction_id, matched_invoice_id, matched_payment_id, matched_utility_invoice_id, is_transfer, confirmed, stripe_payout_id, notes')
        .eq('company_id', companyId)
        .eq('amount', -(po.amount / 100))
        .gte('date', from).lte('date', to);

      // Charges with no payment row still name their invoice (JobScout stamps
      // document_id on every charge it creates) — so the report says which
      // invoice is missing its card payment, not just a pi_ id.
      const known = new Set((payments || []).map((p: { stripe_payment_intent_id: string | null }) => p.stripe_payment_intent_id));
      const docIds = payoutCharges(balanceTxns).charges.filter((c) => c.docId != null && !(c.intent && known.has(c.intent))).map((c) => c.docId as number);
      const { data: invoices } = docIds.length
        ? await supabase.from('invoices').select('id, invoice_id, payment_status').eq('company_id', companyId).in('id', docIds)
        : { data: [] };
      const plan = planPayoutLink({ payout: po, balanceTxns, payments: (payments || []) as never, bankRows: (bankRows || []) as never, invoices: (invoices || []) as never });
      if (dryRun) summary.plans.push(plan);
      else summary.results.push({ payout: po.id, outcome: plan.outcome, reason: plan.reason, twin: plan.twin?.id ?? null, mapped: plan.mapped.length, unmapped: plan.unmapped.map((u) => ({ intent: u.intent, invoice: u.invoiceNo, status: u.invoiceStatus, net: u.net })), fees: plan.fees });
      if (plan.outcome === 'linked') summary.payouts_linked++;
      else if (plan.outcome === 'waiting_for_bank') summary.payouts_waiting++;
      else if (plan.outcome === 'twin_conflict' || plan.outcome === 'twin_ambiguous') summary.payouts_conflicts++;
      else if (plan.outcome === 'already_linked') summary.payouts_already++;
      if (dryRun) continue;

      // Payments first, then the bank row — so a bank row that says "linked" never points at payments that are not.
      for (const m of plan.mapped) {
        if (!plan.actions.stampPayments.includes(m.paymentId)) continue;
        const patch: Record<string, unknown> = { stripe_payout_id: po.id, stripe_fee: m.fee };
        if (plan.actions.linkPayments.includes(m.paymentId) && plan.twin) patch.source_transaction_id = plan.twin.id;
        const { error } = await supabase.from('payments').update(patch).eq('id', m.paymentId).eq('company_id', companyId);
        if (error) { summary.link_errors.push(`payment ${m.paymentId}: ${error.message}`); continue; }
        summary.payments_stamped++;
        if (patch.source_transaction_id) summary.payments_linked++;
      }
      if (plan.actions.twinUpdate && plan.twin) {
        const { error } = await supabase.from('plaid_transactions').update(plan.actions.twinUpdate).eq('id', plan.twin.id).eq('company_id', companyId);
        if (error) summary.link_errors.push(`bank row ${plan.twin.id}: ${error.message}`);
      }
    } catch (e) {
      summary.link_errors.push(`${po.id}: ${(e as Error).message}`);
    }
  }
  return summary;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { company_id, all, link_days, dry_run, link_only } = body || {};
    const opts: SyncOptions = { linkDays: link_days, dryRun: dry_run === true, linkOnly: link_only === true };

    // Cron mode: sync EVERY tenant that has Stripe configured
    if (all === true) {
      const { data: tenants } = await supabase
        .from('settings')
        .select('company_id, value')
        .eq('key', 'payment_config');
      const results: unknown[] = [];
      for (const t of (tenants || [])) {
        try {
          const cfg = JSON.parse(t.value as string);
          if (!cfg.stripe_secret_key) continue;
          const r = await syncOne(supabase, t.company_id as number, opts);
          results.push(r);
        } catch (e) {
          results.push({ company_id: t.company_id, error: (e as Error).message });
        }
      }
      return jsonResponse({ synced: results.length, results });
    }

    // Single-tenant mode
    if (!company_id) return jsonResponse({ error: 'company_id is required (or pass {all: true})' }, 400);
    const r = await syncOne(supabase, Number(company_id), opts);
    return jsonResponse(r);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
