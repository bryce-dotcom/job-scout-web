// Capture a payroll run that was actually paid as a golden fixture.
//
// docs/PAYROLL_PLAN.md step 3. The engine (src/lib/payrollEngine.js) is a
// pure function of its inputs; a golden is those inputs for one real period
// plus the stubs that were paid for it. src/lib/payrollGolden.test.js replays
// every fixture through the engine and fails on the first cent that differs,
// which is what "no payroll change ships without a green replay" means.
//
// The inputs are read the way the Payroll page reads them (same tables, same
// windows). Rows a run has already paid are rewound to how they looked the
// morning of the run: a commission or bonus the run paid is "queued" again,
// one a LATER run paid is earned but not queued. Nothing is written.
//
// People are kept by id only: no names, emails, addresses, SSNs, bank
// details or dates of birth leave the database. Pay figures do, which is the
// point of the fixture.
//
//   node scripts/capture-payroll-fixture.mjs --company 3 --run 13
//   node scripts/capture-payroll-fixture.mjs --company 3 --run 41 --source gusto
//
// writes test/fixtures/payroll/<pay_date>-run<id>/{inputs,expected}.json

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const COMPANY_ID = Number(flag('--company'))
const RUN_ID = Number(flag('--run'))
const SOURCE = flag('--source', 'jobscout')          // jobscout | gusto: who produced the stubs
const OUT_ROOT = flag('--out', 'test/fixtures/payroll')
if (!COMPANY_ID || !RUN_ID) { console.error('usage: capture-payroll-fixture.mjs --company <id> --run <payroll_run id> [--source jobscout|gusto]'); process.exit(1) }

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const U = env.VITE_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const api = async (p) => { const r = await fetch(`${U}/rest/v1/${p}`, { headers: H }); const t = await r.text(); if (!r.ok) throw new Error(`GET ${p} ${r.status} ${t.slice(0, 300)}`); return JSON.parse(t) }
const all = async (p) => { const out = []; for (let from = 0; ; from += 1000) { const rows = await api(`${p}${p.includes('?') ? '&' : '?'}offset=${from}&limit=1000`); out.push(...rows); if (rows.length < 1000) break } return out }

// ── The run ─────────────────────────────────────────────────────────────
const [run] = await api(`payroll_runs?select=*&company_id=eq.${COMPANY_ID}&id=eq.${RUN_ID}`)
if (!run) { console.error(`no payroll_run ${RUN_ID} for company ${COMPANY_ID}`); process.exit(1) }
const ps = run.period_start, pe = run.period_end, payDate = run.pay_date
// The page's period: local midnight to local end of day. toISOString() of
// those is what its queries carry; the capture runs on the same machine
// (Mountain time) as the office, so the window is the office's window.
const local = (d) => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
const startIso = local(ps).toISOString()
const endD = local(pe); endD.setHours(23, 59, 59, 999); const endIso = endD.toISOString()
const legacyEnd = new Date(local(pe)); legacyEnd.setDate(legacyEnd.getDate() + 1)
const legacyEndStr = `${legacyEnd.getFullYear()}-${String(legacyEnd.getMonth() + 1).padStart(2, '0')}-${String(legacyEnd.getDate()).padStart(2, '0')}`

// ── Expected: the stubs that were paid ──────────────────────────────────
const STUB_COLS = 'id,employee_id,regular_hours,overtime_hours,pto_hours,hourly_rate,salary_amount,gross_pay,bonus_pay,commission_pay,reimbursement_pay,taxable_wages,federal_income_tax,state_income_tax,social_security_employee,social_security_employer,medicare_employee,medicare_employer,additional_medicare,futa,sui,famli_employee,famli_employer,pre_tax_deductions,post_tax_deductions,net_pay,amendment_reason'
const stubs = await api(`paystubs?select=${STUB_COLS}&company_id=eq.${COMPANY_ID}&payroll_run_id=eq.${RUN_ID}&order=employee_id`)
if (!stubs.length) { console.error('run has no stubs'); process.exit(1) }

