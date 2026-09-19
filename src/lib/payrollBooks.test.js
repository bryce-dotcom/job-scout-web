import { describe, it, expect } from 'vitest'
import { summarizePayroll, taxLiabilitySummary, isPayrollBankRow, payrollJournalRows, duplicatePeriods } from './payrollBooks'

const inSep = (d) => String(d || '').startsWith('2026-09')
const today = new Date('2026-09-25T12:00:00')
const runs = [
  { id: 1, pay_date: '2026-09-05', period_start: '2026-08-18', period_end: '2026-08-31', total_gross: 5000, employee_count: 2 },
  { id: 2, pay_date: '2026-09-19', period_start: '2026-09-01', period_end: '2026-09-14', total_gross: 4000, employee_count: 2 },
  { id: 3, pay_date: '2026-08-22', period_start: '2026-08-04', period_end: '2026-08-17', total_gross: 9999 },
]
const stubs = [
  { payroll_run_id: 1, employee_id: 11, gross_pay: 3000, net_pay: 2400, federal_income_tax: 300, social_security_employee: 186, medicare_employee: 43.5, state_income_tax: 70.5, social_security_employer: 186, medicare_employer: 43.5, futa: 18, sui: 60 },
  { payroll_run_id: 1, employee_id: 12, gross_pay: 2000, net_pay: 1650, federal_income_tax: 180, social_security_employee: 124, medicare_employee: 29, state_income_tax: 17, social_security_employer: 124, medicare_employer: 29, futa: 12, sui: 40 },
  { payroll_run_id: 2, employee_id: 11, gross_pay: 4000, net_pay: 3200, federal_income_tax: 400, social_security_employee: 248, medicare_employee: 58, state_income_tax: 94, social_security_employer: 248, medicare_employer: 58, futa: 0, sui: 80 },
]

describe('summarizePayroll', () => {
  it('sums the runs paid in range from their stubs', () => {
    const s = summarizePayroll({ payrollRuns: runs, paystubs: stubs }, inSep, { today })
    expect(s.runs).toBe(2)
    expect(s.gross).toBe(9000)
    expect(s.employerTaxes).toBe(186 + 43.5 + 18 + 60 + 124 + 29 + 12 + 40 + 248 + 58 + 0 + 80)
    expect(s.netPay).toBe(2400 + 1650 + 3200)
    expect(s.totalCost).toBe(9000 + s.employerTaxes)
    expect(s.employees).toBe(2)
    expect(s.upcoming.runs).toBe(0)
  })
  it('a run whose pay date has not arrived is queued, not paid', () => {
    const s = summarizePayroll({ payrollRuns: runs, paystubs: stubs }, inSep, { today: new Date('2026-09-10T12:00:00') })
    expect(s.runs).toBe(1)
    expect(s.gross).toBe(5000)
    expect(s.upcoming).toMatchObject({ runs: 1, gross: 4000, nextPayDate: '2026-09-19' })
  })
  it('ignores voided runs', () => {
    const s = summarizePayroll({ payrollRuns: [...runs, { id: 4, pay_date: '2026-09-06', status: 'void', total_gross: 77777 }], paystubs: stubs }, inSep, { today })
    expect(s.runs).toBe(2)
    expect(s.gross).toBe(9000)
  })
  it('falls back to total_gross when a run has no stubs', () => {
    const s = summarizePayroll({ payrollRuns: [runs[2]], paystubs: [] }, (d) => String(d).startsWith('2026-08'), { today })
    expect(s.gross).toBe(9999)
    expect(s.netPay).toBe(9999)
  })
})

describe('duplicatePeriods', () => {
  it('finds two live runs on the same period, oldest first, and skips voided ones', () => {
    const d = duplicatePeriods([
      { id: 7, period_start: '2026-07-16', period_end: '2026-07-31', created_at: '2026-08-06' },
      { id: 8, period_start: '2026-07-16', period_end: '2026-07-31', created_at: '2026-08-14' },
      { id: 9, period_start: '2026-07-01', period_end: '2026-07-15', created_at: '2026-08-17' },
      { id: 10, period_start: '2026-07-01', period_end: '2026-07-15', created_at: '2026-08-18', status: 'void' },
    ])
    expect(d).toHaveLength(1)
    expect(d[0].runs.map(r => r.id)).toEqual([7, 8])
  })
})

describe('taxLiabilitySummary', () => {
  it('reports open agency money, the next due date, and what is overdue', () => {
    const t = taxLiabilitySummary([
      { amount_total: 500, due_date: '2026-09-15', paid_at: null },
      { amount_total: 200, due_date: '2026-10-01', paid_at: null },
      { amount_total: 999, due_date: '2026-09-01', paid_at: '2026-09-02' },
    ], new Date('2026-09-20T12:00:00Z'))
    expect(t).toEqual({ open: 2, total: 700, nextDue: '2026-09-15', overdue: 500 })
  })
})

describe('isPayrollBankRow', () => {
  it('recognizes payroll and tax-deposit bank rows by category or descriptor', () => {
    expect(isPayrollBankRow({ ai_category: 'Payroll' })).toBe(true)
    expect(isPayrollBankRow({ name: 'IRS USATAXPYMT 220-1234' })).toBe(true)
    expect(isPayrollBankRow({ name: 'GUSTO PAY 123' })).toBe(true)
    expect(isPayrollBankRow({ name: 'HOME DEPOT', ai_category: 'Materials' })).toBe(false)
  })
})

describe('payrollJournalRows', () => {
  it('balances per run: wages + employer tax = net pay + liabilities; future and void runs left out', () => {
    const rows = payrollJournalRows({ payrollRuns: [...runs, { id: 5, pay_date: '2026-09-07', status: 'void', total_gross: 1234 }], paystubs: stubs }, inSep, { today })
    const byRun = (id) => rows.filter(r => r.ref === id)
    for (const id of [1, 2]) {
      const d = byRun(id).reduce((s, r) => s + r.debit, 0)
      const c = byRun(id).reduce((s, r) => s + r.credit, 0)
      expect(Math.abs(d - c)).toBeLessThan(0.005)
    }
    expect(byRun(1).find(r => r.account === 'Wages & Salaries').debit).toBe(5000)
    expect(byRun(1).find(r => r.account === 'Bank: payroll').credit).toBe(4050)
    expect(rows.some(r => r.ref === 3)).toBe(false)
    expect(rows.some(r => r.ref === 5)).toBe(false)
    expect(payrollJournalRows({ payrollRuns: runs, paystubs: stubs }, inSep, { today: new Date('2026-09-10T12:00:00') }).some(r => r.ref === 2)).toBe(false)
  })
})
