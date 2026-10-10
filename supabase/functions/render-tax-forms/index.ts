// render-tax-forms
// =====================================================================
// Year-end + quarterly tax form generator. Renders W-2 / W-3 / 1099-NEC
// / 1096 / 941 / 940 PDFs from the canonical paystubs +
// payroll_tax_liabilities tables, uploads them to
// project-documents/tax-filings/, and inserts payroll_tax_filings rows
// so the Inbox can track them.
//
// Body: { company_id, kind: 'w2'|'w3'|'1099_nec'|'1096'|'941'|'940', year, quarter? }
//   - kind='w2' renders ONE W-2 PDF per active W-2 employee with YTD
//     paystub totals + the company W-3 in a single function call.
//   - kind='1099_nec' renders ONE 1099-NEC per active 1099 contractor
//     with YTD ≥ $600 + the 1096 transmittal.
//   - kind='941' takes year+quarter, aggregates federal liabilities for
//     that quarter, renders Form 941. (Future sprint.)
//   - kind='940' takes year, aggregates FUTA, renders Form 940. (Future.)
//
// All PDFs are JobScout-rendered representations of the official IRS
// forms (same values, same audit trail). Approach mirrors the
// onboarding PDFs — captures the same data without form-shape
// licensing concerns.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { company_id, kind, year, quarter } = await req.json().catch(() => ({}));
    if (!company_id || !kind || !year) {
      return json({ error: 'company_id, kind, year required' }, 400);
    }
    if (kind === '941' && (!quarter || quarter < 1 || quarter > 4)) {
      return json({ error: '941 requires quarter (1-4)' }, 400);
    }

    // Load company once — used by every form for header + EIN.
    const { data: company, error: coErr } = await supabase
      .from('companies')
      // The SUI columns were missing here, so Form 33H always answered "set your
      // DWS account number" even when it was set — it was reading undefined.
      .select('company_name, legal_name, ein, address, city, state, zip, phone, owner_email, bso_user_id, federal_deposit_schedule, state_employer_id, state_employer_id_state, sui_account_number, sui_rate_pct, sui_wage_base, sui_rate_source, sui_rate_effective_date, futa_rate_pct')
      .eq('id', company_id)
      .single();
    if (coErr || !company) return json({ error: 'company not found' }, 404);
    if (!company.ein) return json({ error: 'Set EIN in Settings → Payroll Tax / Compliance before generating tax forms.' }, 400);

    // A W-2 carries the full SSN. decrypt_ssn_for_payroll_admin checks the
    // CALLER's email against the company's admins, so it is called with the
    // caller's own token, not the service role.
    const callerAuth = req.headers.get('Authorization') || '';
    const userSb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: callerAuth } }, auth: { autoRefreshToken: false, persistSession: false } });
    const ssnFor = async (employeeId: number): Promise<string | null> => {
      const { data, error } = await userSb.rpc('decrypt_ssn_for_payroll_admin', { p_employee_id: employeeId });
      if (error) { console.warn('ssn decrypt', employeeId, error.message); return null; }
      return data ? String(data) : null;
    };

    if (kind === 'w2') {
      const result = await generateW2Set({ supabase, company_id, company, year, ssnFor });
      return json(result);
    }
    if (kind === 'efw2') {
      const result = await generateEFW2({ supabase, company_id, company, year, ssnFor });
      return json(result);
    }
    if (kind === '1099_nec') {
      const result = await generate1099Set({ supabase, company_id, company, year });
      return json(result);
    }
    if (kind === '941') {
      const result = await generate941({ supabase, company_id, company, year, quarter });
      return json(result);
    }
    if (kind === '940') {
      const result = await generate940({ supabase, company_id, company, year });
      return json(result);
    }
    if (kind === 'tc941') {
      if (!quarter || quarter < 1 || quarter > 4) return json({ error: 'TC-941 requires quarter (1-4)' }, 400);
      const result = await generateTC941({ supabase, company_id, company, year, quarter });
      return json(result);
    }
    if (kind === 'form33h') {
      if (!quarter || quarter < 1 || quarter > 4) return json({ error: 'Form 33H requires quarter (1-4)' }, 400);
      const result = await generateForm33H({ supabase, company_id, company, year, quarter });
      return json(result);
    }

    return json({ error: `kind '${kind}' not yet implemented` }, 400);
  } catch (err) {
    console.error('[render-tax-forms] crashed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

// =====================================================================
// W-2 / W-3 set
// =====================================================================
const SS_WAGE_BASE: Record<number, number> = { 2024: 168600, 2025: 176100, 2026: 184500 };
const SS_RATE = 0.062, MED_RATE = 0.0145;
// FIPS numeric state codes, for the EFW2 RS record.
const STATE_FIPS: Record<string, string> = { AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56' };

// Everything a W-2 needs, per employee, from the year's paystubs. The PDFs,
// the W-3 and the EFW2 file all read this one result, so they cannot
// disagree with each other.
async function collectW2Ytd({ supabase, company_id, company, year, ssnFor }: any) {
  const yearStart = `${year}-01-01`, yearEnd = `${year}-12-31`;
  const { data: employees } = await supabase
    .from('employees')
    .select('id, name, email, ssn_last4, ssn_encrypted, home_address, home_city, home_state, home_zip, tax_classification')
    .eq('company_id', company_id)
    .or('tax_classification.eq.W2,tax_classification.is.null');
  const list = employees || [];
  if (!list.length) return { employees: [], ytd: {}, problems: [] };
  const { data: paystubs } = await supabase
    .from('paystubs')
    .select('employee_id, gross_pay, taxable_wages, federal_income_tax, state_income_tax, social_security_employee, medicare_employee, additional_medicare, famli_employee, pre_tax_deductions')
    .eq('company_id', company_id)
    .in('employee_id', list.map((e: any) => e.id))
    .gte('pay_date', yearStart)
    .lte('pay_date', yearEnd);
  const base = SS_WAGE_BASE[year] || SS_WAGE_BASE[2026];
  const ytd: Record<number, any> = {};
  for (const e of list) ytd[e.id] = { wages: 0, gross: 0, fit: 0, sit: 0, ss_emp: 0, med_emp: 0, addl_med: 0, famli: 0, pretax: 0, ss_wages: 0, med_wages: 0, state: '' };
  for (const ps of paystubs || []) {
    const t = ytd[ps.employee_id];
    if (!t) continue;
    t.gross    += Number(ps.gross_pay) || 0;
    t.wages    += Number(ps.taxable_wages || ps.gross_pay) || 0;
    t.fit      += Number(ps.federal_income_tax) || 0;
    t.sit      += Number(ps.state_income_tax) || 0;
    t.ss_emp   += Number(ps.social_security_employee) || 0;
    t.med_emp  += Number(ps.medicare_employee) || 0;
    t.addl_med += Number(ps.additional_medicare) || 0;
    t.famli    += Number(ps.famli_employee) || 0;
    t.pretax   += Number(ps.pre_tax_deductions) || 0;
  }
  const problems: string[] = [];
  const out: any[] = [];
  for (const e of list) {
    const t = ytd[e.id];
    for (const k of Object.keys(t)) if (typeof t[k] === 'number') t[k] = round2(t[k]);
    if (t.wages <= 0) continue;
    // Boxes 3 and 5. With no pre-tax deductions they are box 1 (box 3 stops
    // at the wage base). With pre-tax deductions a 401(k) is in box 1 but
    // not 3/5 and health is in none of them, and the engine already taxed
    // the right amount — so read the wages back from the tax it took.
    t.med_wages = t.pretax > 0 ? round2(t.med_emp / MED_RATE) : t.wages;
    t.ss_wages  = Math.min(base, t.pretax > 0 ? round2(t.ss_emp / SS_RATE) : t.wages);
    t.state = String(e.home_state || company.state_employer_id_state || company.state || '').toUpperCase();
    const name = String(e.name || '').trim();
    let ssn: string | null = null;
    if (e.ssn_encrypted) {
      ssn = ssnFor ? await ssnFor(e.id) : null;
      if (!ssn) problems.push(`${name}: SSN is on file but could not be read (only a payroll admin can generate W-2s)`);
    } else problems.push(`${name}: no SSN on file`);
    if (!e.home_address || !e.home_city || !e.home_zip) problems.push(`${name}: home address is incomplete`);
    if (!name.includes(' ')) problems.push(`${name}: needs a first and last name`);
    out.push({ ...e, name, ssn: ssn ? String(ssn).replace(/\D/g, '') : null });
  }
  return { employees: out, ytd, problems };
}

async function generateW2Set({ supabase, company_id, company, year, ssnFor }: any) {
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;
  const { employees: w2Employees, ytd, problems } = await collectW2Ytd({ supabase, company_id, company, year, ssnFor });
  if (w2Employees.length === 0) return { ok: true, generated: 0, employees: 0, problems };

  const generated: any[] = [];
  for (const emp of w2Employees) {
    const t = ytd[emp.id];
    const pdfBytes = await renderW2Pdf({ company, emp, year, t });
    const fname = safeName(`W2-${year}-${emp.id}-${Date.now()}.pdf`);
    const path  = `tax-filings/${company_id}/${year}/${fname}`;
    const { error: upErr } = await supabase.storage
      .from('project-documents')
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) { console.warn('w2 upload failed for emp', emp.id, upErr.message); continue; }

    await supabase
      .from('payroll_tax_filings')
      .update({ status: 'superseded' })
      .eq('company_id', company_id)
      .eq('form_kind', 'W-2')
      .eq('employee_id', emp.id)
      .eq('period_start', yearStart)
      .neq('status', 'superseded');

    const { data: filing } = await supabase
      .from('payroll_tax_filings')
      .insert({
        company_id,
        form_kind: 'W-2',
        jurisdiction: 'federal',
        period_start: yearStart,
        period_end: yearEnd,
        employee_id: emp.id,
        pdf_storage_path: path,
        values_snapshot: { ytd: t, employee: { name: emp.name, ssn_last4: emp.ssn_last4 } },
        status: 'draft',
      })
      .select('id, pdf_storage_path')
      .single();
    generated.push({ employee_id: emp.id, name: emp.name, filing_id: filing?.id, path });
  }

  // W-3 — the sum of every W-2 above.
  const totals = { wages: 0, fit: 0, sit: 0, ss_wages: 0, ss_emp: 0, med_wages: 0, med_emp: 0, addl_med: 0, count: w2Employees.length };
  for (const e of w2Employees) {
    const t = ytd[e.id];
    totals.wages += t.wages; totals.fit += t.fit; totals.sit += t.sit;
    totals.ss_wages += t.ss_wages; totals.ss_emp += t.ss_emp;
    totals.med_wages += t.med_wages; totals.med_emp += t.med_emp; totals.addl_med += t.addl_med;
  }
  for (const k of Object.keys(totals)) (totals as any)[k] = round2((totals as any)[k]);
  const w3Bytes = await renderW3Pdf({ company, year, totals });
  const w3Path = `tax-filings/${company_id}/${year}/W3-${year}-${Date.now()}.pdf`;
  await supabase.storage.from('project-documents').upload(w3Path, w3Bytes, { contentType: 'application/pdf', upsert: true });

  await supabase
    .from('payroll_tax_filings')
    .update({ status: 'superseded' })
    .eq('company_id', company_id)
    .eq('form_kind', 'W-3')
    .eq('period_start', yearStart)
    .neq('status', 'superseded');

  await supabase
    .from('payroll_tax_filings')
    .insert({
      company_id, form_kind: 'W-3', jurisdiction: 'federal',
      period_start: yearStart, period_end: yearEnd,
      pdf_storage_path: w3Path,
      values_snapshot: { totals, problems },
      status: 'draft',
    });

  return { ok: true, generated: generated.length, employees: w2Employees.length, w2s: generated, w3_path: w3Path, totals, problems };
}

// =====================================================================
// EFW2 — the file SSA Business Services Online takes for W-2 Copy A, and
// Utah TAP takes for its W-2 upload (the RS records). Fixed 512-character
// records: RA submitter, RE employer, RW + RS per employee, RT totals,
// RF final. Run it through SSA's AccuWage Online before submitting: a
// layout error there costs nothing; a rejected file on Jan 31 does.
// =====================================================================
async function generateEFW2({ supabase, company_id, company, year, ssnFor }: any) {
  const yearStart = `${year}-01-01`, yearEnd = `${year}-12-31`;
  const { employees, ytd, problems } = await collectW2Ytd({ supabase, company_id, company, year, ssnFor });
  if (!employees.length) return { ok: false, error: 'No W-2 wages this year.' };
  // Alpha fields: upper case, left-justified, space-filled. Money: cents,
  // right-justified, zero-filled, no sign or point.
  const A = (v: any, len: number) => String(v ?? '').toUpperCase().replace(/[^\x20-\x7E]/g, '').slice(0, len).padEnd(len, ' ');
  const N = (v: any, len: number) => String(Math.max(0, Math.round((Number(v) || 0) * 100))).padStart(len, '0').slice(-len);
  const digits = (v: any) => String(v ?? '').replace(/\D/g, '');
  const rec = (parts: Array<[number, string]>) => {
    const r = ' '.repeat(512).split('');
    for (const [pos, str] of parts) for (let i = 0; i < str.length; i++) r[pos - 1 + i] = str[i];
    return r.join('');
  };
  const all = [...problems];
  const ein = digits(company.ein);
  if (ein.length !== 9) all.push('Company EIN must be nine digits');
  const bso = String(company.bso_user_id || '').trim();
  if (!bso) all.push('BSO User ID is blank (Settings → Payroll tax). SSA requires it in the RA record; AccuWage will flag it.');
  if (!company.city || !company.state || !company.zip) all.push('Company city, state and ZIP must be filled in separately (Settings → Company).');
  const { data: ownerRows } = await supabase.from('employees').select('name, phone, email')
    .eq('company_id', company_id).ilike('email', String(company.owner_email || '-')).limit(1);
  const owner = ownerRows?.[0];
  const contactName = owner?.name || company.legal_name || company.company_name || '';
  const contactPhone = digits(owner?.phone || company.phone).slice(-10);
  const contactEmail = owner?.email || company.owner_email || '';
  const name = company.legal_name || company.company_name || '';
  const co = { street: company.address || '', city: company.city || '', state: String(company.state || company.state_employer_id_state || '').toUpperCase(), zip: digits(company.zip).slice(0, 5) };

  const lines: string[] = [];
  lines.push(rec([[1, 'RA'], [3, A(ein, 9)], [12, A(bso, 8)], [29, '0'], [36, '98'],
    [38, A(name, 57)], [117, A(co.street, 22)], [139, A(co.city, 22)], [161, A(co.state, 2)], [163, A(co.zip, 5)],
    [217, A(name, 57)], [296, A(co.street, 22)], [318, A(co.city, 22)], [340, A(co.state, 2)], [342, A(co.zip, 5)],
    [396, A(contactName, 27)], [423, A(contactPhone, 15)], [446, A(contactEmail, 40)], [499, 'L']]));
  lines.push(rec([[1, 'RE'], [3, String(year)], [8, A(ein, 9)], [26, '0'], [40, A(name, 57)],
    [119, A(co.street, 22)], [141, A(co.city, 22)], [163, A(co.state, 2)], [165, A(co.zip, 5)],
    [219, 'R'], [221, '0'], [222, A(contactName, 27)], [249, A(contactPhone, 15)], [279, A(contactEmail, 40)]]));
  const tot = { n: 0, wages: 0, fit: 0, ss_wages: 0, ss_emp: 0, med_wages: 0, med_emp: 0, sit: 0 };
  for (const e of employees) {
    const t = ytd[e.id];
    const parts = e.name.split(/\s+/);
    const first = parts[0] || '', last = parts.length > 1 ? parts[parts.length - 1] : '', middle = parts.slice(1, -1).join(' ');
    const ssn = e.ssn || '';
    const zip = digits(e.home_zip).slice(0, 5);
    lines.push(rec([[1, 'RW'], [3, A(ssn, 9)], [12, A(first, 15)], [27, A(middle, 15)], [42, A(last, 20)],
      [88, A(e.home_address, 22)], [110, A(e.home_city, 22)], [132, A(e.home_state, 2)], [134, A(zip, 5)],
      [188, N(t.wages, 11)], [199, N(t.fit, 11)], [210, N(t.ss_wages, 11)], [221, N(t.ss_emp, 11)],
      [232, N(t.med_wages, 11)], [243, N(t.med_emp + t.addl_med, 11)],
      [486, '0'], [488, '0'], [489, '0']]));
    const fips = STATE_FIPS[t.state];
    if (fips) {
      lines.push(rec([[1, 'RS'], [3, fips], [10, A(ssn, 9)], [19, A(first, 15)], [34, A(middle, 15)], [49, A(last, 20)],
        [95, A(e.home_address, 22)], [117, A(e.home_city, 22)], [139, A(e.home_state, 2)], [141, A(zip, 5)],
        [248, A(company.state_employer_id || '', 20)], [274, fips], [276, N(t.wages, 11)], [287, N(t.sit, 11)]]));
    }
    tot.n++; tot.wages += t.wages; tot.fit += t.fit; tot.ss_wages += t.ss_wages; tot.ss_emp += t.ss_emp;
    tot.med_wages += t.med_wages; tot.med_emp += t.med_emp + t.addl_med; tot.sit += t.sit;
  }
  lines.push(rec([[1, 'RT'], [3, String(tot.n).padStart(7, '0')], [10, N(tot.wages, 15)], [25, N(tot.fit, 15)],
    [40, N(tot.ss_wages, 15)], [55, N(tot.ss_emp, 15)], [70, N(tot.med_wages, 15)], [85, N(tot.med_emp, 15)]]));
  lines.push(rec([[1, 'RF'], [8, String(tot.n).padStart(9, '0')]]));
  for (const k of Object.keys(tot)) (tot as any)[k] = round2((tot as any)[k]);

  const text = lines.join('\r\n') + '\r\n';
  const path = `tax-filings/${company_id}/${year}/W2REPORT-${year}-${Date.now()}.txt`;
  const { error: upErr } = await supabase.storage.from('project-documents')
    .upload(path, new TextEncoder().encode(text), { contentType: 'text/plain', upsert: true });
  if (upErr) return { ok: false, error: 'Could not store the file: ' + upErr.message };
  await supabase.from('payroll_tax_filings').update({ status: 'superseded' })
    .eq('company_id', company_id).eq('form_kind', 'EFW2').eq('period_start', yearStart).neq('status', 'superseded');
  await supabase.from('payroll_tax_filings').insert({
    company_id, form_kind: 'EFW2', jurisdiction: 'federal',
    period_start: yearStart, period_end: yearEnd,
    pdf_storage_path: path,
    values_snapshot: { totals: tot, records: lines.length, problems: all },
    status: all.length ? 'draft' : 'ready',
  });
  return { ok: true, path, employees: tot.n, records: lines.length, totals: tot, problems: all };
}

// =====================================================================
// 1099-NEC / 1096 set
// =====================================================================
async function generate1099Set({ supabase, company_id, company, year }: any) {
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  const { data: contractors } = await supabase
    .from('employees')
    .select('id, name, ssn_last4, w9_legal_name, w9_business_name, w9_federal_classification, w9_tin_type, w9_ein_last4, w9_signed_at, home_address, home_city, home_state, home_zip')
    .eq('company_id', company_id)
    .eq('tax_classification', '1099');

  if (!contractors?.length) return { ok: true, generated: 0, contractors: 0 };

  const ids = contractors.map((c: any) => c.id);
  const { data: paystubs } = await supabase
    .from('paystubs')
    .select('employee_id, gross_pay')
    .eq('company_id', company_id)
    .in('employee_id', ids)
    .gte('pay_date', yearStart)
    .lte('pay_date', yearEnd);

  const ytd: Record<number, number> = {};
  for (const c of contractors) ytd[c.id] = 0;
  for (const ps of paystubs || []) ytd[ps.employee_id] = (ytd[ps.employee_id] || 0) + (Number(ps.gross_pay) || 0);
  // Contractors also get paid straight from Books (manual expense with the
  // employee as payee). Those dollars are 1099 dollars too.
  const { data: directPays } = await supabase
    .from('manual_expenses')
    .select('payee_employee_id, amount')
    .eq('company_id', company_id)
    .in('payee_employee_id', ids)
    .gte('expense_date', yearStart)
    .lte('expense_date', yearEnd);
  for (const x of directPays || []) ytd[x.payee_employee_id] = (ytd[x.payee_employee_id] || 0) + (Number(x.amount) || 0);

  // Federal threshold: only contractors paid ≥$600 get a 1099-NEC.
  const need1099 = contractors.filter((c: any) => (ytd[c.id] || 0) >= 600);
  if (need1099.length === 0) return { ok: true, generated: 0, contractors: contractors.length, threshold: 'no contractors over $600' };

  const generated: any[] = [];
  for (const c of need1099) {
    const totalPaid = ytd[c.id];
    const pdfBytes = await render1099NecPdf({ company, contractor: c, year, totalPaid });
    const fname = safeName(`1099NEC-${year}-${c.id}-${Date.now()}.pdf`);
    const path  = `tax-filings/${company_id}/${year}/${fname}`;
    await supabase.storage.from('project-documents').upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });

    await supabase
      .from('payroll_tax_filings')
      .update({ status: 'superseded' })
      .eq('company_id', company_id)
      .eq('form_kind', '1099-NEC')
      .eq('employee_id', c.id)
      .eq('period_start', yearStart)
      .neq('status', 'superseded');

    const { data: filing } = await supabase
      .from('payroll_tax_filings')
      .insert({
        company_id, form_kind: '1099-NEC', jurisdiction: 'federal',
        period_start: yearStart, period_end: yearEnd, employee_id: c.id,
        pdf_storage_path: path,
        values_snapshot: { totalPaid, contractor: { name: c.name, w9_signed_at: c.w9_signed_at } },
        status: 'draft',
      })
      .select('id')
      .single();
    generated.push({ employee_id: c.id, name: c.name, totalPaid, filing_id: filing?.id, path });
  }

  // 1096 transmittal
  const totals = { count: need1099.length, total_paid: need1099.reduce((s: number, c: any) => s + (ytd[c.id] || 0), 0) };
  const f1096Bytes = await render1096Pdf({ company, year, totals });
  const f1096Path = `tax-filings/${company_id}/${year}/1096-${year}-${Date.now()}.pdf`;
  await supabase.storage.from('project-documents').upload(f1096Path, f1096Bytes, { contentType: 'application/pdf', upsert: true });

  await supabase
    .from('payroll_tax_filings')
    .update({ status: 'superseded' })
    .eq('company_id', company_id)
    .eq('form_kind', '1096')
    .eq('period_start', yearStart)
    .neq('status', 'superseded');
  await supabase.from('payroll_tax_filings').insert({
    company_id, form_kind: '1096', jurisdiction: 'federal',
    period_start: yearStart, period_end: yearEnd,
    pdf_storage_path: f1096Path, values_snapshot: { totals }, status: 'draft',
  });

  return { ok: true, generated: generated.length, contractors: contractors.length, items: generated, transmittal_path: f1096Path };
}