// ── Inputs ──────────────────────────────────────────────────────────────
const PII = new Set(['name', 'email', 'phone', 'headshot_url', 'headshot', 'gusto_uuid', 'ssn_encrypted', 'ssn_last4', 'date_of_birth', 'home_address', 'home_city', 'home_zip', 'dd_account_encrypted', 'dd_routing_encrypted', 'dd_account_last4', 'dd_account_type', 'w9_legal_name', 'w9_business_name', 'w9_ein_encrypted', 'w9_ein_last4', 'license_last4', 'last_login', 'employee_id'])
const [cfgRow] = await api(`settings?select=value&company_id=eq.${COMPANY_ID}&key=eq.payroll_config`)
const payrollConfig = cfgRow?.value ? JSON.parse(cfgRow.value) : {}
const PERIODS = { weekly: 52, 'bi-weekly': 26, 'semi-monthly': 24, monthly: 12 }
const periodsPerYear = PERIODS[payrollConfig.pay_frequency] || 24

// The morning of the run: nothing made after payday existed yet.
const payDayEnd = new Date(local(payDate)); payDayEnd.setHours(23, 59, 59, 999)
const existedThen = (row) => !row.created_at || new Date(row.created_at) <= payDayEnd

// Someone hired after payday was not on that morning's list.
const employeesRaw = (await all(`employees?select=*&company_id=eq.${COMPANY_ID}&order=id`)).filter(e => existedThen(e) || stubs.some(s => s.employee_id === e.id))
const rateNotes = []
const stubbedEveryone = SOURCE !== 'gusto' && stubs.some(s => Number(s.gross_pay) === 0)
const employees = employeesRaw.map(e => {
  const o = {}
  for (const [k, v] of Object.entries(e)) if (!PII.has(k)) o[k] = v
  o.name = `emp_${e.id}`
  // The card as of the run: the stub recorded the rate and the salary. A
  // raise, or a move from hourly to salary since, must not move a golden.
  const s = stubs.find(x => x.employee_id === e.id)
  // The page wrote a stub for every active employee, zero or not. Someone
  // active today with no stub was not active that morning.
  if (!s) { if (stubbedEveryone && e.active !== false) { rateNotes.push(`emp_${e.id}: active now, no stub then — inactive in the fixture`); o.active = false } return o }
  // A stub means they were on the run; a card switched off since does not change that.
  if (e.active === false) { rateNotes.push(`emp_${e.id}: inactive now, paid then — active in the fixture`); o.active = true }
  if (Number(s.hourly_rate) > 0 && Math.abs(Number(s.hourly_rate) - Number(e.hourly_rate || 0)) > 0.004) { rateNotes.push(`emp_${e.id}: hourly ${e.hourly_rate} now, ${s.hourly_rate} on the stub`); o.hourly_rate = Number(s.hourly_rate) }
  const salaried = Number(s.salary_amount) > 0
  if (salaried !== !!e.is_salary) { rateNotes.push(`emp_${e.id}: ${e.is_salary ? 'salary' : 'not salary'} now, ${salaried ? 'salary' : 'no salary'} on the stub`); o.is_salary = salaried }
  if (salaried) {
    const annual = Math.round(Number(s.salary_amount) * periodsPerYear * 100) / 100
    if (Math.abs(annual - Number(e.annual_salary || 0)) > 0.5) { rateNotes.push(`emp_${e.id}: annual ${e.annual_salary} now, ${annual} on the stub`); o.annual_salary = annual }
  }
  const hourly = Number(s.regular_hours) + Number(s.overtime_hours) > 0 && Number(s.hourly_rate) > 0
  if (hourly !== !!e.is_hourly && (hourly || !salaried)) { rateNotes.push(`emp_${e.id}: ${e.is_hourly ? 'hourly' : 'not hourly'} now, ${hourly ? 'hourly' : 'no hours paid'} on the stub`); o.is_hourly = hourly }
  return o
})

const timeEntries = await all(`time_clock?select=id,employee_id,job_id,clock_in,clock_out,total_hours,lunch_start,lunch_end&company_id=eq.${COMPANY_ID}&clock_in=gte.${startIso}&clock_in=lte.${endIso}&clock_out=not.is.null&order=id`)
const timeLogEntries = await all(`time_log?select=*&company_id=eq.${COMPANY_ID}&created_at=gte.${startIso}&created_at=lte.${endIso}&order=id`)

