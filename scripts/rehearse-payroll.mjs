// Rehearse a pay period: the real engine, the real loader, the real guards,
// on production data, writing nothing.
//
// docs/PAYROLL_PLAN.md step 6. The build that ships is the build in
// production, so the rehearsal is not a second tenant: it is this period run
// through src/lib/payrollEngine the way the Payroll page will run it, a day
// early, with the result in front of the office before anyone presses the
// button. Totals, every guard that would stop or warn, and (with --notify)
// a notice to every HR user so Alayda can hold the total against her own.
//
//   node scripts/rehearse-payroll.mjs --company 3                 this period, print totals
//   node scripts/rehearse-payroll.mjs --company 3 --people        and the per-person lines
//   node scripts/rehearse-payroll.mjs --company 3 --notify        and send the notice to HR
//   node scripts/rehearse-payroll.mjs --company 3 --offset -1     the previous period
//
// Reads with the service key; the only write is the notice, and only with --notify.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const COMPANY_ID = Number(flag('--company'))
const OFFSET = Number(flag('--offset', '0')) || 0
const NOTIFY = args.includes('--notify'), PEOPLE = args.includes('--people')
if (!COMPANY_ID) { console.error('usage: rehearse-payroll.mjs --company <id> [--offset n] [--people] [--notify]'); process.exit(1) }

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// src/lib uses extensionless imports (Vite resolves them); bundle the pieces first.
const { build } = await import('esbuild')
const bundled = path.join(os.tmpdir(), 'jobscout-payroll-rehearsal.mjs')
await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'js',
    contents: `
      export { computeEmployeePay } from './src/lib/payrollEngine.js'
      export { loadPayrollPeriod } from './src/lib/payrollLoader.js'
      export { payrollRunGuards } from './src/lib/payrollRunGuards.js'
      export { payrollSetupProblems } from './src/lib/payrollSetupGate.js'
      export { setterCommissionSummary } from './src/lib/setterCommissions.js'
      export { getCurrentPayPeriod } from './src/lib/bonusCalc.js'
      export { payDateForPeriod } from './src/lib/payDate.js'
      export { suiRateInForce, suiWageBaseFor } from './src/lib/suiRate.js'
      export { localDateStr } from './src/lib/localDate.js'
    `,
  },
  bundle: true, format: 'esm', platform: 'node', outfile: bundled, logLevel: 'silent',
})
const lib = await import(pathToFileURL(bundled).href)

const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data }

// ── The company and the period ──────────────────────────────────────────
const company = (await one(supabase.from('companies').select('*').eq('id', COMPANY_ID).maybeSingle()))
if (!company) { console.error('no such company'); process.exit(1) }
const cfgRow = await one(supabase.from('settings').select('value').eq('company_id', COMPANY_ID).eq('key', 'payroll_config').maybeSingle())
const payrollConfig = { pay_frequency: company.pay_frequency || 'semi-monthly', pay_day_1: company.pay_day_1, pay_day_2: company.pay_day_2, ...(cfgRow?.value ? JSON.parse(cfgRow.value) : {}) }
const { periodStart, periodEnd } = lib.getCurrentPayPeriod(payrollConfig, OFFSET)
const period = { start: periodStart, end: periodEnd }
const ps = lib.localDateStr(periodStart), pe = lib.localDateStr(periodEnd)
const payDate = lib.payDateForPeriod(periodEnd, payrollConfig) || lib.localDateStr(new Date())

// ── Everything the page would load ──────────────────────────────────────
const pd = await lib.loadPayrollPeriod(supabase, { companyId: COMPANY_ID, period })
const employees = await one(supabase.from('employees').select('*').eq('company_id', COMPANY_ID).order('id'))
const active = employees.filter(e => e.active !== false)
const openPunches = await one(supabase.from('time_clock').select('id, employee_id, clock_in').eq('company_id', COMPANY_ID).is('clock_out', null))
const priorRuns = await one(supabase.from('payroll_runs').select('id, period_start, period_end, pay_date, created_at, total_gross').eq('company_id', COMPANY_ID))
const priorStubs = await one(supabase.from('paystubs').select('employee_id, period_start, regular_hours, overtime_hours, hourly_rate, pay_date').eq('company_id', COMPANY_ID).order('pay_date', { ascending: false }).limit(600))
const inForce = lib.suiRateInForce(pd.suiRateHistory, company, payDate)
const taxCompany = { ...company, sui_rate_pct: inForce.ratePct, sui_wage_base: Number(company.sui_wage_base) || lib.suiWageBaseFor(company.state_employer_id_state || 'UT', Number(payDate.slice(0, 4))) }

// ── The engine, once per person ─────────────────────────────────────────
const bonusesByEmployee = new Map()
for (const b of pd.bonusRows) { if (!bonusesByEmployee.has(b.employee_id)) bonusesByEmployee.set(b.employee_id, []); bonusesByEmployee.get(b.employee_id).push(b) }
const employeePayData = {}
for (const emp of active) {
  employeePayData[emp.id] = lib.computeEmployeePay({
    employee: emp, employees, timeEntries: pd.timeEntries, timeLogEntries: pd.timeLogEntries, payrollConfig,
    period, payDate, repCommissions: pd.repCommissions,
    leadCommissionSummary: lib.setterCommissionSummary(pd.leadCommissions, emp.id, pd.setterRule),
    bonusRows: bonusesByEmployee.get(emp.id) || [],
    periodTimeOff: pd.periodTimeOff, adjustments: pd.adjustments, benefits: pd.benefits,
    ytd: pd.ytd[emp.id] || null, taxCompany,
  })
}

