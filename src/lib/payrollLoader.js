// One loader for a pay period: everything the engine needs, nothing else,
// and never half of it.
//
// docs/PAYROLL_PLAN.md step 2. The Payroll page and My Pay used to fetch the
// engine's inputs separately, with their own windows and column lists, and
// "three different loaders race" was one of the three causes of the last
// five payrolls going wrong. This is the one place those queries live. Both
// pages call it; the capture script (scripts/capture-payroll-fixture.mjs)
// mirrors it when it freezes a golden.
//
// If any one query fails the whole load fails (PayrollLoadError names the
// tables). A page is never handed a period with the hours in and the
// adjustments missing, because that renders as a cheque that is wrong, not
// as an error.
//
// Pure of React. The supabase client is passed in so a test can hand it a
// fake and read back exactly what was asked for.

import { localDateStr } from './localDate'
import { fetchRepCommissions } from './repCommissions'

export class PayrollLoadError extends Error {
  constructor(failed) {
    super(`Could not load the pay period: ${failed.map(f => `${f.table} (${f.message})`).join('; ')}`)
    this.name = 'PayrollLoadError'
    this.failed = failed
  }
}

/** The page's window for a period: local midnight to local end of day. */
export function periodWindow(period) {
  const start = new Date(period.start)
  start.setHours(0, 0, 0, 0)
  const end = new Date(period.end)
  end.setHours(23, 59, 59, 999)
  const legacyEnd = new Date(period.end)
  legacyEnd.setDate(legacyEnd.getDate() + 1)
  return {
    start, end,
    startIso: start.toISOString(), endIso: end.toISOString(),
    startStr: localDateStr(start), endStr: localDateStr(end),
    // Adjustments saved before the period-end correction carry an end one
    // day late (31 Aug was written as 1 Sep). Both are matched, so money
    // already entered is not orphaned.
    legacyEndStr: localDateStr(legacyEnd),
  }
}

// Column lists, shared with whoever else reads these tables for pay.
export const BONUS_SELECT = 'id, job_id, employee_id, amount, status, needs_verification, release_reason, saved_hours, allotted_hours, actual_hours, crew_size, paid_at, paid_payroll_run_id, queued_for_payroll, created_at, updated_at, jobs(job_title, customer_name, job_id, customer:customers!customer_id(name, business_name))'
export const BENEFIT_SELECT = 'id, employee_id, benefit_type, plan_name, employee_contribution, employer_contribution, is_pre_tax, frequency, status'
export const TIME_OFF_SELECT = 'id, employee_id, start_date, end_date, request_type, status, reason'
export const COMPANY_SELECT = 'id, state, state_employer_id_state, sui_rate_pct, sui_wage_base, futa_rate_pct, pay_frequency, pay_day_1, pay_day_2, federal_deposit_schedule, setter_qualification_rule'

// Which table each part reads, for the error that names what failed.
const TABLE_OF = { timeEntries: 'time_clock', timeLogEntries: 'time_log', leadCommissions: 'lead_commissions', repCommissions: 'rep_commissions', bonusRows: 'job_bonuses', periodTimeOff: 'time_off_requests', adjustments: 'payroll_adjustments', benefits: 'employee_benefits', ytdPaystubs: 'paystubs', payrollConfig: 'settings', company: 'companies', suiRateHistory: 'company_sui_rates' }

