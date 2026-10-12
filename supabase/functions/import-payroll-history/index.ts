// import-payroll-history
// =====================================================================
// Bring a company's earlier-this-year payroll into JobScout from whatever
// paid it before: Gusto, QuickBooks, ADP, a spreadsheet. Year-to-date,
// the wage caps, the 941 and the W-2s all need every check of the year,
// not just the ones JobScout ran.
//
// Bryce, 2026-10-12: Antonino is the first tenant who has to leave Gusto
// without Bryce running a script. The Payroll setup page parses the
// provider's export in the browser, maps the columns, and sends plain
// rows here. This matches people by name, groups checks into runs, fills
// what the file did not carry (Social Security and Medicare at their
// rates), writes runs + stubs + liabilities, and refuses duplicates.
//
// Admin-gated by the caller's JWT. Body:
//   { company_id, provider, rows: [{ employee_name, pay_date, period_start,
//     period_end, gross, fit, sit, ss_ee, med_ee, net, suta, futa }],
//     taxes_remitted: true, create_missing: false, dry_run: true }
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
const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

function jwtEmail(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return (payload?.email || '').toLowerCase() || null;
  } catch { return null; }
}

// Dates arrive as whatever the export used: 2026-03-05, 03/05/2026, 3/5/26.
function isoDate(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
const money = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? r2(n) : null;
};
const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const quarterDue = (d: string) => { const dt = new Date(d + 'T00:00:00Z'); const q = Math.floor(dt.getUTCMonth() / 3); const end = new Date(Date.UTC(dt.getUTCFullYear(), q * 3 + 3, 0)); const due = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)); return due.toISOString().slice(0, 10); };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const companyId = Number(body.company_id);
    const provider = String(body.provider || 'previous payroll provider').slice(0, 60);
    const rowsIn: any[] = Array.isArray(body.rows) ? body.rows : [];
    const taxesRemitted = body.taxes_remitted !== false;
    const createMissing = body.create_missing === true;
    const dryRun = body.dry_run !== false;
    if (!companyId || !rowsIn.length) return json({ error: 'company_id and rows are required' }, 400);

    // Only an admin of this company.
    const email = jwtEmail(req);
    if (!email) return json({ error: 'Sign in first.' }, 401);
    const { data: me } = await sb.from('employees').select('role, user_role, is_admin, is_developer').ilike('email', email).eq('active', true).eq('company_id', companyId).limit(1);
    const m = me?.[0];
    const admin = !!m && (m.is_developer === true || m.is_admin === true || ['Admin', 'admin', 'Owner', 'owner'].includes(m.user_role) || ['Admin', 'Owner'].includes(m.role));
    if (!admin) return json({ error: 'Only a company admin can import payroll history.' }, 403);

    const [{ data: company }, { data: employees }] = await Promise.all([
      sb.from('companies').select('id, state, state_employer_id_state').eq('id', companyId).maybeSingle(),
      sb.from('employees').select('id, name, tax_classification, is_hourly, is_salary, hourly_rate, active').eq('company_id', companyId),
    ]);
    const state = String(company?.state_employer_id_state || company?.state || 'UT').toUpperCase();
    const emps: any[] = employees || [];
    const findEmp = (raw: string) => {
      const s = String(raw || '').trim();
      if (!s) return null;
      const flipped = s.includes(',') ? s.split(',').map(x => x.trim()).reverse().join(' ') : null;
      const parts = s.split(/\s+/);
      const swapped = parts.length >= 2 ? [...parts.slice(1), parts[0]].join(' ') : null;
      for (const cand of [s, flipped, swapped]) {
        if (!cand) continue;
        const e = emps.find(x => norm(x.name) === norm(cand));
        if (e) return e;
      }
      return null;
    };

    // ── Normalize the rows ──────────────────────────────────────────────
    const warnings: string[] = [];
    const unmatched = new Set<string>();
    const checks: any[] = [];
    for (const [i, r] of rowsIn.entries()) {
      const payDate = isoDate(r.pay_date);
      const gross = money(r.gross);
      if (!payDate || gross == null) { warnings.push(`Row ${i + 1}: needs a pay date and a gross amount`); continue; }
      if (gross === 0 && !money(r.net)) continue;
      const emp = findEmp(r.employee_name);
      if (!emp) { unmatched.add(String(r.employee_name || '').trim() || `(row ${i + 1})`); }
      const ss = money(r.ss_ee) ?? r2(gross * 0.062);
      const med = money(r.med_ee) ?? r2(gross * 0.0145);
      const fit = money(r.fit); const sit = money(r.sit);
      if (fit == null) warnings.push(`Row ${i + 1} (${r.employee_name}): no federal withholding column — recorded as 0`);
      if (sit == null) warnings.push(`Row ${i + 1} (${r.employee_name}): no state withholding column — recorded as 0`);
      const eeTax = r2((fit || 0) + (sit || 0) + ss + med);
      const net = money(r.net) ?? r2(gross - eeTax);
      checks.push({
        emp, name: String(r.employee_name || '').trim(), payDate,
        periodStart: isoDate(r.period_start) || payDate, periodEnd: isoDate(r.period_end) || payDate,
        gross, fit: fit || 0, sit: sit || 0, ss, med, net,
        suta: money(r.suta) ?? 0, futa: money(r.futa) ?? 0,
        deductions: Math.max(0, r2(gross - eeTax - net)),
      });
    }

    // People the file names that JobScout does not have.
    const created: string[] = [];
    if (createMissing && unmatched.size && !dryRun) {
      for (const name of [...unmatched]) {
        const { data: e, error } = await sb.from('employees').insert({ company_id: companyId, name, tax_classification: 'W2', active: false, is_hourly: true, hourly_rate: 0, role: `Former employee (imported from ${provider})` }).select('id, name, tax_classification, is_hourly, is_salary, hourly_rate, active').single();
        if (error) { warnings.push(`${name}: could not be created (${error.message})`); continue; }
        emps.push(e); created.push(name); unmatched.delete(name);
        for (const c of checks) if (!c.emp && norm(c.name) === norm(name)) c.emp = e;
      }
    }

    // Duplicates: a stub already on file for the same person, pay date and period.
    const { data: existing } = await sb.from('paystubs').select('employee_id, pay_date, period_start, gross_pay').eq('company_id', companyId);
    const have = new Set((existing || []).map((s: any) => `${s.employee_id}|${s.pay_date}|${s.period_start}|${r2(s.gross_pay)}`));
    let dupes = 0;
    const usable = checks.filter(c => {
      if (!c.emp) return false;
      if (have.has(`${c.emp.id}|${c.payDate}|${c.periodStart}|${c.gross}`)) { dupes++; return false; }
      return true;
    });

    // Group into runs by pay date + period.
    const runs: Record<string, any> = {};
    for (const c of usable) {
      const k = `${c.payDate}|${c.periodStart}|${c.periodEnd}`;
      (runs[k] = runs[k] || { payDate: c.payDate, periodStart: c.periodStart, periodEnd: c.periodEnd, checks: [] }).checks.push(c);
    }
    const runList = Object.values(runs).sort((a: any, b: any) => a.payDate.localeCompare(b.payDate));
    const sum = (arr: any[], k: string) => r2(arr.reduce((s, x) => s + (Number(x[k]) || 0), 0));
    const summary = {
      runs: runList.map((r: any) => ({ payDate: r.payDate, periodStart: r.periodStart, periodEnd: r.periodEnd, checks: r.checks.length, gross: sum(r.checks, 'gross'), net: sum(r.checks, 'net'), fit: sum(r.checks, 'fit'), sit: sum(r.checks, 'sit') })),
      totals: { checks: usable.length, gross: sum(usable, 'gross'), net: sum(usable, 'net'), fit: sum(usable, 'fit'), sit: sum(usable, 'sit'), ss: sum(usable, 'ss'), med: sum(usable, 'med') },
      skipped_duplicates: dupes,
      unmatched: [...unmatched],
      warnings: warnings.slice(0, 40),
      created,
    };
    if (dryRun) return json({ ok: true, dry_run: true, ...summary });
    if (!usable.length) return json({ error: 'Nothing to import: every row was a duplicate or named someone JobScout does not have.', ...summary }, 400);

    // ── Write ─────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const reason = `Imported from ${provider} ${today}`;
    let runsMade = 0, stubsMade = 0, liabMade = 0;
    for (const r of runList as any[]) {
      const { data: run, error: runErr } = await sb.from('payroll_runs').insert({
        company_id: companyId, period_start: r.periodStart, period_end: r.periodEnd, pay_date: r.payDate,
        status: 'completed', total_gross: sum(r.checks, 'gross'), employee_count: r.checks.length, created_by: null,
      }).select('id').single();
      if (runErr) return json({ error: `Run ${r.payDate}: ${runErr.message}`, runsMade, stubsMade });
      runsMade++;
      const stubs = r.checks.map((c: any) => ({
        company_id: companyId, employee_id: c.emp.id, payroll_run_id: run.id,
        period_start: c.periodStart, period_end: c.periodEnd, pay_date: c.payDate,
        regular_hours: c.emp.is_hourly && Number(c.emp.hourly_rate) > 0 ? r2(c.gross / Number(c.emp.hourly_rate)) : 0,
        overtime_hours: 0, pto_hours: 0, hourly_rate: Number(c.emp.hourly_rate) || 0,
        salary_amount: c.emp.is_salary ? c.gross : 0,
        gross_pay: c.gross, taxable_wages: c.gross, bonus_pay: 0, commission_pay: 0, reimbursement_pay: 0,
        federal_income_tax: c.fit, state_income_tax: c.sit,
        social_security_employee: c.ss, social_security_employer: c.ss,
        medicare_employee: c.med, medicare_employer: c.med, additional_medicare: 0,
        futa: c.futa, sui: c.suta, famli_employee: 0, famli_employer: 0,
        pre_tax_deductions: 0, post_tax_deductions: c.deductions, net_pay: c.net,
        amendment_reason: reason,
      }));
      const { error: stubErr } = await sb.from('paystubs').insert(stubs);
      if (stubErr) return json({ error: `Stubs for ${r.payDate}: ${stubErr.message}`, runsMade, stubsMade });
      stubsMade += stubs.length;
      const paid = taxesRemitted ? { paid_at: r.payDate + 'T12:00:00Z', paid_via: 'other', notes: `Remitted by ${provider} (imported)` } : { paid_at: null, paid_via: null, notes: `Imported from ${provider}; not marked paid` };
      const stamp = { company_id: companyId, payroll_run_id: run.id, period_start: r.periodStart, period_end: r.periodEnd, ...paid };
      const agencyW = state === 'UT' ? 'Utah State Tax Commission' : state === 'CO' ? 'Colorado Dept. of Revenue' : 'State';
      const agencyU = state === 'UT' ? 'Utah DWS' : state === 'CO' ? 'Colorado CDLE' : 'State Unemployment';
      const li = [
        { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'federal_income_tax', due_date: r.payDate, amount_employee: sum(r.checks, 'fit'), amount_employer: 0 },
        { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'social_security', due_date: r.payDate, amount_employee: sum(r.checks, 'ss'), amount_employer: sum(r.checks, 'ss') },
        { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'medicare', due_date: r.payDate, amount_employee: sum(r.checks, 'med'), amount_employer: sum(r.checks, 'med') },
        { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'futa', due_date: quarterDue(r.payDate), amount_employee: 0, amount_employer: sum(r.checks, 'futa') },
        { ...stamp, jurisdiction: 'state', agency: agencyW, kind: 'state_income_tax', due_date: quarterDue(r.payDate), amount_employee: sum(r.checks, 'sit'), amount_employer: 0 },
        { ...stamp, jurisdiction: 'state', agency: agencyU, kind: 'sui', due_date: quarterDue(r.payDate), amount_employee: 0, amount_employer: sum(r.checks, 'suta') },
      ].filter(x => x.amount_employee + x.amount_employer > 0);
      if (li.length) { const { error: liErr } = await sb.from('payroll_tax_liabilities').insert(li); if (!liErr) liabMade += li.length; else warnings.push(`Liabilities for ${r.payDate}: ${liErr.message}`); }
    }
    return json({ ok: true, dry_run: false, imported: { runs: runsMade, stubs: stubsMade, liabilities: liabMade }, ...summary, warnings: warnings.slice(0, 40) });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
