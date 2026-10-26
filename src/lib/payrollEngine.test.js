import { describe, it, expect } from 'vitest'
import { employeeHours, computeEmployeePay } from './payrollEngine'

// The engine is the Payroll page's math moved out where a test can reach it.
// These pin the behaviours the page has always had, so the move changed
// nothing; the golden replays (docs/PAYROLL_PLAN.md step 3) pin real periods.

const company = { state_employer_id_state: 'UT', sui_rate_pct: 0.2, futa_rate_pct: 0.6 }
const cfg = { pay_frequency: 'semi-monthly', overtime_threshold: 40, overtime_multiplier: 1.5 }
const period = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 15) }
const base = (employee, over = {}) => ({
  employee, employees: [employee], payrollConfig: cfg, period, payDate: '2026-10-20', taxCompany: company, ...over,
})

describe('employeeHours', () => {
  const emp = { id: 1, overtime_mode: 'overtime' }
  it('the clock wins over the log for a day, never both', () => {
    const r = employeeHours({ employee: emp, employees: [emp], payrollConfig: cfg,
      timeEntries: [{ employee_id: 1, clock_in: '2026-10-05T14:00:00Z', total_hours: 8 }],
      timeLogEntries: [{ employee_id: 1, date: '2026-10-05', hours: 6 }, { employee_id: 1, date: '2026-10-06', hours: 5 }] })
    expect(r.totalHours).toBe(13)
  })
  it('overtime is weekly, over the threshold, in overtime mode only', () => {
    // Oct 5–9, 2026 is Monday to Friday of one week; Oct 1–5 would straddle two.
    const entries = [5, 6, 7, 8, 9].map(d => ({ employee_id: 1, clock_in: `2026-10-0${d}T14:00:00Z`, total_hours: 10 }))
    const ot = employeeHours({ employee: emp, employees: [emp], payrollConfig: cfg, timeEntries: entries })
    expect(ot.regularHours).toBe(40); expect(ot.overtimeHours).toBe(10)
    const none = employeeHours({ employee: { ...emp, overtime_mode: 'none' }, employees: [], payrollConfig: cfg, timeEntries: entries })
    expect(none.regularHours).toBe(50); expect(none.overtimeHours).toBe(0)
  })
})