// Commissions and bonuses, rewound to that morning: what THIS run paid is
// queued again; anything else is not (had it been queued, this run would
// have paid it). Older rows of rep_commissions carry no run id, only the
// day they were paid, so payday itself counts as "this run".
const paidByThisRun = (r) => r.paid_payroll_run_id === RUN_ID || (r.paid_payroll_run_id == null && String(r.paid_at || '').slice(0, 10) === payDate)
const rewindRep = (r) => {
  if (paidByThisRun(r)) return { ...r, payment_status: 'earned', queued_for_payroll: true, paid_at: null, paid_payroll_run_id: null, covered_by_salary: null }
  if (r.payment_status === 'paid' && ((r.paid_payroll_run_id && r.paid_payroll_run_id > RUN_ID) || String(r.paid_at || '').slice(0, 10) > payDate)) return { ...r, payment_status: 'earned', queued_for_payroll: false, paid_at: null, paid_payroll_run_id: null, covered_by_salary: null }
  return { ...r, queued_for_payroll: false }
}
const repCommissions = (await all(`rep_commissions?select=id,employee_id,invoice_id,job_id,payment_id,kind,amount,rate,basis_amount,earned_at,payment_status,paid_at,paid_payroll_run_id,covered_by_salary,queued_for_payroll,override_for_employee_id,created_at&company_id=eq.${COMPANY_ID}&order=id`)).filter(existedThen).map(rewindRep)
// lead_commissions has no paid_at and older rows no run id: a fee created in
// this period and marked paid with neither was paid by this run, the only
// run that saw it.
const leadCommissions = (await all(`lead_commissions?select=*&company_id=eq.${COMPANY_ID}&or=(and(created_at.gte.${startIso},created_at.lte.${endIso}),paid_payroll_run_id.eq.${RUN_ID})&order=id`)).filter(existedThen)
  .map(r => (r.payment_status === 'paid' && r.paid_payroll_run_id == null && !r.paid_at) ? { ...r, paid_payroll_run_id: RUN_ID } : r)
  .map(rewindRep)

const bonusRows = (await all(`job_bonuses?select=*&company_id=eq.${COMPANY_ID}&order=id`)).filter(existedThen).map(b => {
  if (paidByThisRun(b)) return { ...b, status: 'accrued', queued_for_payroll: true, needs_verification: false, paid_at: null, paid_payroll_run_id: null }
  if (b.status === 'paid' && ((b.paid_payroll_run_id && b.paid_payroll_run_id > RUN_ID) || String(b.paid_at || '').slice(0, 10) > payDate)) return { ...b, status: 'accrued', queued_for_payroll: false, paid_at: null, paid_payroll_run_id: null }
  return { ...b, queued_for_payroll: false }
})

const periodTimeOff = (await all(`time_off_requests?select=id,employee_id,start_date,end_date,request_type,status,created_at,approved_at&company_id=eq.${COMPANY_ID}&status=eq.approved&start_date=lte.${pe}&end_date=gte.${ps}`))
  .filter(r => existedThen(r) && (!r.approved_at || new Date(r.approved_at) <= payDayEnd))
const adjustments = (await all(`payroll_adjustments?select=*&company_id=eq.${COMPANY_ID}&or=(and(pay_period_start.eq.${ps},pay_period_end.in.(${pe},${legacyEndStr})),recurring.eq.true)&order=id`)).filter(existedThen)
const benefits = (await all(`employee_benefits?select=id,employee_id,benefit_type,plan_name,employee_contribution,employer_contribution,is_pre_tax,frequency,status,created_at&company_id=eq.${COMPANY_ID}&status=eq.active`)).filter(existedThen)

// Year to date before this run: this year's stubs paid before it (same-day
// runs count if they were made first).
const yearStart = `${payDate.slice(0, 4)}-01-01`
const ytdRows = await all(`paystubs?select=employee_id,payroll_run_id,pay_date,gross_pay,taxable_wages&company_id=eq.${COMPANY_ID}&pay_date=gte.${yearStart}&pay_date=lte.${payDate}`)
const ytd = {}
for (const s of ytdRows) {
  if (s.payroll_run_id === RUN_ID) continue
  if (s.pay_date === payDate && s.payroll_run_id > RUN_ID) continue
  const m = ytd[s.employee_id] || (ytd[s.employee_id] = { gross: 0, ssWages: 0, medicareWages: 0 })
  const tw = Number(s.taxable_wages) || Number(s.gross_pay) || 0
  m.gross += Number(s.gross_pay) || 0; m.ssWages += tw; m.medicareWages += tw
}