// ── What would stop it ──────────────────────────────────────────────────
const payableIds = new Set(active.filter(e => { const d = employeePayData[e.id]; return d && ((d.grossPay || 0) > 0 || ((d.regularHours || 0) + (d.overtimeHours || 0) + (d.ptoHours || 0)) > 0) }).map(e => e.id))
const setup = lib.payrollSetupProblems({ company, payrollConfig, employees: active, w4Acknowledged: payrollConfig.w4_acknowledged || {}, payableIds })
const guards = lib.payrollRunGuards({
  employees: active, employeePayData, periodPunches: pd.timeEntries, openPunches, priorRuns,
  periodStart: ps, periodEnd: pe,
  ytdGrossByEmployee: Object.fromEntries(Object.entries(pd.ytd).map(([id, v]) => [id, v?.gross || 0])),
  priorStubsByEmployee: priorStubs.reduce((m, s) => { if (s.period_start === ps) return m; (m[s.employee_id] = m[s.employee_id] || []).push(s); return m }, {}),
  suiWageBase: taxCompany.sui_wage_base, repCommissions: pd.repCommissions,
})

// ── The report ──────────────────────────────────────────────────────────
const paid = active.filter(e => payableIds.has(e.id))
const tot = (k, rows = paid) => r2(rows.reduce((s, e) => s + (Number(employeePayData[e.id]?.[k]) || 0), 0))
const taxTot = (k) => r2(paid.reduce((s, e) => s + (Number(employeePayData[e.id]?.tax?.[k]) || 0), 0))
const gross = tot('grossPay')
const net = r2(paid.reduce((s, e) => { const d = employeePayData[e.id]; return s + (Number(d.tax ? d.tax.netPay : d.netPay) || 0) }, 0))
const ee = r2(['federalIncomeTax', 'stateIncomeTax', 'socialSecurityEmployee', 'medicareEmployee', 'additionalMedicare', 'famliEmployee'].reduce((s, k) => s + taxTot(k), 0))
const er = r2(['socialSecurityEmployer', 'medicareEmployer', 'futa', 'sui', 'famliEmployer'].reduce((s, k) => s + taxTot(k), 0))
const hours = r2(paid.reduce((s, e) => s + (Number(employeePayData[e.id].regularHours) || 0) + (Number(employeePayData[e.id].overtimeHours) || 0), 0))
const stops = [...setup.map(p => `setup: ${p.label}`), ...guards.blocks.map(b => `stop: ${b.label}`)]
const warns = guards.warnings.map(w => `look: ${w.label}`)
const lines = []
lines.push(`Period ${ps} to ${pe}, payday ${payDate}. ${paid.length} of ${active.length} active people have pay.`)
lines.push(`Gross ${money(gross)} · net ${money(net)} · withheld ${money(ee)} · employer tax ${money(er)} · total cost ${money(r2(gross + er))} · ${hours} hours.`)
lines.push(`Commission ${money(tot('commissionPay'))} · bonus ${money(tot('bonusOwed'))} · PTO ${money(tot('ptoPay'))} · adjustments +${money(tot('totalAdditions'))} / -${money(tot('totalDeductions'))}.`)
const prior = priorRuns.filter(r => r.pay_date < payDate).sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)))[0]
if (prior) lines.push(`Last run (${prior.pay_date}): ${money(prior.total_gross)} gross.`)
const people = paid.map(e => { const d = employeePayData[e.id]; const n = d.tax ? d.tax.netPay : d.netPay; return `  ${e.name}: ${r2((d.regularHours || 0) + (d.overtimeHours || 0))}h${d.overtimeHours ? ` (${r2(d.overtimeHours)} OT)` : ''}, gross ${money(d.grossPay)}, net ${money(n)}${d.commissionPay ? `, commission ${money(d.commissionPay)}` : ''}${d.bonusOwed ? `, bonus ${money(d.bonusOwed)}` : ''}` })

const head = stops.length ? `WOULD NOT RUN — ${stops.length} thing(s) to fix:\n  ${stops.join('\n  ')}\n` : 'Would run.'
const text = [head, warns.length ? `Worth a look (${warns.length}):\n  ${warns.join('\n  ')}` : 'Nothing flagged.', '', ...lines, '', 'By person:', ...people, '', 'Rehearsal only: nothing was written. Compare the total to your own number before you press Run Payroll.'].join('\n')

console.log([head, warns.length ? `Worth a look (${warns.length}):\n  ${warns.join('\n  ')}` : 'Nothing flagged.', '', ...lines].join('\n'))
if (PEOPLE) console.log(['', 'By person:', ...people].join('\n'))

if (NOTIFY) {
  const hr = active.filter(e => e.has_hr_access || e.is_admin)
  const today = new Date().toISOString().slice(0, 10)
  const rows = hr.map(e => ({
    company_id: COMPANY_ID, employee_id: e.id, type: 'crew_broadcast', route: '/payroll',
    title: `Payroll rehearsal for ${payDate}: ${stops.length ? `${stops.length} thing(s) would stop it` : `${money(gross)} gross, would run`}`,
    message: text, dedupe_key: `payroll_rehearsal:${payDate}:${e.id}:${today}`,
    metadata: { pay_date: payDate, gross, net, stops: stops.length, warnings: warns.length, from: 'Payroll rehearsal' },
  }))
  if (rows.length) { const { error } = await supabase.from('employee_notifications').insert(rows); if (error) throw new Error(error.message) }
  console.log(`\nnotice sent to ${rows.length} HR user(s)`)
}