describe('computeEmployeePay', () => {
  it('hourly: hours × rate, overtime at 1.5×, taxed, net below gross', () => {
    const emp = { id: 1, is_hourly: true, hourly_rate: 20, tax_classification: 'W2', w4_filing_status: 'single', overtime_mode: 'overtime' }
    const entries = [5, 6, 7, 8, 9].map(d => ({ employee_id: 1, clock_in: `2026-10-0${d}T14:00:00Z`, total_hours: 10 }))
    const p = computeEmployeePay(base(emp, { timeEntries: entries }))
    expect(p.hourlyPay).toBe(40 * 20 + 10 * 20 * 1.5)
    expect(p.grossPay).toBe(1100)
    expect(p.tax.netPay).toBeLessThan(1100)
    expect(p.hasW4).toBe(true)
  })
  it('salary splits by the pay frequency', () => {
    const emp = { id: 2, is_salary: true, annual_salary: 96000, tax_classification: 'W2', w4_filing_status: 'single' }
    expect(computeEmployeePay(base(emp)).salaryPay).toBe(4000)
    expect(computeEmployeePay(base(emp, { payrollConfig: { ...cfg, pay_frequency: 'bi-weekly' } })).salaryPay).toBeCloseTo(96000 / 26, 2)
  })
  it('a run pays every commission earned in the period, unless the office held it', () => {
    // Bryce, 23 Oct 2026: earned this pay period means paid this pay period.
    const emp = { id: 3, is_commission: true, tax_classification: '1099' }
    const rows = [
      { id: 10, employee_id: 3, amount: 500, payment_status: 'earned', queued_for_payroll: true, earned_at: '2026-10-05T12:00:00Z' },
      { id: 11, employee_id: 3, amount: 700, payment_status: 'earned', queued_for_payroll: false, earned_at: '2026-10-06T12:00:00Z' },
      { id: 13, employee_id: 3, amount: 300, payment_status: 'earned', held_from_payroll: true, earned_at: '2026-10-07T12:00:00Z' },
      { id: 12, employee_id: 3, amount: 900, payment_status: 'earned', queued_for_payroll: true, earned_at: '2026-09-20T12:00:00Z' },
      { id: 14, employee_id: 3, amount: 50, payment_status: 'paid', earned_at: '2026-10-08T12:00:00Z' },
    ]
    const p = computeEmployeePay(base(emp, { repCommissions: rows }))
    // 500 staged + 700 not staged + last period's 900 that nobody ever paid;
    // the held 300 stays off, and the paid 50 is not paid again
    expect(p.commissionPay).toBe(2100)
    expect(p.commissionHeld).toBe(300)
    expect(p.commissionCarried).toBe(900)
    expect(p.paidCommissionRows).toEqual({ rep: [10, 11, 12], lead: [] })
    expect(p.grossPay).toBe(2100)
    expect(p.tax).toBeNull()
    expect(p.netPay).toBe(2100)
  })
  it('carries an older unpaid commission only within the window, or when somebody put it in', () => {
    const emp = { id: 3, is_commission: true, tax_classification: '1099' }
    const rows = [
      { id: 40, employee_id: 3, amount: 100, payment_status: 'earned', earned_at: '2026-08-20T12:00:00Z' },  // 42 days before Oct 1: rides
      { id: 41, employee_id: 3, amount: 200, payment_status: 'earned', earned_at: '2026-08-10T12:00:00Z' },  // 52 days: too old on its own
      { id: 42, employee_id: 3, amount: 300, payment_status: 'earned', earned_at: '2026-06-01T12:00:00Z', queued_for_payroll: true },  // old, but put in
    ]
    const p = computeEmployeePay(base(emp, { repCommissions: rows }))
    expect(p.paidCommissionRows.rep).toEqual([40, 42])
    expect(p.commissionPay).toBe(400)
    expect(p.commissionCarried).toBe(400)
  })
  it('never pays a commission dated after the period end', () => {
    const emp = { id: 3, is_commission: true, tax_classification: '1099' }
    const p = computeEmployeePay(base(emp, { repCommissions: [{ id: 30, employee_id: 3, amount: 400, payment_status: 'earned', earned_at: '2026-10-16T12:00:00Z' }] }))
    expect(p.commissionPay).toBe(0)
    expect(p.paidCommissionRows).toEqual({ rep: [], lead: [] })
  })
  it('salary and commission add up on a contractor\'s check', () => {
    const emp = { id: 16, is_salary: true, annual_salary: 60000, is_commission: true, tax_classification: '1099' }
    const rows = [{ id: 20, employee_id: 16, amount: 681.96, payment_status: 'earned', earned_at: '2026-10-09T12:00:00Z' }]
    const p = computeEmployeePay(base(emp, { repCommissions: rows }))
    expect(p.salaryPay).toBe(2500)
    expect(p.commissionPay).toBe(681.96)
    expect(p.grossPay).toBe(3181.96)
    expect(p.netPay).toBe(3181.96)
  })
  it('a contractor gets no tax and nothing deducted from the card', () => {
    const emp = { id: 4, is_hourly: true, hourly_rate: 30, tax_classification: '1099' }
    const p = computeEmployeePay(base(emp, { timeEntries: [{ employee_id: 4, clock_in: '2026-10-05T14:00:00Z', total_hours: 8 }], benefits: [{ employee_id: 4, status: 'active', benefit_type: 'other', is_pre_tax: false, frequency: 'per_paycheck', employee_contribution: 50 }] }))
    expect(p.grossPay).toBe(240)
    expect(p.netPay).toBe(240)
  })
  it('an adjustment deduction and a card deduction both come off the net', () => {
    const emp = { id: 5, is_salary: true, annual_salary: 48000, tax_classification: 'W2', w4_filing_status: 'single' }
    const plain = computeEmployeePay(base(emp))
    const p = computeEmployeePay(base(emp, {
      adjustments: [{ employee_id: 5, type: 'deduction', amount: 100 }],
      benefits: [{ employee_id: 5, status: 'active', benefit_type: 'other', is_pre_tax: false, frequency: 'per_paycheck', employee_contribution: 7.5 }],
    }))
    expect(p.totalDeductions).toBe(100)
    expect(plain.tax.netPay - p.tax.netPay).toBeCloseTo(107.5, 2)
  })
  it('no pay this period means no deduction and a zero check, never a negative one', () => {
    const emp = { id: 6, is_hourly: true, hourly_rate: 30, tax_classification: 'W2', w4_filing_status: 'single' }
    const p = computeEmployeePay(base(emp, { benefits: [{ employee_id: 6, status: 'active', benefit_type: 'health', is_pre_tax: true, frequency: 'per_paycheck', employee_contribution: 100 }] }))
    expect(p.grossPay).toBe(0)
    expect(p.tax.netPay).toBe(0)
    expect(p.benefitLines).toHaveLength(0)
  })
})