const [co] = await api(`companies?select=state,state_employer_id_state,sui_rate_pct,sui_wage_base,futa_rate_pct,pay_frequency,federal_deposit_schedule,setter_qualification_rule,entity_type&id=eq.${COMPANY_ID}`)
const { setter_qualification_rule: setterRule, ...taxCompany } = co
// The unemployment rate in force that day is on the stubs (sui ÷ wages).
// HHH's rate was corrected after its first run; the golden keeps the old one.
const suiRates = stubs.filter(s => Number(s.sui) > 0 && Number(s.gross_pay) > 0).map(s => Math.round(Number(s.sui) / Number(s.taxable_wages || s.gross_pay) * 10000) / 100).sort((a, b) => a - b)
if (suiRates.length) {
  const asOfRun = suiRates[Math.floor(suiRates.length / 2)]
  if (Math.abs(asOfRun - Number(taxCompany.sui_rate_pct || 0)) > 0.005) { rateNotes.push(`company: SUI ${taxCompany.sui_rate_pct}% now, ${asOfRun}% on the stubs`); taxCompany.sui_rate_pct = asOfRun }
}

// ── Write ───────────────────────────────────────────────────────────────
const dir = path.join(OUT_ROOT, `${payDate}-run${RUN_ID}`)
fs.mkdirSync(dir, { recursive: true })
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const expected = stubs.map(s => ({
  employee_id: s.employee_id,
  regular_hours: r2(s.regular_hours), overtime_hours: r2(s.overtime_hours), pto_hours: r2(s.pto_hours),
  hourly_rate: r2(s.hourly_rate), salary_amount: r2(s.salary_amount),
  gross_pay: r2(s.gross_pay), commission_pay: r2(s.commission_pay), bonus_pay: r2(s.bonus_pay), reimbursement_pay: r2(s.reimbursement_pay),
  taxable_wages: r2(s.taxable_wages),
  federal_income_tax: r2(s.federal_income_tax), state_income_tax: r2(s.state_income_tax),
  social_security_employee: r2(s.social_security_employee), medicare_employee: r2(s.medicare_employee), additional_medicare: r2(s.additional_medicare),
  futa: r2(s.futa), sui: r2(s.sui), famli_employee: r2(s.famli_employee),
  pre_tax_deductions: r2(s.pre_tax_deductions), post_tax_deductions: r2(s.post_tax_deductions),
  net_pay: r2(s.net_pay),
  amendment_reason: s.amendment_reason,
}))
const meta = {
  captured_at: new Date().toISOString(), company_id: COMPANY_ID, payroll_run_id: RUN_ID, source: SOURCE,
  period: { start: ps, end: pe }, pay_date: payDate,
  note: SOURCE === 'gusto'
    ? 'Stubs were produced by Gusto (hours typed by the office) and imported; the replay compares JobScout\'s own inputs with what Gusto paid.'
    : SOURCE === 'catch_up'
      ? 'A catch-up run: commissions and bonuses paid by JobScout for a period whose wages Gusto had paid, with stubs restored or rebuilt in October 2026. Not reproducible from the period\'s inputs; the replay reports, it does not assert.'
      : 'Stubs were produced by this engine\'s predecessor on the Payroll page; the replay must reproduce them to the cent.',
  rate_overrides: rateNotes,
  counts: { employees: employees.length, stubs: stubs.length, timeEntries: timeEntries.length, timeLogEntries: timeLogEntries.length, repCommissions: repCommissions.length, leadCommissions: leadCommissions.length, bonusRows: bonusRows.length, periodTimeOff: periodTimeOff.length, adjustments: adjustments.length, benefits: benefits.length },
}
fs.writeFileSync(path.join(dir, 'inputs.json'), JSON.stringify({ meta, period: { start: ps, end: pe }, payDate, payrollConfig, taxCompany, setterRule, employees, timeEntries, timeLogEntries, repCommissions, leadCommissions, bonusRows, periodTimeOff, adjustments, benefits, ytd }, null, 1) + '\n')
fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify({ meta, stubs: expected }, null, 1) + '\n')
console.log(`wrote ${dir}: ${stubs.length} stubs, ${JSON.stringify(meta.counts)}`)
for (const n of rateNotes) console.log('  rate as of the run:', n)
