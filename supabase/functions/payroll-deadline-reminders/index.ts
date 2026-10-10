// payroll-deadline-reminders
// =====================================================================
// Daily, every tenant: email the company's admins what payroll tax is due
// in the next three days or already late, so a deposit is never missed
// because nobody opened the Inbox.
//
// Bryce, 2026-10-10. HHH's Sep 20 run was due at EFTPS on Sep 23 and was
// paid Oct 10, because everyone believed Gusto had it. Gusto never saw
// that run. JobScout knew the due date all along and said nothing outside
// the Inbox. Now it writes.
//
// Skips liabilities a third party remits (notes beginning "Gusto remits")
// and anything with no amount. Sends at most one email per company per
// day; an overdue amount is repeated every day until it is marked paid,
// on purpose — the penalty grows every day too.
//
// Scheduled by pg_cron at 13:00 UTC (7am Mountain); body may carry
// { company_id } to run for one company, { dry_run: true, days: 30 } to preview a wider window.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const KIND_LABEL: Record<string, string> = {
  federal_income_tax: 'Federal income tax withheld',
  social_security: 'Social Security (both halves)',
  medicare: 'Medicare (both halves)',
  futa: 'Federal unemployment (FUTA)',
  state_income_tax: 'State income tax withheld',
  sui: 'State unemployment (SUI)',
  state_famli: 'Colorado FAMLI premiums',
};
const HOW: Record<string, string> = {
  federal_income_tax: 'eftps.gov', social_security: 'eftps.gov', medicare: 'eftps.gov', futa: 'eftps.gov',
};
const money = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDate = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SITE_URL = Deno.env.get('SITE_URL') || 'https://jobscout.appsannex.com';
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const only = body.company_id ? Number(body.company_id) : null;
    const dryRun = body.dry_run === true;
    const today = todayIso();
    const horizon = addDays(today, Math.min(60, Math.max(0, Number(body.days) || 3)));   // days: widen for a preview

    let q = sb.from('payroll_tax_liabilities')
      .select('id, company_id, payroll_run_id, jurisdiction, agency, kind, amount_total, due_date, notes')
      .is('paid_at', null).gt('amount_total', 0).lte('due_date', horizon).order('due_date');
    if (only) q = q.eq('company_id', only);
    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 500);
    const due = (rows || []).filter((r: any) => !/^gusto remits/i.test(String(r.notes || '')));
    const byCompany: Record<number, any[]> = {};
    for (const r of due) (byCompany[r.company_id] = byCompany[r.company_id] || []).push(r);

    const out: Array<Record<string, unknown>> = [];
    for (const [cidStr, items] of Object.entries(byCompany)) {
      const cid = Number(cidStr);
      const [{ data: company }, { data: admins }, { data: state }] = await Promise.all([
        sb.from('companies').select('id, company_name, legal_name, owner_email, active').eq('id', cid).maybeSingle(),
        sb.from('employees').select('email, name, is_admin, role, user_role').eq('company_id', cid).eq('active', true).not('email', 'is', null),
        sb.from('settings').select('value').eq('company_id', cid).eq('key', 'payroll_reminder_state').maybeSingle(),
      ]);
      if (!company || company.active === false) continue;
      // The demo and sandbox tenants have made-up mailboxes; a daily bounce would hurt the sending domain.
      if (/demo|sandbox/i.test(String(company.company_name || '')) || /^demo@/i.test(String(company.owner_email || ''))) { out.push({ company_id: cid, skipped: 'demo tenant' }); continue; }
      const last = (() => { try { return JSON.parse(state?.value || '{}'); } catch { return {}; } })();
      if (!dryRun && last.sent_on === today) { out.push({ company_id: cid, skipped: 'already sent today' }); continue; }

      const recipients = new Set<string>();
      if (company.owner_email) recipients.add(String(company.owner_email).toLowerCase());
      for (const e of admins || []) {
        const isAdmin = e.is_admin === true || ['Admin', 'admin', 'Owner', 'owner'].includes(e.user_role) || ['Admin', 'Owner'].includes(e.role);
        if (isAdmin && e.email) recipients.add(String(e.email).toLowerCase());
      }
      if (!recipients.size) { out.push({ company_id: cid, skipped: 'no admin email' }); continue; }

      // One line per (due date, agency, how to pay); the kinds listed under it.
      const groups: Record<string, any> = {};
      for (const r of items) {
        const key = `${r.due_date}|${r.agency || r.jurisdiction}`;
        groups[key] = groups[key] || { due: r.due_date, agency: r.agency || r.jurisdiction, how: HOW[r.kind] || (r.jurisdiction === 'state' ? 'your state tax portal' : 'the agency'), amount: 0, kinds: [] as string[] };
        groups[key].amount += Number(r.amount_total) || 0;
        groups[key].kinds.push(KIND_LABEL[r.kind] || r.kind);
      }
      const lines = Object.values(groups).sort((a: any, b: any) => a.due.localeCompare(b.due));
      const overdue = lines.filter((l: any) => l.due < today);
      const total = lines.reduce((s: number, l: any) => s + l.amount, 0);
      const name = company.company_name || company.legal_name || 'your company';
      const subject = overdue.length
        ? `OVERDUE: ${money(overdue.reduce((s: number, l: any) => s + l.amount, 0))} of payroll tax is past due — ${name}`
        : `Payroll tax due by ${fmtDate(lines[0].due)}: ${money(total)} — ${name}`;
      const rowsHtml = lines.map((l: any) => {
        const d = daysBetween(today, l.due);
        const when = d < 0 ? `<b style="color:#b91c1c">${-d} day${-d === 1 ? '' : 's'} late</b>` : d === 0 ? '<b>due today</b>' : `due ${fmtDate(l.due)}`;
        return `<tr>
          <td style="padding:8px 12px 8px 0;vertical-align:top"><b>${l.agency}</b><br><span style="color:#5d6a5e;font-size:12.5px">${[...new Set(l.kinds)].join(', ')}</span><br><span style="color:#5d6a5e;font-size:12.5px">Pay at ${l.how}</span></td>
          <td style="padding:8px 0;text-align:right;vertical-align:top;white-space:nowrap"><b>${money(l.amount)}</b><br><span style="font-size:12.5px">${when}</span></td></tr>`;
      }).join('');
      const html = `
        <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#20261c">
          <h2 style="margin:0 0 4px;font-size:19px">${overdue.length ? 'Payroll tax is past due' : 'Payroll tax coming due'}</h2>
          <p style="margin:0 0 14px;color:#5d6a5e">${name} · JobScout calculated these from your payroll runs. JobScout does not send the money.</p>
          <table style="border-collapse:collapse;width:100%;font-size:14.5px">${rowsHtml}
            <tr><td style="padding:10px 12px 0 0;border-top:1px solid #d6cdb8"><b>Total</b></td><td style="padding:10px 0 0;border-top:1px solid #d6cdb8;text-align:right"><b>${money(total)}</b></td></tr>
          </table>
          <p style="margin:18px 0 0;font-size:14px">After you pay, open the <a href="${SITE_URL}/payroll/inbox">Payroll Inbox</a> and mark each one remitted with its confirmation number. This reminder stops when it is marked.</p>
          ${overdue.length ? '<p style="margin:12px 0 0;font-size:13px;color:#b91c1c">A late federal deposit costs 2% in the first 5 days, 5% through day 15, and 10% after that, plus interest. Paying today is cheaper than tomorrow.</p>' : ''}
        </div>`;

      if (dryRun) { out.push({ company_id: cid, to: [...recipients], subject, lines }); continue; }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ to: [...recipients], from: 'JobScout Payroll <payroll@appsannex.com>', subject, html }),
      });
      const res = await r.json().catch(() => ({}));
      const ok = r.ok && res?.success !== false && !res?.error;
      if (ok) {
        await sb.from('settings').upsert({ company_id: cid, key: 'payroll_reminder_state', value: JSON.stringify({ sent_on: today, total, lines: lines.length }) }, { onConflict: 'company_id,key' });
      }
      out.push({ company_id: cid, to: [...recipients], subject, sent: ok, error: ok ? null : (res?.error || r.status) });
    }
    return json({ ok: true, today, companies: out.length, results: out });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