const PAGE = 1000
/** Every row, however many: PostgREST caps a query at 1,000 rows. */
async function allRows(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/**
 * Year-to-date wages before this check, per employee, from this year's stubs:
 * what the Social Security wage base and the Additional Medicare threshold
 * are measured against. taxable_wages where the stub has it, gross on older
 * stubs.
 */
export function ytdFromStubs(rows = []) {
  const map = {}
  for (const ps of rows || []) {
    const e = ps.employee_id
    if (!e) continue
    if (!map[e]) map[e] = { gross: 0, ssWages: 0, medicareWages: 0 }
    map[e].gross += Number(ps.gross_pay) || 0
    const tw = Number(ps.taxable_wages) || Number(ps.gross_pay) || 0
    map[e].ssWages += tw
    map[e].medicareWages += tw
  }
  return map
}

/**
 * Approved time off touching the period. On its own because the Payroll
 * page re-reads it when a request is approved, without reloading the period.
 */
export function periodTimeOffRows(supabase, { companyId, period, employeeId = null }) {
  const w = periodWindow(period)
  const own = (q) => (employeeId ? q.eq('employee_id', employeeId) : q)
  return allRows(() => own(supabase.from('time_off_requests').select(TIME_OFF_SELECT)
    .eq('company_id', companyId).eq('status', 'approved')
    .lte('start_date', w.endStr).gte('end_date', w.startStr)).order('id', { ascending: true }))
}

/**
 * @param {object} supabase  the client
 * @param {object} args
 *   companyId
 *   period: { start: Date, end: Date }
 *   employeeId: one person's rows only (My Pay); null for the company (Payroll)
 *   today: for the year-to-date year
 * @returns everything computeEmployeePay takes, by name, plus the company
 *   row and the settings it came from. Throws PayrollLoadError if any part
 *   could not be read.
 */
export async function loadPayrollPeriod(supabase, { companyId, period, employeeId = null, today = new Date() }) {
  if (!companyId) throw new PayrollLoadError([{ table: 'companies', message: 'no company' }])
  const w = periodWindow(period)
  const own = (q) => (employeeId ? q.eq('employee_id', employeeId) : q)
  const yearStart = `${today.getFullYear()}-01-01`

  const parts = {
    // Closed punches that started inside the period. Same window as the page
    // has always used: the punch is the day it began.
    timeEntries: () => allRows(() => own(supabase.from('time_clock').select('*')
      .eq('company_id', companyId)
      .gte('clock_in', w.startIso).lte('clock_in', w.endIso)
      .not('clock_out', 'is', null)).order('id', { ascending: true })),
    // Typed job hours for the period.
    timeLogEntries: () => allRows(() => own(supabase.from('time_log').select('*')
      .eq('company_id', companyId)
      .gte('created_at', w.startIso).lte('created_at', w.endIso)).order('id', { ascending: true })),
    // Setter fees booked in the period, with the lead named, plus any older
    // fee still unpaid: owed is owed, and the run pays it.
    leadCommissions: () => allRows(() => own(supabase.from('lead_commissions').select('*, lead:leads!lead_id(id, customer_name)')
      .eq('company_id', companyId)
      .or(`and(created_at.gte.${w.startIso},created_at.lte.${w.endIso}),and(payment_status.neq.paid,created_at.lte.${w.endIso})`)).order('id', { ascending: true })),
    // The frozen rep ledger (lib/repCommissions owns the columns).
    repCommissions: () => fetchRepCommissions(supabase, companyId, employeeId),
    // The bonus ledger, whole, with the job named.
    bonusRows: () => allRows(() => own(supabase.from('job_bonuses').select(BONUS_SELECT)
      .eq('company_id', companyId)).order('id', { ascending: true })),
    // Approved time off touching the period.
    periodTimeOff: () => periodTimeOffRows(supabase, { companyId, period, employeeId }),
    // This period's adjustments, and the recurring ones.
    adjustments: () => allRows(() => own(supabase.from('payroll_adjustments').select('*')
      .eq('company_id', companyId)
      .or(`and(pay_period_start.eq.${w.startStr},pay_period_end.in.(${w.endStr},${w.legacyEndStr})),recurring.eq.true`)).order('id', { ascending: true })),
    // Recurring deductions from the card.
    benefits: () => allRows(() => own(supabase.from('employee_benefits').select(BENEFIT_SELECT)
      .eq('company_id', companyId).eq('status', 'active')).order('id', { ascending: true })),
    // This year's stubs, for the wage bases.
    ytdPaystubs: () => allRows(() => own(supabase.from('paystubs').select('id, employee_id, payroll_run_id, pay_date, gross_pay, taxable_wages, social_security_employee, medicare_employee')
      .eq('company_id', companyId).gte('pay_date', yearStart)).order('id', { ascending: true })),
    payrollConfig: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'payroll_config').maybeSingle()
      if (error) throw error
      if (!data?.value) return {}
      try { return JSON.parse(data.value) } catch { throw new Error('payroll_config is not valid JSON') }
    },
    company: async () => {
      // The column list is written out here (not COMPANY_SELECT) so the
      // schema check reads it against the right table.
      const { data, error } = await supabase.from('companies').select('id, state, state_employer_id_state, sui_rate_pct, sui_wage_base, futa_rate_pct, pay_frequency, pay_day_1, pay_day_2, federal_deposit_schedule, setter_qualification_rule').eq('id', companyId).maybeSingle()
      if (error) throw error
      return data || {}
    },
    suiRateHistory: () => allRows(() => supabase.from('company_sui_rates').select('id, rate_pct, effective_date, source')
      .eq('company_id', companyId).order('effective_date', { ascending: false })),
  }

  const names = Object.keys(parts)
  const settled = await Promise.allSettled(names.map(n => parts[n]()))
  const failed = []
  const out = {}
  settled.forEach((r, i) => {
    if (r.status === 'rejected') failed.push({ part: names[i], table: TABLE_OF[names[i]] || names[i], message: r.reason?.message || String(r.reason) })
    else out[names[i]] = r.value
  })
  if (failed.length) throw new PayrollLoadError(failed)

  out.ytd = ytdFromStubs(out.ytdPaystubs)
  out.setterRule = out.company?.setter_qualification_rule || 'appointment_set'
  out.window = w
  return out
}