// =====================================================================
// Form 941 — Quarterly federal return
// =====================================================================
async function generate941({ supabase, company_id, company, year, quarter }: any) {
  // Quarter ranges: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
  const startMonth = (quarter - 1) * 3;             // 0, 3, 6, 9
  const periodStart = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const periodEndDate = new Date(year, startMonth + 3, 0); // last day of last quarter month
  const periodEnd = periodEndDate.toISOString().slice(0, 10);

  // Aggregate paystubs in this quarter — only W-2 employees count.
  const { data: emps } = await supabase
    .from('employees')
    .select('id, tax_classification')
    .eq('company_id', company_id);
  const w2Ids = (emps || []).filter((e: any) => e.tax_classification !== '1099').map((e: any) => e.id);
  if (w2Ids.length === 0) return { ok: true, generated: 0, note: 'No W-2 employees' };

  const { data: paystubs } = await supabase
    .from('paystubs')
    .select('employee_id, pay_date, gross_pay, taxable_wages, federal_income_tax, social_security_employee, social_security_employer, medicare_employee, medicare_employer, additional_medicare')
    .eq('company_id', company_id)
    .in('employee_id', w2Ids)
    .gte('pay_date', periodStart)
    .lte('pay_date', periodEnd);

  const totals = {
    employee_count: new Set((paystubs || []).map((p: any) => p.employee_id)).size,
    wages: 0, fit: 0,
    ss_wages: 0, ss_tax: 0,
    med_wages: 0, med_tax: 0,
    addl_med: 0,
  };
  // Tax liability by pay date: Schedule B for a semiweekly depositor, Part 2
  // line 16 for a monthly one. The IRS matches these to the deposits.
  const byDate: Record<string, number> = {};
  for (const ps of paystubs || []) {
    const wages = Number(ps.taxable_wages || ps.gross_pay) || 0;
    const d = String(ps.pay_date || '').slice(0, 10);
    byDate[d] = (byDate[d] || 0) + (Number(ps.federal_income_tax) || 0) + (Number(ps.social_security_employee) || 0) + (Number(ps.social_security_employer) || 0)
      + (Number(ps.medicare_employee) || 0) + (Number(ps.medicare_employer) || 0) + (Number(ps.additional_medicare) || 0);
    totals.wages    += wages;
    totals.fit      += Number(ps.federal_income_tax) || 0;
    totals.ss_wages += wages;
    totals.ss_tax   += (Number(ps.social_security_employee) || 0) + (Number(ps.social_security_employer) || 0);
    totals.med_wages += wages;
    totals.med_tax  += (Number(ps.medicare_employee) || 0) + (Number(ps.medicare_employer) || 0);
    totals.addl_med += Number(ps.additional_medicare) || 0;
  }

  // Pull deposits actually paid in this quarter from the liability ledger
  const { data: paidLiabs } = await supabase
    .from('payroll_tax_liabilities')
    .select('amount_total, kind, paid_at')
    .eq('company_id', company_id)
    .eq('jurisdiction', 'federal')
    .gte('period_start', periodStart)
    .lte('period_end', periodEnd)
    .not('paid_at', 'is', null);
  const totalDeposits = (paidLiabs || []).reduce((s: number, l: any) => s + (Number(l.amount_total) || 0), 0);

  const totalTaxLiability = round2(totals.fit + totals.ss_tax + totals.med_tax + totals.addl_med);
  const balanceDue = round2(totalTaxLiability - totalDeposits);

  const pdfBytes = await render941Pdf({ company, year, quarter, totals, totalTaxLiability, totalDeposits, balanceDue, byDate, schedule: company.federal_deposit_schedule || 'monthly' });
  const path = `tax-filings/${company_id}/${year}/941-Q${quarter}-${year}-${Date.now()}.pdf`;
  await supabase.storage.from('project-documents').upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });

  // Supersede prior draft for this same period
  await supabase
    .from('payroll_tax_filings')
    .update({ status: 'superseded' })
    .eq('company_id', company_id)
    .eq('form_kind', '941')
    .eq('period_start', periodStart)
    .neq('status', 'superseded');

  const { data: filing } = await supabase
    .from('payroll_tax_filings')
    .insert({
      company_id, form_kind: '941', jurisdiction: 'federal',
      period_start: periodStart, period_end: periodEnd,
      pdf_storage_path: path,
      values_snapshot: { totals, totalTaxLiability, totalDeposits, balanceDue, byDate },
      status: 'draft',
    })
    .select('id')
    .single();
  return { ok: true, filing_id: filing?.id, path, totals, totalTaxLiability, totalDeposits, balanceDue, byDate };
}

