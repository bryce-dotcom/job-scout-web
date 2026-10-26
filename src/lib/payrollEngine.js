// The payroll engine: one employee's pay for one period, as a pure function.
//
// Bryce, 2026-10-20: "the last 5 payrolls are always fucked up… every single
// line of code checked against what we are doing." docs/PAYROLL_PLAN.md,
// step 2. Until now this math lived inside the Payroll page as closures over
// forty pieces of React state, recomputed on every render in whatever order
// the data happened to load. It could not be called from a test, from My
// Pay, or from a script that replays a real period.
//
// This file is that math, moved, not changed. Every input is a plain value
// handed in by the caller; nothing here reads the database, React, or the
// clock. The page and My Pay call it; the golden replays call it with a
// frozen period and assert the cheques that were actually written.
//
// Keep it that way: no imports of supabase, no useX, no new Date() without
// a `today` argument.
import { calcPaystubTax, normalizePayFrequency } from './payrollTax'
import { benefitDeductionsForPeriod } from './benefitDeductions'
import { ptoDaysInPeriod, ptoPayForPeriod } from './ptoThisPeriod'
import { greaterOfPay, paysGreaterOf } from './payBasis'
import { payableBonusTotal } from './bonusLedger'
import { localDateStr } from './localDate'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * How far back an unpaid commission rides onto a run on its own: one missed
 * period plus slack. Older rows need somebody to put them in the payroll.
 */
export const COMMISSION_CARRY_DAYS = 45
export function commissionCarryFrom(periodStart) {
  const d = new Date(periodStart)
  d.setDate(d.getDate() - COMMISSION_CARRY_DAYS)
  return localDateStr(d)
}

/**
 * Hours worked this period, from the time clock first and the time log
 * where the clock has nothing for that day. Never both for one day.
 * Weekly overtime by the employee's own mode: 'overtime' (1.5× over the
 * threshold), 'bonus' (over-threshold hours tracked but paid at base; the
 * bonus program pays the rest), 'none' (every hour at base).
 */
export function employeeHours({ employee, employees = [], timeEntries = [], timeLogEntries = [], payrollConfig = {} }) {
  const employeeId = employee?.id
  const empEntries = (timeEntries || []).filter(e => e.employee_id === employeeId)
  const empTimeLogs = (timeLogEntries || []).filter(e => e.employee_id === employeeId)
  let regularHours = 0
  let overtimeHours = 0

  const dayKey = (d) => new Date(d).toISOString().slice(0, 10)
  const weekKey = (d) => {
    const w = new Date(d)
    w.setDate(w.getDate() - w.getDay())
    return w.toISOString().slice(0, 10)
  }
  const dayMap = {}
  const ensureDay = (d) => {
    const dk = dayKey(d)
    if (!dayMap[dk]) dayMap[dk] = { week: weekKey(d), clockHours: 0, logHours: 0 }
    return dayMap[dk]
  }

  empEntries.forEach(entry => {
    let hours = entry.total_hours
    if (!hours && entry.clock_in && entry.clock_out) {
      hours = Math.round((new Date(entry.clock_out) - new Date(entry.clock_in)) / 36e5 * 100) / 100
    }
    if (!hours || !entry.clock_in) return
    ensureDay(entry.clock_in).clockHours += hours
  })
  empTimeLogs.forEach(entry => {
    if (!entry.hours) return
    const dt = entry.date || entry.clock_in_time || entry.created_at
    if (!dt) return
    ensureDay(dt).logHours += entry.hours
  })

  const weeklyHours = {}
  Object.values(dayMap).forEach(({ week, clockHours, logHours }) => {
    const hrs = clockHours > 0 ? clockHours : logHours
    weeklyHours[week] = (weeklyHours[week] || 0) + hrs
  })

  const otThreshold = payrollConfig.overtime_threshold || 40
  const empRow = (employees || []).find(e => e.id === employeeId) || employee
  const empMode = empRow?.overtime_mode || payrollConfig.overtime_mode || 'overtime'
  Object.values(weeklyHours).forEach(hours => {
    if (empMode === 'none') {
      regularHours += hours
    } else if (hours <= otThreshold) {
      regularHours += hours
    } else {
      regularHours += otThreshold
      overtimeHours += hours - otThreshold
    }
  })

  return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours, otMode: empMode }
}

