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
// Idempotent: re-running on the same tenant updates the same row.
//
// Auth: tenant calls via service role from the cron OR an authenticated
// user with admin access. The function itself uses service role inside.

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

async function syncOne(supabase: ReturnType<typeof createClient>, companyId: number) {
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

  return {
    company_id: companyId,
    available_dollars: availableDollars,
    pending_dollars: pendingDollars,
    total_balance: totalBalance,
    payouts_imported: payoutsImported,
    payouts_skipped: payoutsSkipped,
  };
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
    const { company_id, all } = body || {};

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
          const r = await syncOne(supabase, t.company_id as number);
          results.push(r);
        } catch (e) {
          results.push({ company_id: t.company_id, error: (e as Error).message });
        }
      }
      return jsonResponse({ synced: results.length, results });
    }

    // Single-tenant mode
    if (!company_id) return jsonResponse({ error: 'company_id is required (or pass {all: true})' }, 400);
    const r = await syncOne(supabase, Number(company_id));
    return jsonResponse(r);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