// =====================================================================
// Form 940 — Annual FUTA return
// =====================================================================
async function generate940({ supabase, company_id, company, year }: any) {
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  const { data: emps } = await supabase
    .from('employees')
    .select('id, name, tax_classification')
    .eq('company_id', company_id);
  const w2Ids = (emps || []).filter((e: any) => e.tax_classification !== '1099').map((e: any) => e.id);
  if (w2Ids.length === 0) return { ok: true, generated: 0, note: 'No W-2 employees' };

  const { data: paystubs } = await supabase
    .from('paystubs')
    .select('employee_id, gross_pay, taxable_wages, futa')
    .eq('company_id', company_id)
    .in('employee_id', w2Ids)
    .gte('pay_date', yearStart)
    .lte('pay_date', yearEnd);

  // Per-employee YTD wages so we can apply the $7,000 cap
  const FUTA_BASE = 7000;
  const empWages: Record<number, number> = {};
  let totalPayments = 0;
  let futaPaid = 0;
  for (const ps of paystubs || []) {
    const w = Number(ps.taxable_wages || ps.gross_pay) || 0;
    empWages[ps.employee_id] = (empWages[ps.employee_id] || 0) + w;
    totalPayments += w;
    futaPaid += Number(ps.futa) || 0;
  }
  // Taxable FUTA wages = sum of min($7K, ytd) per employee
  let taxableFutaWages = 0;
  for (const id in empWages) {
    taxableFutaWages += Math.min(FUTA_BASE, empWages[id]);
  }

  const futaRatePct = Number(company.futa_rate_pct ?? 0.6);
  const totalFutaDue = round2(taxableFutaWages * futaRatePct / 100);
  const balanceDue   = round2(totalFutaDue - futaPaid);

  const pdfBytes = await render940Pdf({ company, year, totalPayments, taxableFutaWages, futaRatePct, totalFutaDue, futaPaid, balanceDue });
  const path = `tax-filings/${company_id}/${year}/940-${year}-${Date.now()}.pdf`;
  await supabase.storage.from('project-documents').upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });

  await supabase
    .from('payroll_tax_filings')
    .update({ status: 'superseded' })
    .eq('company_id', company_id)
    .eq('form_kind', '940')
    .eq('period_start', yearStart)
    .neq('status', 'superseded');

  const { data: filing } = await supabase
    .from('payroll_tax_filings')
    .insert({
      company_id, form_kind: '940', jurisdiction: 'federal',
      period_start: yearStart, period_end: yearEnd,
      pdf_storage_path: path,
      values_snapshot: { totalPayments, taxableFutaWages, futaRatePct, totalFutaDue, futaPaid, balanceDue },
      status: 'draft',
    })
    .select('id')
    .single();
  return { ok: true, filing_id: filing?.id, path, totalPayments, taxableFutaWages, futaRatePct, totalFutaDue, futaPaid, balanceDue };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// =====================================================================