/**
 * One employee's pay for the period: hours, salary, PTO, commissions, bonus,
 * adjustments, recurring deductions, taxes, net. Same shape the Payroll page
 * has always produced, so every reader of `employeePayData` is unchanged.
 *
 * @param {object} args
 *   employee, employees, timeEntries, timeLogEntries, payrollConfig
 *   period: { start: Date, end: Date }       the pay period
 *   payDate: 'YYYY-MM-DD'                     the day it is paid (picks tax tables)
 *   repCommissions: rep_commissions rows (frozen ledger)
 *   leadCommissionSummary: setterCommissionSummary(...) for this employee
 *   invoiceCommissions: the live invoice calc for this employee (display only)
 *   efficiencyBonus: the live bonus calc for this employee (display only)
 *   bonusRows: this employee's job_bonuses rows
 *   periodTimeOff, adjustments, benefits
 *   ytd: { gross, ssWages, medicareWages } before this check
 *   taxCompany: the company row with the SUI rate in force
 */
export function computeEmployeePay({
  employee, employees = [], timeEntries = [], timeLogEntries = [], payrollConfig = {},
  period, payDate,
  repCommissions = [], leadCommissionSummary = { details: [] }, invoiceCommissions = { available: 0, pending: 0, details: [] },
  efficiencyBonus = null, bonusRows = [],
  periodTimeOff = [], adjustments = [], benefits = [],
  ytd = null, taxCompany = null,
}) {
  const { regularHours, overtimeHours, otMode } = employeeHours({ employee, employees, timeEntries, timeLogEntries, payrollConfig })
  const hourlyRate = employee.hourly_rate || 0
  const annualSalary = employee.annual_salary || 0
  const otMultiplier = otMode === 'overtime' ? (payrollConfig.overtime_multiplier || 1.5) : 1.0

  let hourlyPay = 0
  let salaryPay = 0
  if (employee.is_hourly) {
    hourlyPay = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * otMultiplier)
  }
  if (employee.is_salary) {
    const periodsPerYear = payrollConfig.pay_frequency === 'weekly' ? 52 :
      payrollConfig.pay_frequency === 'bi-weekly' ? 26 :
        payrollConfig.pay_frequency === 'semi-monthly' ? 24 : 12
    salaryPay = annualSalary / periodsPerYear
  }

  // Commissions. Earned in the period is paid in the period (Bryce, 23 Oct
  // 2026, on Doug's My Pay: "the ones that show he earned this pay period
  // have not been paid… my pay should show that those will be paid this pay
  // period"). Until then a run paid only what somebody had pressed Add to
  // payroll on, so an earned commission waited on the office and My Pay
  // could not promise it. The only thing that keeps an earned row off the
  // cheque now is a hold: "Remove from payroll" sets held_from_payroll.
  const invoiceComm = invoiceCommissions
  const leadComm = leadCommissionSummary || { details: [] }
  const cfpStart = period.start, cfpEnd = period.end
  const cfpS = localDateStr(cfpStart), cfpE = localDateStr(cfpEnd)
  const sumAmt = (rows) => rows.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0)
  const greaterOf = paysGreaterOf(employee)
  // Owed is owed: a row earned before this period and still unpaid (Doug's
  // September commission sat through two runs) is paid on this one, and the
  // check says how much of it is older than the period. Two limits: nothing
  // dated after the period end is paid early, and nothing older than the
  // carry window rides along on its own — HHH had $18k of unpaid rows going
  // back months, most of them paid some other way, and the first run under
  // this rule would have paid them all. An older row is paid when somebody
  // puts it in the payroll (queued_for_payroll), which is a decision.
  const dayOf = (d) => String(d || '').slice(0, 10)
  const carryFrom = commissionCarryFrom(cfpStart)
  const carried = (d, queued) => queued || dayOf(d) >= carryFrom
  const earnedSetterRows = (leadComm.details || []).filter(c => c.id)
  const earnedRepRows = (repCommissions || [])
    .filter(r => r.employee_id === employee.id && r.payment_status === 'earned' && dayOf(r.earned_at) >= cfpS && dayOf(r.earned_at) <= cfpE)
  const owedRepRows = (repCommissions || [])
    .filter(r => r.employee_id === employee.id && r.payment_status === 'earned' && dayOf(r.earned_at) <= cfpE && carried(r.earned_at, r.queued_for_payroll))
  const payableSetterRows = earnedSetterRows.filter(c => !c.held_from_payroll && (!c.created_at || (dayOf(c.created_at) <= cfpE && carried(c.created_at, c.queued_for_payroll))))
  const payableRepRows = owedRepRows.filter(r => !r.held_from_payroll)
  const earnedSetter = sumAmt(earnedSetterRows)
  const earnedRep = sumAmt(earnedRepRows)
  // Salary or commission, whichever is more (lib/payBasis): the comparison
  // weighs the period's WHOLE commission, held or not.
  const commissionEarnedThisPeriod = greaterOf ? earnedSetter + earnedRep : sumAmt(payableSetterRows) + sumAmt(payableRepRows)
  const commissionHeld = greaterOf ? 0 : r2(sumAmt(owedRepRows.filter(r => r.held_from_payroll)) + sumAmt(earnedSetterRows.filter(c => c.held_from_payroll)))
  const commissionCarried = greaterOf ? 0 : r2(sumAmt(payableRepRows.filter(r => dayOf(r.earned_at) < cfpS)) + sumAmt(payableSetterRows.filter(c => c.created_at && dayOf(c.created_at) < cfpS)))

  const payBasis = greaterOfPay({ salaryPay, commissionPay: commissionEarnedThisPeriod, enabled: greaterOf })
  salaryPay = payBasis.salaryPaid
  const commissionPay = payBasis.commissionPaid

  // Bonus: only what is queued and payable now (lib/bonusLedger, shared with My Pay).
  const bonusOwed = payableBonusTotal(bonusRows || [])

  // PTO this period, at the card's rate.
  const ptoDays = ptoDaysInPeriod(periodTimeOff, employee.id, cfpStart, cfpEnd)
  const { hours: ptoHours, pay: ptoPay } = ptoPayForPeriod(employee, ptoDays)

  const grossPay = hourlyPay + salaryPay + ptoPay + commissionPay + bonusOwed

  // Adjustments; legacy bonus_override additions are not money.
  const empAdjustments = (adjustments || []).filter(a => a.employee_id === employee.id && a.category !== 'bonus_override')
  const totalAdditions = empAdjustments.filter(a => a.type === 'addition').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
  const totalDeductions = empAdjustments.filter(a => a.type === 'deduction').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
  const taxableGross = grossPay + totalAdditions

  // Recurring deductions from the card; nothing to deduct from no pay, and a
  // pre-tax deduction cannot exceed the pay it comes off.
  const benefitRaw = taxableGross > 0
    ? benefitDeductionsForPeriod(benefits, employee.id, normalizePayFrequency(payrollConfig.pay_frequency))
    : { section125: 0, retirement: 0, postTax: 0, preTaxTotal: 0, employerCost: 0, lines: [] }
  const benefitDed = {
    ...benefitRaw,
    section125: Math.min(benefitRaw.section125, taxableGross),
    retirement: Math.min(benefitRaw.retirement, Math.max(0, taxableGross - Math.min(benefitRaw.section125, taxableGross))),
  }
  benefitDed.preTaxTotal = r2(benefitDed.section125 + benefitDed.retirement)

  // Taxes. A contractor gets none; the engine is skipped entirely.
  const is1099 = employee.tax_classification === '1099'
  let tax = null
  let hasW4 = false
  if (!is1099) {
    const ytdForEmp = ytd || { gross: 0, ssWages: 0, medicareWages: 0 }
    tax = calcPaystubTax({
      employee,
      company: taxCompany,
      gross: taxableGross,
      ytd: ytdForEmp,
      payFrequency: normalizePayFrequency(payrollConfig.pay_frequency),
      preTaxDeductions: benefitDed.section125,
      preTaxRetirement: benefitDed.retirement,
      postTaxDeductions: totalDeductions + benefitDed.postTax,
      payDate,
      employeeCount: (employees || []).filter(e => e.active !== false && e.tax_classification !== '1099').length,
    })
    hasW4 = !!employee.w4_filing_status
  }

  return {
    hourlyPay,
    salaryPay,
    payBasis,
    commissionEarnedThisPeriod,
    commissionHeld,
    commissionCarried,
    weighedCommissionRows: greaterOf ? { rep: earnedRepRows.map(r => r.id).filter(Boolean), lead: earnedSetterRows.map(c => c.id).filter(Boolean) } : null,
    // The rows this check pays, for the run to mark by id. Greater-of rows
    // are settled through weighedCommissionRows instead.
    paidCommissionRows: greaterOf ? null : { rep: payableRepRows.map(r => r.id).filter(Boolean), lead: payableSetterRows.map(c => c.id).filter(Boolean) },
    regularHours,
    overtimeHours,
    hourlyRate,
    ptoDays,
    ptoHours,
    ptoPay,
    commissionPay,
    invoiceCommissions: invoiceComm,
    leadCommissions: leadComm,
    efficiencyBonus,
    bonusOwed: r2(bonusOwed),
    grossPay: r2(grossPay),
    totalAdditions: r2(totalAdditions),
    totalDeductions: r2(totalDeductions),
    benefitLines: benefitDed.lines,
    benefitEmployerCost: benefitDed.employerCost,
    netPay: r2(grossPay + totalAdditions - totalDeductions - (is1099 ? 0 : benefitDed.postTax + benefitDed.preTaxTotal)),
    adjustments: empAdjustments,
    tax,
    hasW4,
    is1099,
  }
}
