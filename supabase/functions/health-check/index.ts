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

// ── Conditions ────────────────────────────────────────────────────────────
//
// The checks above ask "when did this last work?" — the right question for
// something that silently stops. Some failures are not a stopped heartbeat but
// a state that is simply wrong right now, and an account locked out is the one
// we have already been bitten by: Antonino Lawn Care sat read-only from
// 2026-06-08 to 2026-08-10, and we found out from a photograph of an error
// dialog. The account least able to report it is exactly the one it happens to.
//
// These are platform-wide, not per-tenant, so they ignore the company_id above.

type Condition = {
  id: string;
  label: string;
  /** null when fine, otherwise a sentence naming what is wrong. */
  problem: (sb: any) => Promise<string | null>;
  fix: string;
};

const ENDING_SOON_DAYS = 7;

const daysUntil = (iso: string | null) =>
  iso == null ? Infinity : Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** Ask the gate itself, never a copy of its rules. */
const accounts = async (sb: any) => {
  const { data, error } = await sb.rpc('account_access_report');
  if (error) throw new Error(`account_access_report: ${error.message}`);
  return data ?? [];
};

const CONDITIONS: Condition[] = [
  {
    id: 'accounts_read_only',
    label: 'Customer accounts able to work',
    problem: async (sb) => {
      // Only accounts with people in them: an empty company being read-only is
      // bookkeeping, not somebody sitting there unable to do their job.
      const locked = (await accounts(sb)).filter((a: any) => !a.can_write && a.active_users > 0);
      if (locked.length === 0) return null;
      return locked.map((a: any) =>
        `${a.company_name} (company ${a.company_id}) is read-only — ${a.billing_status}` +
        `${a.trial_ends_at ? `, since ${String(a.trial_ends_at).slice(0, 10)}` : ''}` +
        `. ${a.active_users} ${a.active_users === 1 ? 'person' : 'people'} cannot change anything.`,
      ).join('\n    ');
    },
    fix: 'npx vite-node scripts/reopen-trial.mjs <companyId> --approve  (or take the payment)',
  },
  {
    id: 'payroll_tax_year',
    label: 'Payroll tax tables current',
    // Bryce: "payroll taxes dont match gusto's". The method matches Pub 15-T,
    // the same one Gusto uses — but the brackets are stamped with a year, and
    // nothing announced when that year passed. A wrong tax figure is the kind
    // that gets filed before anyone checks it.
    problem: async (sb) => {
      const { data, error } = await sb.from('settings').select('value').eq('key', 'payroll_tax_year').maybeSingle();
      if (error) throw new Error(`settings: ${error.message}`);
      // The app's tables are stamped in code; the year they claim is mirrored
      // here so this check can see it without importing the app bundle.
      const tableYear = Number(data?.value) || 2025;
      const now = new Date().getFullYear();
      if (now <= tableYear) return null;
      return `Payroll tax tables are ${tableYear}; it is ${now}. Federal withholding and state wage bases ` +
        `will not match a current-year provider such as Gusto. FICA rates are unchanged and should still agree.`;
    },
    fix: 'Update the brackets and wage bases in src/lib/payrollTax.js, bump TAX_YEAR, and set the payroll_tax_year setting to match.',
  },
  {
    id: 'trials_ending_soon',
    label: 'Trials with time left on them',
    // The point is to act BEFORE someone is locked out. Finding out afterwards
    // is what already cost us two months of a tester's time.
    problem: async (sb) => {
      const soon = (await accounts(sb))
        .filter((a: any) => a.can_write && a.billing_status === 'trialing' && a.active_users > 0)
        .map((a: any) => ({ ...a, days: daysUntil(a.trial_ends_at) }))
        .filter((a: any) => a.days <= ENDING_SOON_DAYS)
        .sort((a: any, b: any) => a.days - b.days);
      if (soon.length === 0) return null;
      return soon.map((a: any) =>
        `${a.company_name} (company ${a.company_id}) goes read-only in ${a.days} ` +
        `${a.days === 1 ? 'day' : 'days'}, on ${String(a.trial_ends_at).slice(0, 10)} — ` +
        `${a.active_users} active ${a.active_users === 1 ? 'user' : 'users'}.`,
      ).join('\n    ');
    },
    fix: 'Convert them, or extend: npx vite-node scripts/reopen-trial.mjs <companyId> --days 30 --approve',
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

    for (const condition of CONDITIONS) {
      let detail: string | null = null;
      let error: string | null = null;
      try {
        detail = await condition.problem(sb);
      } catch (e) {
        error = (e as Error).message;
      }
      // Same rule as above: a condition that cannot be evaluated counts as
      // failing, or a broken probe would quietly read as "all fine".
      const isBad = error != null || detail != null;
      const row = {
        id: condition.id,
        label: condition.label,
        last_success: null,
        age_hours: null,
        max_age_hours: null,
        detail,
        ok: !isBad,
        error,
      };
      results.push(row);
      if (isBad) stale.push({ ...row, fix: condition.fix });
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
          // A stopped heartbeat is described by when it last beat; a wrong
          // state describes itself. Showing "last worked: never" for an account
          // that is locked out would be noise dressed up as a measurement.
          (s.detail
            ? `    ${s.detail}\n`
            : `    last worked: ${s.last_success ? `${s.age_hours}h ago (${String(s.last_success).slice(0, 16)})` : 'never'}\n` +
              `    expected at least every ${s.max_age_hours}h\n`) +
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