// Utah TC-941 — State quarterly withholding return
// =====================================================================
async function generateTC941({ supabase, company_id, company, year, quarter }: any) {
  if ((company.state_employer_id_state || 'UT') !== 'UT') {
    return { ok: false, error: 'TC-941 is Utah-only. Other states need their own renderer.' };
  }
  if (!company.state_employer_id) {
    return { ok: false, error: 'Set Utah State Tax Commission ID in Settings → Payroll Tax / Compliance before generating TC-941.' };
  }

  const startMonth = (quarter - 1) * 3;
  const periodStart = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const periodEndDate = new Date(year, startMonth + 3, 0);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);

  const { data: emps } = await supabase
    .from('employees')
    .select('id, tax_classification')
    .eq('company_id', company_id);
  const w2Ids = (emps || []).filter((e: any) => e.tax_classification !== '1099').map((e: any) => e.id);

  const { data: paystubs } = await supabase
    .from('paystubs')
    .select('employee_id, gross_pay, taxable_wages, state_income_tax')
    .eq('company_id', company_id)
    .in('employee_id', w2Ids.length ? w2Ids : [-1])
    .gte('pay_date', periodStart)
    .lte('pay_date', periodEnd);

  const totals = {
    employee_count: new Set((paystubs || []).map((p: any) => p.employee_id)).size,
    wages: 0,
    state_tax_withheld: 0,
  };
  for (const ps of paystubs || []) {
    totals.wages += Number(ps.taxable_wages || ps.gross_pay) || 0;
    totals.state_tax_withheld += Number(ps.state_income_tax) || 0;
  }

  const { data: paidLiabs } = await supabase
    .from('payroll_tax_liabilities')
    .select('amount_total, kind')
    .eq('company_id', company_id)
    .eq('jurisdiction', 'state')
    .eq('kind', 'state_income_tax')
    .gte('period_start', periodStart)
    .lte('period_end', periodEnd)
    .not('paid_at', 'is', null);
  const totalDeposits = (paidLiabs || []).reduce((s: number, l: any) => s + (Number(l.amount_total) || 0), 0);
  const balanceDue = round2(totals.state_tax_withheld - totalDeposits);

  const pdfBytes = await renderTC941Pdf({ company, year, quarter, totals, totalDeposits, balanceDue });
  const path = `tax-filings/${company_id}/${year}/TC941-Q${quarter}-${year}-${Date.now()}.pdf`;
  await supabase.storage.from('project-documents').upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });

  await supabase
    .from('payroll_tax_filings')
    .update({ status: 'superseded' })
    .eq('company_id', company_id)
    .eq('form_kind', 'TC-941')
    .eq('period_start', periodStart)
    .neq('status', 'superseded');

  const { data: filing } = await supabase
    .from('payroll_tax_filings')
    .insert({
      company_id, form_kind: 'TC-941', jurisdiction: 'state',
      period_start: periodStart, period_end: periodEnd,
      pdf_storage_path: path,
      values_snapshot: { totals, totalDeposits, balanceDue },
      status: 'draft',
    })
    .select('id')
    .single();
  return { ok: true, filing_id: filing?.id, path, totals, totalDeposits, balanceDue };
}

