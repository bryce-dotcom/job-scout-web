// Rehearse a pay period: the real engine, the real loader, the real guards,
// on live data, writing nothing.
//
// docs/PAYROLL_PLAN.md step 6. Used by scripts/rehearse-payroll.mjs (by
// hand) and api/cron/payroll-rehearsal.js (the day before every payday).
// The only write anywhere is the notice, and that is the caller's.

import { computeEmployeePay } from './payrollEngine'
import { loadPayrollPeriod } from './payrollLoader'
import { payrollRunGuards } from './payrollRunGuards'
import { payrollSetupProblems } from './payrollSetupGate'
import { setterCommissionSummary } from './setterCommissions'
import { getCurrentPayPeriod } from './bonusCalc'
import { payDateForPeriod } from './payDate'
import { suiRateInForce, suiWageBaseFor } from './suiRate'
import { localDateStr } from './localDate'

const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data }

/** The company's pay schedule, from the settings row over the company row. */
export async function payrollConfigFor(supabase, companyId) {
  const company = await one(supabase.from('companies').select('*').eq('id', companyId).maybeSingle())
  if (!company) return null
  const cfgRow = await one(supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'payroll_config').maybeSingle())
  let parsed = {}
  if (cfgRow?.value) { try { parsed = JSON.parse(cfgRow.value) } catch { parsed = {} } }
  return { company, payrollConfig: { pay_frequency: company.pay_frequency || 'semi-monthly', pay_day_1: company.pay_day_1, pay_day_2: company.pay_day_2, ...parsed }, hasConfig: !!cfgRow?.value }
}

/** The period that would run next and the day it pays, by the company's schedule. */
export function nextPayday(payrollConfig, today = new Date(), offset = 0) {
  const { periodStart, periodEnd } = getCurrentPayPeriod(payrollConfig, offset, today)
  return { periodStart, periodEnd, payDate: payDateForPeriod(periodEnd, payrollConfig) || localDateStr(today) }
}

/**
 * @returns {{ company, payDate, periodStart, periodEnd, paid, active, gross, net, withheld, employerTax, hours,
 *   stops: string[], warns: string[], lines: string[], people: string[], text: string, title: string, hr: object[] }}
 */
