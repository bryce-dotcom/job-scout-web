// Returns a tenant's Stripe merchant summary for the Books overview
// card. Combines the last-synced Stripe balance (from bank_accounts)
// with live charge / refund / payout volume from Stripe.
//
// Body: { company_id, days?: 30 }
// Returns:
//   {
//     configured: boolean,
//     available: number, pending: number, total_in_stripe: number,
//     last_synced: string|null,
//     charges:   { count, gross, refunded, net },
//     refunds:   { count, total },
//     payouts:   { count, total, last_date, last_amount },
//     window_days: number,
//   }

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
  status: string;       // succeeded | pending | failed
  created: number;
  refunded: boolean;
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
    const days = Math.min(Math.max(Number(body?.days || 30), 1), 365);
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

    // 2. Cached balance from bank_accounts (synced via stripe-sync-books)
    const { data: ba } = await supabase
      .from('bank_accounts')
      .select('available_balance, pending_balance, current_balance, last_synced')
      .eq('company_id', company_id)
      .eq('provider', 'stripe')
      .eq('provider_account_id', 'primary')
      .maybeSingle();

    const available = parseFloat(String(ba?.available_balance || 0));
    const pending   = parseFloat(String(ba?.pending_balance   || 0));
    const total     = parseFloat(String(ba?.current_balance   || 0));

    // 3. Live charges volume for the window (last N days)
    const since = Math.floor((Date.now() - days * 86400 * 1000) / 1000);
    let chargesGross = 0;
    let chargesRefunded = 0;
    let chargesCount = 0;
    let refundCount = 0;
    let refundTotal = 0;

    let startingAfter: string | null = null;
    let safety = 0;
    while (safety++ < 10) {
      const params = new URLSearchParams({ limit: '100', 'created[gte]': String(since) });
      if (startingAfter) params.append('starting_after', startingAfter);
      const r = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      if (!r.ok) break;
      const list = await r.json() as StripeListResp<StripeCharge>;
      for (const ch of (list.data || [])) {
        if (ch.currency !== 'usd') continue;
        if (ch.status !== 'succeeded') continue;
        const gross = ch.amount / 100;
        const refunded = ch.amount_refunded / 100;
        chargesGross += gross;
        chargesRefunded += refunded;
        chargesCount += 1;
        if (refunded > 0) {
          refundTotal += refunded;
          refundCount += 1;
        }
      }
      if (!list.has_more || (list.data || []).length === 0) break;
      startingAfter = list.data[list.data.length - 1]?.id || null;
      if (!startingAfter) break;
    }

    // 4. Payouts in window from our cached plaid_transactions
    const sinceDate = new Date(Date.now() - days * 86400 * 1000).toISOString().split('T')[0];
    const { data: payouts } = await supabase
      .from('plaid_transactions')
      .select('amount, date')
      .eq('company_id', company_id)
      .like('plaid_transaction_id', 'stripe_%')
      .gte('date', sinceDate)
      .order('date', { ascending: false });

    const payoutCount = (payouts || []).length;
    const payoutTotal = (payouts || []).reduce((s: number, p: { amount: number }) => s + Math.abs(p.amount || 0), 0);
    const lastPayout = (payouts || [])[0] || null;

    return jsonResponse({
      configured: true,
      available, pending, total_in_stripe: total,
      last_synced: ba?.last_synced || null,
      charges: {
        count: chargesCount,
        gross: Math.round(chargesGross * 100) / 100,
        refunded: Math.round(chargesRefunded * 100) / 100,
        net: Math.round((chargesGross - chargesRefunded) * 100) / 100,
      },
      refunds: {
        count: refundCount,
        total: Math.round(refundTotal * 100) / 100,
      },
      payouts: {
        count: payoutCount,
        total: Math.round(payoutTotal * 100) / 100,
        last_date: lastPayout?.date || null,
        last_amount: lastPayout ? Math.abs(lastPayout.amount) : null,
      },
      window_days: days,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