// =====================================================================
// Utah Form 33H + 33HA — State unemployment (DWS) quarterly
//   33H: summary + total taxable wages × company SUI rate = tax due
//   33HA: per-employee wage detail filed alongside
// =====================================================================
async function generateForm33H({ supabase, company_id, company, year, quarter }: any) {
  if ((company.state_employer_id_state || 'UT') !== 'UT') {
    return { ok: false, error: 'Form 33H is Utah-only. Other states need their own renderer.' };
  }
  if (!company.sui_account_number) {
    return { ok: false, error: 'Set Utah DWS account number in Settings → Payroll Tax / Compliance before generating Form 33H.' };
  }
  const startMonth = (quarter - 1) * 3;
  const periodStart = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const periodEndDate = new Date(year, startMonth + 3, 0);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);
  const yearStart = `${year}-01-01`;

  // The rate IN FORCE for this quarter — from the rate history first (so a
  // Q4 rendered in February still uses Q4's rate after next year's notice
  // was entered), the companies row as the fallback. Same rule as
  // lib/suiRate.suiRateInForce on the app side.
  const { data: rateRows } = await supabase
    .from('company_sui_rates')
    .select('id, rate_pct, effective_date, source')
    .eq('company_id', company_id)
    .lte('effective_date', periodStart)
    .order('effective_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  const rateRow = rateRows?.[0] || null;
  const suiRatePct = rateRow ? Number(rateRow.rate_pct) : (company.sui_rate_pct == null ? null : Number(company.sui_rate_pct));
  const suiRateSource = rateRow ? rateRow.source : (company.sui_rate_source || null);
  if (suiRatePct == null) {
    return { ok: false, error: 'Set your assigned Utah SUI rate in Settings → Payroll Tax / Compliance before generating Form 33H.' };
  }
  // Gusto files nothing on a placeholder, and neither does this: an
  // estimate is for running payroll, not for the return.
  if (suiRateSource === 'estimate') {
    return { ok: false, error: `Your Utah SUI rate on file (${suiRatePct}%) is a temporary estimate. Enter the assigned rate from your DWS Contribution Rate Notice (box J) in Settings → Payroll Tax; JobScout will true-up the quarter, and Form 33H can then be generated.` };
  }

  // Active W-2 employees with paystubs in this quarter
  const { data: emps } = await supabase
    .from('employees')
    .select('id, name, ssn_last4, tax_classification')
    .eq('company_id', company_id);
  const w2Ids = (emps || []).filter((e: any) => e.tax_classification !== '1099').map((e: any) => e.id);

  // Pull both this quarter's paystubs (for reportable wages) and YTD
  // through end-of-quarter (for the per-employee SUI base cap math).
  const { data: psQuarter } = await supabase
    .from('paystubs')
    .select('employee_id, gross_pay, taxable_wages')
    .eq('company_id', company_id)
    .in('employee_id', w2Ids.length ? w2Ids : [-1])
    .gte('pay_date', periodStart)
    .lte('pay_date', periodEnd);

  const { data: psYTD } = await supabase
    .from('paystubs')
    .select('employee_id, gross_pay, taxable_wages, pay_date')
    .eq('company_id', company_id)
    .in('employee_id', w2Ids.length ? w2Ids : [-1])
    .gte('pay_date', yearStart)
    .lte('pay_date', periodEnd);

  // Utah DWS taxable wage base by year (jobs.utah.gov). The 33H is a
  // quarterly form, so a Q4 render filed in January still needs last year's
  // base; a company's own sui_wage_base setting wins when it is set.
  const UTAH_SUI_WAGE_BASE: Record<number, number> = { 2025: 48900, 2026: 50700 };
  const SUI_BASE = Number(company.sui_wage_base) || UTAH_SUI_WAGE_BASE[Number(year)] || 50700;
  const SUI_RATE = suiRatePct || 0;

  // Per-employee: total wages this quarter + ytd-through-quarter (for cap)
  const empTotals: Record<number, { wages_q: number; wages_ytd: number; ytd_before_q: number }> = {};
  for (const id of w2Ids) empTotals[id] = { wages_q: 0, wages_ytd: 0, ytd_before_q: 0 };
  for (const ps of psQuarter || []) {
    const t = empTotals[ps.employee_id]; if (!t) continue;
    t.wages_q += Number(ps.taxable_wages || ps.gross_pay) || 0;
  }
  for (const ps of psYTD || []) {
    const t = empTotals[ps.employee_id]; if (!t) continue;
    const w = Number(ps.taxable_wages || ps.gross_pay) || 0;
    t.wages_ytd += w;
    if (ps.pay_date < periodStart) t.ytd_before_q += w;
  }

  // Per-employee detail rows + aggregate taxable
  const detail: Array<{ emp_id: number; name: string; ssn_last4: string; total_wages: number; taxable_wages: number; excess_wages: number }> = [];
  let totalGross = 0; let totalTaxable = 0; let totalExcess = 0;
  for (const e of (emps || []).filter((x: any) => x.tax_classification !== '1099')) {
    const t = empTotals[e.id]; if (!t || t.wages_q === 0) continue;
    // Taxable wages this quarter = min($SUI_BASE - ytd_before_q, wages_q), clamped at 0
    const baseRoom = Math.max(0, SUI_BASE - t.ytd_before_q);
    const taxableWages = Math.min(baseRoom, t.wages_q);
    const excessWages  = Math.max(0, t.wages_q - taxableWages);
    detail.push({
      emp_id: e.id, name: e.name, ssn_last4: e.ssn_last4 || '',
      total_wages: round2(t.wages_q),
      taxable_wages: round2(taxableWages),
      excess_wages: round2(excessWages),
    });
    totalGross   += t.wages_q;
    totalTaxable += taxableWages;
    totalExcess  += excessWages;
  }
  totalGross = round2(totalGross); totalTaxable = round2(totalTaxable); totalExcess = round2(totalExcess);

  const taxDue = round2(totalTaxable * SUI_RATE / 100);

  const pdfBytes = await render33HPdf({ company, year, quarter, totalGross, totalTaxable, totalExcess, suiRate: SUI_RATE, suiBase: SUI_BASE, taxDue, detail, rateEffective: rateRow?.effective_date || company.sui_rate_effective_date || null, rateSource: suiRateSource });
  const path = `tax-filings/${company_id}/${year}/Form33H-Q${quarter}-${year}-${Date.now()}.pdf`;
  await supabase.storage.from('project-documents').upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });

  await supabase
    .from('payroll_tax_filings')
    .update({ status: 'superseded' })
    .eq('company_id', company_id)
    .eq('form_kind', 'Form-33H')
    .eq('period_start', periodStart)
    .neq('status', 'superseded');

  const { data: filing } = await supabase
    .from('payroll_tax_filings')
    .insert({
      company_id, form_kind: 'Form-33H', jurisdiction: 'state',
      period_start: periodStart, period_end: periodEnd,
      pdf_storage_path: path,
      values_snapshot: { totalGross, totalTaxable, totalExcess, suiRate: SUI_RATE, taxDue, detail_count: detail.length },
      status: 'draft',
    })
    .select('id')
    .single();
  return { ok: true, filing_id: filing?.id, path, totalGross, totalTaxable, taxDue, detail_count: detail.length };
}

// ======================== PDF renderers ===============================

