// Does anything silently stop working?
//
// Every outage this year had the same shape: something that should happen
// periodically stopped, and nothing noticed until a person complained weeks
// later.
//
//   Gemini key went away ~May      categorize returned 200 "0 categorized"
//                                  for 3.5 months
//   Bank balances since March      never refreshed; HHH checking was
//                                  $27,920.78 out of date
//   Plaid sync                     last run Jun 18, then 530 transactions
//                                  landed in one lump on Aug 10
//   Stripe webhook, July           endpoint auto-disabled; 8 payments dropped
//   Resend webhook, June           went dark
//
// None were code regressions. Every one returned success while doing nothing.
//
// So this does NOT ask integrations to report in — they would forget, and a
// broken one reports nothing anyway. It asks the DATA when each thing last
// actually worked. A check is a question with an expected answer age; if the
// evidence is older than that, something is wrong regardless of why.
//
// An alert becomes a feedback ticket (the queue Bryce already reads) plus an
// email, throttled so a week-long outage does not send seven identical mails.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL = 'bryce@hhh.services';
const THROTTLE_HOURS = 24;

type Check = {
  id: string;
  label: string;
  maxAgeHours: number;
  /** Returns the timestamp of the most recent SUCCESS, or null if never. */
  lastSuccess: (sb: any, companyId: number) => Promise<string | null>;
  fix: string;
};

const hoursSince = (iso: string | null) =>
  iso == null ? Infinity : (Date.now() - new Date(iso).getTime()) / 3_600_000;

const newest = async (sb: any, table: string, column: string, companyId: number, filter?: (q: any) => any) => {
  let q = sb.from(table).select(column).eq('company_id', companyId).not(column, 'is', null)
    .order(column, { ascending: false }).limit(1);
  if (filter) q = filter(q);
  const { data, error } = await q;
  if (error) throw new Error(`${table}.${column}: ${error.message}`);
  return data?.[0]?.[column] ?? null;
};

const CHECKS: Check[] = [
  {
    id: 'plaid_transactions',
    label: 'Bank transactions importing',
    maxAgeHours: 24 * 4,
    lastSuccess: (sb, c) => newest(sb, 'plaid_transactions', 'created_at', c),
    fix: 'Open Books and press Sync. If nothing imports, the Plaid connection likely needs re-authorising in Settings.',
  },
  {
    id: 'bank_balances',
    label: 'Bank balances refreshing',
    maxAgeHours: 24 * 4,
    lastSuccess: (sb, c) => newest(sb, 'connected_accounts', 'last_synced', c),
    fix: 'Books → Sync refreshes balances. If last_synced stays old, plaid-link get_accounts is failing.',
  },
  {
    id: 'ai_categorization',
    label: 'AI categorising new transactions',
    maxAgeHours: 24 * 7,
    // The Gemini failure exactly: transactions kept arriving, none got a
    // suggestion. Newest transaction that HAS one.
    lastSuccess: (sb, c) => newest(sb, 'plaid_transactions', 'created_at', c, (q: any) => q.not('ai_category', 'is', null)),
    fix: 'Call categorize-transactions with action categorize_batch and read ai_error. Usually the AI key or credits.',
  },
  {
    id: 'payments',
    label: 'Payments recording',
    maxAgeHours: 24 * 10,
    lastSuccess: (sb, c) => newest(sb, 'payments', 'created_at', c),
    fix: 'Check the Stripe webhook endpoint is enabled — it has been auto-disabled before, which silently drops payments.',
  },
  {
    id: 'invoices_sent',
    label: 'Invoices/estimates emailing',
    maxAgeHours: 24 * 10,
    lastSuccess: (sb, c) => newest(sb, 'invoices', 'last_sent_at', c),
    fix: 'Send a test invoice. If email_status never updates, the Resend webhook has gone dark again.',
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const companyId = Number(body.company_id) || 3;
    const dryRun = body.dry_run === true;

    const results: Array<Record<string, unknown>> = [];
    const stale: Array<Record<string, unknown>> = [];

    for (const check of CHECKS) {
      let last: string | null = null;
      let error: string | null = null;
      try {
        last = await check.lastSuccess(sb, companyId);
      } catch (e) {
        error = (e as Error).message;
      }
      const age = hoursSince(last);
      // A check that cannot RUN is itself a failure — silence is what we are
      // trying to eliminate, so a broken probe must not read as healthy.
      const isStale = error != null || age > check.maxAgeHours;
      const row = {
        id: check.id,
        label: check.label,
        last_success: last,
        age_hours: Number.isFinite(age) ? Math.round(age * 10) / 10 : null,
        max_age_hours: check.maxAgeHours,
        ok: !isStale,
        error,
      };
      results.push(row);
      if (isStale) stale.push({ ...row, fix: check.fix });
    }

    if (stale.length > 0 && !dryRun) {
      // Throttle on the exact set that is failing, so a NEW failure alerts
      // immediately even while an old one is still open.
      const kind = 'health:' + stale.map(s => s.id).sort().join(',');
      const since = new Date(Date.now() - THROTTLE_HOURS * 3_600_000).toISOString();
      const { data: recent } = await sb.from('ai_alerts')
        .select('id').eq('kind', kind).gte('created_at', since).limit(1);

      if (!recent?.length) {
        await sb.from('ai_alerts').insert({ kind, detail: JSON.stringify(stale).slice(0, 500) });

        const subject = stale.length === 1
          ? `JobScout: ${stale[0].label} has stopped`
          : `JobScout: ${stale.length} things have stopped working`;
        const lines = stale.map(s =>
          `• ${s.label}\n` +
          `    last worked: ${s.last_success ? `${s.age_hours}h ago (${String(s.last_success).slice(0, 16)})` : 'never'}\n` +
          `    expected at least every ${s.max_age_hours}h\n` +
          (s.error ? `    the check itself failed: ${s.error}\n` : '') +
          `    ${s.fix}`,
        ).join('\n\n');
        const message =
          `Automatic health check.\n\n${lines}\n\n` +
          `Healthy: ${results.filter(r => r.ok).map(r => r.label).join(', ') || 'none'}\n\n` +
          `This is measured from the DATA — when each thing last actually produced a result — not from whether a job reported success. ` +
          `Throttled to once per ${THROTTLE_HOURS}h per combination of failures.`;

        await sb.from('feedback').insert({
          company_id: companyId,
          user_email: 'system@jobscout',
          page_url: '/books',
          feedback_type: 'bug',
          subject,
          message,
          status: 'new',
        });

        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-feedback-reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          },
          body: JSON.stringify({
            recipient_email: ADMIN_EMAIL,
            subject,
            original_message: 'Automated health check',
            reply_message: message,
            feedback_type: 'bug',
          }),
        }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({
      checked: results.length,
      stale: stale.length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