export async function rehearsePayroll(supabase, { companyId, offset = 0, today = new Date() }) {
  const cfg = await payrollConfigFor(supabase, companyId)
  if (!cfg) throw new Error(`no company ${companyId}`)
  const { company, payrollConfig } = cfg
  const { periodStart, periodEnd, payDate } = nextPayday(payrollConfig, today, offset)
  const period = { start: periodStart, end: periodEnd }
  const ps = localDateStr(periodStart), pe = localDateStr(periodEnd)

  const pd = await loadPayrollPeriod(supabase, { companyId, period, today })
  const employees = await one(supabase.from('employees').select('*').eq('company_id', companyId).order('id'))
  const active = employees.filter(e => e.active !== false)
  const openPunches = await one(supabase.from('time_clock').select('id, employee_id, clock_in').eq('company_id', companyId).is('clock_out', null))
  const priorRuns = await one(supabase.from('payroll_runs').select('id, period_start, period_end, pay_date, created_at, total_gross').eq('company_id', companyId))
  const priorStubs = await one(supabase.from('paystubs').select('employee_id, period_start, regular_hours, overtime_hours, hourly_rate, pay_date').eq('company_id', companyId).order('pay_date', { ascending: false }).limit(600))
  const inForce = suiRateInForce(pd.suiRateHistory, company, payDate)
  const taxCompany = { ...company, sui_rate_pct: inForce.ratePct, sui_wage_base: Number(company.sui_wage_base) || suiWageBaseFor(company.state_employer_id_state || company.state || 'UT', Number(payDate.slice(0, 4))) }

  const bonusesByEmployee = new Map()
  for (const b of pd.bonusRows) { if (!bonusesByEmployee.has(b.employee_id)) bonusesByEmployee.set(b.employee_id, []); bonusesByEmployee.get(b.employee_id).push(b) }
  const employeePayData = {}
  for (const emp of active) {
    employeePayData[emp.id] = computeEmployeePay({
      employee: emp, employees, timeEntries: pd.timeEntries, timeLogEntries: pd.timeLogEntries, payrollConfig,
      period, payDate, repCommissions: pd.repCommissions,
      leadCommissionSummary: setterCommissionSummary(pd.leadCommissions, emp.id, pd.setterRule),
      bonusRows: bonusesByEmployee.get(emp.id) || [],
      periodTimeOff: pd.periodTimeOff, adjustments: pd.adjustments, benefits: pd.benefits,
      ytd: pd.ytd[emp.id] || null, taxCompany,
    })
  }

  const payableIds = new Set(active.filter(e => { const d = employeePayData[e.id]; return d && ((d.grossPay || 0) > 0 || ((d.regularHours || 0) + (d.overtimeHours || 0) + (d.ptoHours || 0)) > 0) }).map(e => e.id))
  const setup = payrollSetupProblems({ company, payrollConfig, employees: active, w4Acknowledged: payrollConfig.w4_acknowledged || {}, payableIds })
  const guards = payrollRunGuards({
    employees: active, employeePayData, periodPunches: pd.timeEntries, openPunches, priorRuns,
    periodStart: ps, periodEnd: pe,
    ytdGrossByEmployee: Object.fromEntries(Object.entries(pd.ytd).map(([id, v]) => [id, v?.gross || 0])),
    priorStubsByEmployee: priorStubs.reduce((m, s) => { if (s.period_start === ps) return m; (m[s.employee_id] = m[s.employee_id] || []).push(s); return m }, {}),
    suiWageBase: taxCompany.sui_wage_base, repCommissions: pd.repCommissions,
  })

  const paid = active.filter(e => payableIds.has(e.id))
  const tot = (k) => r2(paid.reduce((s, e) => s + (Number(employeePayData[e.id]?.[k]) || 0), 0))
  const taxTot = (k) => r2(paid.reduce((s, e) => s + (Number(employeePayData[e.id]?.tax?.[k]) || 0), 0))
  const netOf = (d) => Number(d.tax ? d.tax.netPay : d.netPay) || 0
  const gross = tot('grossPay')
  const net = r2(paid.reduce((s, e) => s + netOf(employeePayData[e.id]), 0))
  const withheld = r2(['federalIncomeTax', 'stateIncomeTax', 'socialSecurityEmployee', 'medicareEmployee', 'additionalMedicare', 'famliEmployee'].reduce((s, k) => s + taxTot(k), 0))
  const employerTax = r2(['socialSecurityEmployer', 'medicareEmployer', 'futa', 'sui', 'famliEmployer'].reduce((s, k) => s + taxTot(k), 0))
  const hours = r2(paid.reduce((s, e) => s + (Number(employeePayData[e.id].regularHours) || 0) + (Number(employeePayData[e.id].overtimeHours) || 0), 0))
  const stops = [...setup.map(p => `setup: ${p.label}`), ...guards.blocks.map(b => `stop: ${b.label}`)]
  const warns = guards.warnings.map(w => `look: ${w.label}`)

  const lines = [
    `Period ${ps} to ${pe}, payday ${payDate}. ${paid.length} of ${active.length} active people have pay.`,
    `Gross ${money(gross)} · net ${money(net)} · withheld ${money(withheld)} · employer tax ${money(employerTax)} · total cost ${money(r2(gross + employerTax))} · ${hours} hours.`,
    `Commission ${money(tot('commissionPay'))} · bonus ${money(tot('bonusOwed'))} · PTO ${money(tot('ptoPay'))} · adjustments +${money(tot('totalAdditions'))} / -${money(tot('totalDeductions'))}.`,
  ]
  const prior = priorRuns.filter(r => r.pay_date < payDate).sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)))[0]
  if (prior) lines.push(`Last run (${prior.pay_date}): ${money(prior.total_gross)} gross.`)
  const people = paid.map(e => {
    const d = employeePayData[e.id]
    return `  ${e.name}: ${r2((d.regularHours || 0) + (d.overtimeHours || 0))}h${d.overtimeHours ? ` (${r2(d.overtimeHours)} OT)` : ''}, gross ${money(d.grossPay)}, net ${money(netOf(d))}${d.commissionPay ? `, commission ${money(d.commissionPay)}` : ''}${d.bonusOwed ? `, bonus ${money(d.bonusOwed)}` : ''}`
  })
  const head = stops.length ? `WOULD NOT RUN — ${stops.length} thing(s) to fix:\n  ${stops.join('\n  ')}\n` : 'Would run.'
  const looks = warns.length ? `Worth a look (${warns.length}):\n  ${warns.join('\n  ')}` : 'Nothing flagged.'
  const text = [head, looks, '', ...lines, '', 'By person:', ...people, '', 'Rehearsal only: nothing was written. Compare the total to your own number before you press Run Payroll.'].join('\n')
  const title = `Payroll rehearsal for ${payDate}: ${stops.length ? `${stops.length} thing(s) would stop it` : `${money(gross)} gross, would run`}`
  const hr = active.filter(e => e.has_hr_access || e.is_admin)
  return { company, payDate, periodStart: ps, periodEnd: pe, paid: paid.length, active: active.length, gross, net, withheld, employerTax, hours, stops, warns, lines, people, head, looks, text, title, hr }
}

/** The notice rows for every HR user, one per person per day for this payday. */
export function rehearsalNotices(result, { companyId, today = new Date() } = {}) {
  const day = localDateStr(today)
  return (result.hr || []).map(e => ({
    company_id: companyId, employee_id: e.id, type: 'crew_broadcast', route: '/payroll',
    title: result.title, message: result.text,
    dedupe_key: `payroll_rehearsal:${result.payDate}:${e.id}:${day}`,
    metadata: { pay_date: result.payDate, gross: result.gross, net: result.net, stops: result.stops.length, warnings: result.warns.length, from: 'Payroll rehearsal' },
  }))
}