async function renderW2Pdf({ company, emp, year, t }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Form W-2 Wage and Tax Statement`, { x: margin, y, size: 16, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Tax year ${year} · Copy B, C and 2 — for the employee's federal, own and state returns`, { x: margin, y, size: 10, font, color: muted });
  page.drawText(`OMB No. 1545-0008`, { x: 612 - margin - 90, y, size: 9, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  // The employee's own copy carries the full SSN; without it the form is
  // not a W-2. A missing one is said on the form, not hidden.
  const ssn = emp.ssn ? `${emp.ssn.slice(0, 3)}-${emp.ssn.slice(3, 5)}-${emp.ssn.slice(5)}` : (emp.ssn_last4 ? `***-**-${emp.ssn_last4} (full SSN not readable)` : '— MISSING —');
  drawBox(page, margin, y, 240, 36, 'a Employee\'s social security number', ssn, font, fontB, ink, muted);
  drawBox(page, margin + 250, y, 280, 36, 'b Employer identification number (EIN)', company.ein || '—', font, fontB, ink, muted);
  y -= 46;

  const empName = company.legal_name || company.company_name || '';
  // An address typed as one line already carries the city and ZIP; do not print them twice.
  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(' ');
  const coAddr = [company.address, (company.zip && String(company.address || '').includes(String(company.zip))) ? '' : cityLine].filter((x: any) => x && String(x).trim()).join('\n');
  drawBox(page, margin, y, 530, 50, 'c Employer\'s name, address, and ZIP code', `${empName}\n${coAddr}`, font, fontB, ink, muted);
  y -= 60;

  drawBox(page, margin, y, 530, 36, 'e Employee\'s first name and initial, last name', emp.name || '', font, fontB, ink, muted);
  y -= 46;
  const empAddr = [emp.home_address, [emp.home_city, emp.home_state, emp.home_zip].filter(Boolean).join(' ')].filter((x: any) => x && String(x).trim()).join(', ');
  drawBox(page, margin, y, 530, 36, 'f Employee\'s address and ZIP code', empAddr || '— MISSING —', font, fontB, ink, muted);
  y -= 50;

  const drawWageBox = (col: number, row: number, num: string, label: string, val: string) => {
    const x = margin + col * 180;
    const yb = y - row * 46;
    drawBox(page, x, yb, 170, 36, `${num} ${label}`, val, font, fontB, ink, muted);
  };
  drawWageBox(0, 0, '1', 'Wages, tips, other compensation', money(t.wages));
  drawWageBox(1, 0, '2', 'Federal income tax withheld', money(t.fit));
  drawWageBox(2, 0, '3', 'Social security wages', money(t.ss_wages ?? t.wages));
  drawWageBox(0, 1, '4', 'Social security tax withheld', money(t.ss_emp));
  drawWageBox(1, 1, '5', 'Medicare wages and tips', money(t.med_wages ?? t.wages));
  drawWageBox(2, 1, '6', 'Medicare tax withheld', money(t.med_emp + t.addl_med));
  drawWageBox(0, 2, '12', 'See instructions for box 12', '');
  drawWageBox(1, 2, '13', 'Statutory / retirement / sick pay', '');
  drawWageBox(2, 2, '14', 'Other', t.famli > 0 ? `CO FAMLI ${money(t.famli)}` : '');
  y -= 46 * 3 + 10;

  drawBox(page, margin, y, 90, 36, '15 State', t.state || company.state_employer_id_state || '—', font, fontB, ink, muted);
  drawBox(page, margin + 100, y, 220, 36, 'Employer\'s state ID number', company.state_employer_id || '—', font, fontB, ink, muted);
  drawBox(page, margin + 330, y, 100, 36, '16 State wages, tips', money(t.wages), font, fontB, ink, muted);
  drawBox(page, margin + 440, y, 90, 36, '17 State income tax', money(t.sit), font, fontB, ink, muted);
  y -= 56;

  drawWrapped(page, margin, 80,
    `Prepared by JobScout from ${emp.name}'s ${year} paystubs. This copy is for the employee (Copy B is filed with the federal return, Copy 2 with the state return, Copy C is kept). The employer files Copy A with the Social Security Administration electronically (EFW2 file from the Payroll Inbox) by January 31. Keep this with your tax records.`,
    font, muted, 612 - 2 * margin, 8);
  return pdf.save();
}

async function renderW3Pdf({ company, year, totals }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Form W-3 — Transmittal of Wage and Tax Statements`, { x: margin, y, size: 16, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Tax year ${year}`, { x: margin, y, size: 11, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  drawBox(page, margin, y, 250, 36, 'b Employer ID number (EIN)', company.ein || '—', font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 36, 'c Total number of W-2s', String(totals.count), font, fontB, ink, muted);
  y -= 46;
  const empName = company.legal_name || company.company_name || '';
  drawBox(page, margin, y, 530, 50, 'e Employer name, address, and ZIP', `${empName}\n${company.address || ''}`, font, fontB, ink, muted);
  y -= 60;

  // Aggregate boxes
  const drawT = (col: number, row: number, num: string, label: string, val: number) => {
    const x = margin + col * 180;
    const yb = y - row * 46;
    drawBox(page, x, yb, 170, 36, `${num} ${label}`, money(val), font, fontB, ink, muted);
  };
  drawT(0, 0, '1',  'Wages, tips, other comp.',         totals.wages);
  drawT(1, 0, '2',  'Federal income tax withheld',      totals.fit);
  drawT(2, 0, '3',  'Social security wages',            totals.ss_wages ?? totals.wages);
  drawT(0, 1, '4',  'Social security tax withheld',     totals.ss_emp);
  drawT(1, 1, '5',  'Medicare wages and tips',          totals.med_wages ?? totals.wages);
  drawT(2, 1, '6',  'Medicare tax withheld',            totals.med_emp + totals.addl_med);
  y -= 46 * 2 + 10;

  drawBox(page, margin, y, 100, 36, '15 State', company.state_employer_id_state || '—', font, fontB, ink, muted);
  drawBox(page, margin + 110, y, 200, 36, '15 Employer state ID', company.state_employer_id || '—', font, fontB, ink, muted);
  drawBox(page, margin + 320, y, 100, 36, '16 State wages', money(totals.wages), font, fontB, ink, muted);
  drawBox(page, margin + 430, y, 100, 36, '17 State tax', money(totals.sit), font, fontB, ink, muted);
  y -= 56;

  drawWrapped(page, margin, 80,
    `This W-3 transmits ${totals.count} W-2s for tax year ${year}. The cleanest filing path is the SSA's free Business Services Online (BSO) upload — it accepts a single .txt file and replaces the paper W-3 + Copy A entirely. Otherwise mail to: Social Security Administration, Direct Operations Center, Wilkes-Barre PA 18769-0001.`,
    font, muted, 612 - 2 * margin, 8);
  return pdf.save();
}

async function render1099NecPdf({ company, contractor, year, totalPaid }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Form 1099-NEC — Nonemployee Compensation`, { x: margin, y, size: 16, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Tax year ${year}`, { x: margin, y, size: 11, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  // Payer (company) block
  const payerName = company.legal_name || company.company_name || '';
  drawBox(page, margin, y, 530, 60,
    'PAYER\'s name, street address, ZIP, and phone',
    `${payerName}\n${company.address || ''}\n${company.phone || ''}`, font, fontB, ink, muted);
  y -= 70;

  // PAYER's TIN + RECIPIENT's TIN
  drawBox(page, margin, y, 250, 36, 'PAYER\'s TIN (EIN)', company.ein || '—', font, fontB, ink, muted);
  const tin = contractor.w9_tin_type === 'ein'
    ? (contractor.w9_ein_last4 ? `**-***${contractor.w9_ein_last4}` : '— missing —')
    : (contractor.ssn_last4 ? `***-**-${contractor.ssn_last4}` : '— missing —');
  drawBox(page, margin + 270, y, 260, 36, 'RECIPIENT\'s TIN', tin, font, fontB, ink, muted);
  y -= 46;

  // Recipient (contractor) block
  const recName = contractor.w9_legal_name || contractor.name || '';
  const recAddr = `${contractor.home_address || ''}, ${contractor.home_city || ''} ${contractor.home_state || ''} ${contractor.home_zip || ''}`.replace(/^[, ]+|[, ]+$/g, '').trim();
  drawBox(page, margin, y, 530, 60,
    'RECIPIENT\'s name, street address, ZIP',
    `${recName}\n${contractor.w9_business_name ? `(DBA: ${contractor.w9_business_name})\n` : ''}${recAddr}`, font, fontB, ink, muted);
  y -= 70;

  // Box 1 — Nonemployee compensation
  drawBox(page, margin, y, 250, 50, '1  Nonemployee compensation', money(totalPaid), font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 50, '4  Federal income tax withheld', '$0.00', font, fontB, ink, muted);
  y -= 60;

  // Box 5/6/7 — State info
  drawBox(page, margin, y, 200, 36, '5 State tax withheld', '$0.00', font, fontB, ink, muted);
  drawBox(page, margin + 210, y, 150, 36, '6 State', company.state_employer_id_state || '—', font, fontB, ink, muted);
  drawBox(page, margin + 370, y, 160, 36, '7 State income', money(totalPaid), font, fontB, ink, muted);
  y -= 56;

  drawWrapped(page, margin, 80,
    `Copy A: file with IRS by Jan 31. Copy B: send to ${recName} by Jan 31. Both copies generated by JobScout from paystub totals. The recipient pays self-employment tax (~15.3%) plus their federal income tax at filing — JobScout did NOT withhold. If this contractor's W-9 is missing, fix the employee record before mailing.`,
    font, muted, 612 - 2 * margin, 8);
  return pdf.save();
}

async function render1096Pdf({ company, year, totals }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Form 1096 — Annual Summary and Transmittal`, { x: margin, y, size: 16, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Tax year ${year}`, { x: margin, y, size: 11, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  const filer = company.legal_name || company.company_name || '';
  drawBox(page, margin, y, 530, 50, 'FILER\'s name, address, and ZIP', `${filer}\n${company.address || ''}`, font, fontB, ink, muted);
  y -= 60;

  drawBox(page, margin, y, 250, 36, '1 Employer ID number (EIN)', company.ein || '—', font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 36, '3 Total number of forms', String(totals.count), font, fontB, ink, muted);
  y -= 46;

  drawBox(page, margin, y, 530, 50, '4 Federal income tax withheld', '$0.00 (no withholding on 1099-NEC)', font, fontB, ink, muted);
  y -= 60;
  drawBox(page, margin, y, 530, 50, '5 Total amount reported with this Form 1096', money(totals.total_paid), font, fontB, ink, muted);
  y -= 60;

  // Box "Type of form being filed" — check 1099-NEC
  drawBox(page, margin, y, 530, 36, 'Type of form being filed', '☑ 1099-NEC (Nonemployee Compensation)', font, fontB, ink, muted);
  y -= 46;

  drawWrapped(page, margin, 80,
    `Mail this 1096 with Copy A of the attached 1099-NECs to: Internal Revenue Service Center (use the address listed in the 1099 instructions for your state). Due Jan 31. Or e-file via FIRE/IRIS to skip the paper.`,
    font, muted, 612 - 2 * margin, 8);
  return pdf.save();
}

async function render941Pdf({ company, year, quarter, totals, totalTaxLiability, totalDeposits, balanceDue, byDate = {}, schedule = 'monthly' }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Form 941 — Employer's Quarterly Federal Tax Return`, { x: margin, y, size: 15, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Quarter ${quarter} of ${year}`, { x: margin, y, size: 11, font, color: muted });
  page.drawText(`OMB No. 1545-0029`, { x: 612 - margin - 110, y, size: 9, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  // Filer block
  const filer = company.legal_name || company.company_name || '';
  drawBox(page, margin, y, 250, 36, 'Employer ID number (EIN)', company.ein || '—', font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 36, 'Quarter', `Q${quarter} ${year}`, font, fontB, ink, muted);
  y -= 46;
  drawBox(page, margin, y, 530, 50, 'Name + address', `${filer}\n${company.address || ''}`, font, fontB, ink, muted);
  y -= 60;

  // Part 1 — Numbers in plain English
  page.drawText('Part 1: Answer these questions for this quarter', { x: margin, y, size: 11, font: fontB, color: ink });
  y -= 14;
  drawBox(page, margin, y, 530, 28, '1  Number of employees who received wages this quarter', String(totals.employee_count), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 530, 28, '2  Wages, tips, and other compensation', money(totals.wages), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 530, 28, '3  Federal income tax withheld from wages', money(totals.fit), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 260, 28, '5a Taxable social security wages', money(totals.ss_wages), font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 28, '5a Tax @ 12.4%', money(totals.ss_tax), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 260, 28, '5c Taxable Medicare wages', money(totals.med_wages), font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 28, '5c Tax @ 2.9%', money(totals.med_tax), font, fontB, ink, muted);
  y -= 32;
  if (totals.addl_med > 0) {
    drawBox(page, margin, y, 530, 28, '5d Additional Medicare (employee, 0.9% over $200k YTD)', money(totals.addl_med), font, fontB, ink, muted);
    y -= 32;
  }
  drawBox(page, margin, y, 530, 32, '10 Total taxes after adjustments and credits', money(totalTaxLiability), font, fontB, ink, muted);
  y -= 36;
  drawBox(page, margin, y, 530, 32, '13a Total deposits made for this quarter (EFTPS / etc.)', money(totalDeposits), font, fontB, ink, muted);
  y -= 36;

  // Balance due / overpayment
  const balanceLabel = balanceDue >= 0 ? '14 Balance due (mail with this return OR pay via EFTPS)' : '15 Overpayment';
  const balanceVal   = balanceDue >= 0 ? money(balanceDue) : money(Math.abs(balanceDue));
  const balanceColor = balanceDue > 0 ? rgb(0.86, 0.15, 0.15) : ink;
  drawBox(page, margin, y, 530, 38, balanceLabel, balanceVal, font, fontB, balanceColor, muted);
  y -= 50;

  drawWrapped(page, margin, 80,
    `Filing path: most employers file 941 quarterly via paper to the IRS service center for your state, OR e-file via Modernized e-File (MeF). Due last day of the month after the quarter ends. Balance due CAN be mailed with the form by check (under $2,500) — anything more goes via EFTPS. Verify deposits + numbers above match your bank/EFTPS records before mailing.`,
    font, muted, 612 - 2 * margin, 8);

  // Page 2 — liability by date. A semiweekly depositor must attach Schedule
  // B; a monthly depositor reports the three month totals on line 16.
  const p2 = pdf.addPage([612, 792]);
  let y2 = 792 - margin;
  const semi = String(schedule).toLowerCase().startsWith('semi');
  p2.drawText(semi ? 'Schedule B (Form 941) — Report of Tax Liability for Semiweekly Schedule Depositors' : 'Part 2, line 16 — Tax liability for each month', { x: margin, y: y2, size: 13, font: fontB, color: ink });
  y2 -= 14;
  p2.drawText(`Quarter ${quarter} of ${year} · EIN ${company.ein || '—'} · ${company.legal_name || company.company_name || ''}`, { x: margin, y: y2, size: 10, font, color: muted });
  y2 -= 8;
  p2.drawLine({ start: { x: margin, y: y2 }, end: { x: 612 - margin, y: y2 }, thickness: 1.5, color: accent });
  y2 -= 18;
  const months = [0, 1, 2].map((i) => (quarter - 1) * 3 + i + 1);
  let qTotal = 0;
  for (const m of months) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const days = Object.keys(byDate).filter((d) => d.startsWith(key)).sort();
    const mTotal = days.reduce((a, d) => a + (byDate[d] || 0), 0);
    qTotal += mTotal;
    const mName = new Date(year, m - 1, 1).toLocaleString('en-US', { month: 'long' });
    p2.drawText(`Month ${months.indexOf(m) + 1} — ${mName}`, { x: margin, y: y2, size: 11, font: fontB, color: ink });
    p2.drawText(`Total ${money(round2(mTotal))}`, { x: 612 - margin - 150, y: y2, size: 11, font: fontB, color: ink });
    y2 -= 15;
    if (!days.length) { p2.drawText('No pay dates this month.', { x: margin + 12, y: y2, size: 9.5, font, color: muted }); y2 -= 14; }
    for (const d of days) {
      if (semi) p2.drawText(`Day ${Number(d.slice(8, 10))}`, { x: margin + 12, y: y2, size: 9.5, font, color: ink });
      else p2.drawText(`Paid ${d}`, { x: margin + 12, y: y2, size: 9.5, font, color: ink });
      p2.drawText(money(round2(byDate[d])), { x: margin + 90, y: y2, size: 9.5, font, color: ink });
      y2 -= 13;
    }
    y2 -= 10;
  }
  p2.drawLine({ start: { x: margin, y: y2 }, end: { x: 612 - margin, y: y2 }, thickness: 1, color: accent });
  y2 -= 16;
  p2.drawText(`Total liability for the quarter ${money(round2(qTotal))}`, { x: margin, y: y2, size: 11, font: fontB, color: ink });
  y2 -= 14;
  p2.drawText(`Must equal line 12 on Form 941 (${money(totalTaxLiability)}).${Math.abs(qTotal - totalTaxLiability) > 0.01 ? '  DOES NOT MATCH — check the paystubs for this quarter.' : ''}`, { x: margin, y: y2, size: 9, font, color: Math.abs(qTotal - totalTaxLiability) > 0.01 ? rgb(0.86, 0.15, 0.15) : muted });
  return pdf.save();
}

async function render940Pdf({ company, year, totalPayments, taxableFutaWages, futaRatePct, totalFutaDue, futaPaid, balanceDue }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Form 940 — Employer's Annual FUTA Tax Return`, { x: margin, y, size: 15, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Tax year ${year}`, { x: margin, y, size: 11, font, color: muted });
  page.drawText(`OMB No. 1545-0028`, { x: 612 - margin - 110, y, size: 9, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  const filer = company.legal_name || company.company_name || '';
  drawBox(page, margin, y, 250, 36, 'EIN', company.ein || '—', font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 36, 'Tax year', String(year), font, fontB, ink, muted);
  y -= 46;
  drawBox(page, margin, y, 530, 50, 'Name + address', `${filer}\n${company.address || ''}`, font, fontB, ink, muted);
  y -= 60;

  // Part 2 — FUTA tax
  page.drawText('Part 2: Determine your FUTA tax', { x: margin, y, size: 11, font: fontB, color: ink });
  y -= 14;
  drawBox(page, margin, y, 530, 28, '3  Total payments to all employees', money(totalPayments), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 530, 28, '7  Total taxable FUTA wages (first $7,000 per employee)', money(taxableFutaWages), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 530, 32, `8  FUTA tax @ ${futaRatePct.toFixed(2)}%`, money(totalFutaDue), font, fontB, ink, muted);
  y -= 36;
  drawBox(page, margin, y, 530, 32, '13 FUTA tax deposited for the year (from quarterly deposits)', money(futaPaid), font, fontB, ink, muted);
  y -= 36;

  const balanceLabel = balanceDue >= 0 ? '14 Balance due (mail with this return OR pay via EFTPS)' : '15 Overpayment';
  const balanceVal   = balanceDue >= 0 ? money(balanceDue) : money(Math.abs(balanceDue));
  const balanceColor = balanceDue > 0 ? rgb(0.86, 0.15, 0.15) : ink;
  drawBox(page, margin, y, 530, 38, balanceLabel, balanceVal, font, fontB, balanceColor, muted);
  y -= 50;

  drawWrapped(page, margin, 80,
    `Filing path: due Jan 31 for the prior tax year. Mail to the IRS service center for your state OR e-file via MeF. Balance due of $500 or less can be mailed with the form by check; anything over $500 must be deposited quarterly via EFTPS as you accrue it. Verify the per-employee $7,000 cap math + your state credit reduction status (currently 0% for Utah) before mailing.`,
    font, muted, 612 - 2 * margin, 8);
  return pdf.save();
}

async function renderTC941Pdf({ company, year, quarter, totals, totalDeposits, balanceDue }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Utah TC-941 — Withholding Tax Return`, { x: margin, y, size: 15, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Quarter ${quarter} of ${year}`, { x: margin, y, size: 11, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  const filer = company.legal_name || company.company_name || '';
  drawBox(page, margin, y, 250, 36, 'Utah Withholding ID', company.state_employer_id || '—', font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 36, 'Federal EIN', company.ein || '—', font, fontB, ink, muted);
  y -= 46;
  drawBox(page, margin, y, 530, 50, 'Employer name + address', `${filer}\n${company.address || ''}`, font, fontB, ink, muted);
  y -= 60;

  page.drawText('Quarter wage + tax summary', { x: margin, y, size: 11, font: fontB, color: ink });
  y -= 14;
  drawBox(page, margin, y, 530, 28, '1  Total Utah wages paid this quarter', money(totals.wages), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 530, 28, '2  Number of employees who received wages', String(totals.employee_count), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 530, 32, '3  Total Utah income tax withheld this quarter', money(totals.state_tax_withheld), font, fontB, ink, muted);
  y -= 36;
  drawBox(page, margin, y, 530, 32, '4  Utah deposits already made for this quarter', money(totalDeposits), font, fontB, ink, muted);
  y -= 36;

  const balanceLabel = balanceDue >= 0 ? '5  Balance due (mail with this return OR pay via TAP)' : '6  Overpayment (refund or credit forward)';
  const balanceVal   = balanceDue >= 0 ? money(balanceDue) : money(Math.abs(balanceDue));
  const balanceColor = balanceDue > 0 ? rgb(0.86, 0.15, 0.15) : ink;
  drawBox(page, margin, y, 530, 38, balanceLabel, balanceVal, font, fontB, balanceColor, muted);
  y -= 50;

  drawWrapped(page, margin, 80,
    `Filing path: file via Utah TAP (Taxpayer Access Point) at tap.tax.utah.gov, or mail this return to the Utah State Tax Commission. Due last day of the month after the quarter ends. Verify totals match your bank/TAP records before mailing. Annual reconciliation is filed on TC-941R alongside W-2 copies in February.`,
    font, muted, 612 - 2 * margin, 8);
  return pdf.save();
}

async function render33HPdf({ company, year, quarter, totalGross, totalTaxable, totalExcess, suiRate, suiBase, taxDue, detail, rateEffective, rateSource }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.13);
  const muted = rgb(0.45, 0.5, 0.45);
  const accent = rgb(0.35, 0.39, 0.29);
  const margin = 40;
  let y = 792 - margin;

  page.drawText(`Utah Form 33H — Employer's Quarterly Wage List & Contribution Report`, { x: margin, y, size: 13, font: fontB, color: ink });
  y -= 16;
  page.drawText(`Quarter ${quarter} of ${year} · DWS account ${company.sui_account_number || '—'}`, { x: margin, y, size: 11, font, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: accent });
  y -= 18;

  const filer = company.legal_name || company.company_name || '';
  drawBox(page, margin, y, 530, 50, 'Employer name + address', `${filer}\n${company.address || ''}`, font, fontB, ink, muted);
  y -= 60;

  // Summary block
  page.drawText('Form 33H — Contribution summary', { x: margin, y, size: 11, font: fontB, color: ink });
  y -= 14;
  drawBox(page, margin, y, 260, 28, '1  Total wages paid this quarter', money(totalGross), font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 28, `2  SUI wage base (${money(suiBase)} per employee)`, money(suiBase), font, fontB, ink, muted);
  y -= 32;
  drawBox(page, margin, y, 260, 28, `3  Excess wages (over ${money(suiBase)} YTD per employee)`, money(totalExcess), font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 28, '4  Taxable wages (line 1 - line 3)', money(totalTaxable), font, fontB, ink, muted);
  y -= 32;
  const rateLabel = rateEffective
    ? `5  Assigned SUI rate (effective ${String(rateEffective).slice(0, 10)}${rateSource === 'notice' ? ', per DWS notice' : rateSource === 'provider' ? ', per previous provider' : ''})`
    : '5  Your assigned SUI rate';
  drawBox(page, margin, y, 260, 28, rateLabel, `${suiRate.toFixed(4)}%`, font, fontB, ink, muted);
  drawBox(page, margin + 270, y, 260, 32, '6  Contribution due (line 4 × line 5)', money(taxDue), font, fontB, ink, muted);
  y -= 38;

  // 33HA — Wage list (per-employee detail)
  page.drawText(`Form 33HA — Wage list (${detail.length} employee${detail.length === 1 ? '' : 's'})`, { x: margin, y, size: 11, font: fontB, color: ink });
  y -= 12;
  // Header
  page.drawText('SSN',          { x: margin,        y, size: 9, font: fontB, color: muted });
  page.drawText('Employee name',{ x: margin + 80,   y, size: 9, font: fontB, color: muted });
  page.drawText('Total wages',  { x: margin + 280,  y, size: 9, font: fontB, color: muted });
  page.drawText('Taxable wages',{ x: margin + 380,  y, size: 9, font: fontB, color: muted });
  page.drawText('Excess wages', { x: margin + 470,  y, size: 9, font: fontB, color: muted });
  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 0.5, color: muted });
  y -= 12;
  // Rows
  for (const d of detail.slice(0, 30)) {
    page.drawText(d.ssn_last4 ? `***-**-${d.ssn_last4}` : '—', { x: margin, y, size: 9, font, color: ink });
    page.drawText((d.name || '').slice(0, 32),               { x: margin + 80,  y, size: 9, font, color: ink });
    page.drawText(money(d.total_wages),                       { x: margin + 280, y, size: 9, font, color: ink });
    page.drawText(money(d.taxable_wages),                     { x: margin + 380, y, size: 9, font, color: ink });
    page.drawText(money(d.excess_wages),                      { x: margin + 470, y, size: 9, font, color: ink });
    y -= 12;
    if (y < 110) break;
  }
  if (detail.length > 30) {
    page.drawText(`+${detail.length - 30} more employees on continuation page`, { x: margin, y, size: 9, font, color: muted });
    y -= 12;
  }

  drawWrapped(page, margin, 80,
    `Filing path: file electronically via Utah DWS Web Filing at jobs.utah.gov/employer (preferred) — supports 33H + 33HA in one upload. Or mail to Utah Department of Workforce Services. Due last day of the month after the quarter ends. The wage list (33HA) is required even if total contribution is $0.`,
    font, muted, 612 - 2 * margin, 8);
  return pdf.save();
}

// ======================== Helpers ====================================
function drawBox(page: any, x: number, y: number, w: number, h: number, label: string, value: string, font: any, fontB: any, ink: any, muted: any) {
  page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: muted, borderWidth: 0.5 });
  page.drawText(label, { x: x + 4, y: y - 9, size: 7, font, color: muted });
  // Multi-line value
  const lines = String(value || '').split('\n');
  let cy = y - 22;
  for (const ln of lines.slice(0, 3)) {
    page.drawText(ln, { x: x + 4, y: cy, size: 10, font: fontB, color: ink });
    cy -= 11;
  }
}

function drawWrapped(page: any, x: number, y: number, text: string, font: any, color: any, maxWidth: number, size = 9) {
  const words = text.split(/\s+/);
  let line = ''; let cy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && line) {
      page.drawText(line, { x, y: cy, size, font, color });
      cy -= size + 3; line = w;
    } else {
      line = test;
    }
  }
  if (line) page.drawText(line, { x, y: cy, size, font, color });
}

function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
}
function safeName(s: string) { return s.replace(/[^a-z0-9._-]/gi, '_'); }
