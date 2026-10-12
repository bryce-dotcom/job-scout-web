import { describe, it, expect } from 'vitest'
import { monthClose, lastMonthKey, monthRange } from './monthClose'

const today = new Date(2026, 9, 12) // Oct 12, 2026 → last month = 2026-09

describe('month keys', () => {
  it('last month and its range', () => {
    expect(lastMonthKey(today)).toBe('2026-09')
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('monthClose', () => {
  const bankRows = [
    { id: 1, date: '2026-09-02', amount: 318.42, name: 'HOME DEPOT', confirmed: true, user_category: 'Supplies' },
    { id: 2, date: '2026-09-03', amount: 318.42, name: 'HOME DEPOT', confirmed: false },                       // double charge?
    { id: 3, date: '2026-09-14', amount: -57372.68, name: 'Check Deposit', confirmed: false },                 // untied deposit
    { id: 4, date: '2026-09-17', amount: -23883, name: 'The Ivy Deposit', confirmed: true, user_category: 'Sales', matched_payment_id: 9 },
    { id: 5, date: '2026-09-18', amount: 31122.77, name: 'Draft Withdrawal Draft #8821', confirmed: true, user_category: 'Payroll' },
    { id: 6, date: '2026-09-25', amount: 2185.56, name: 'Transfer to Savings', confirmed: true, is_transfer: true },
    { id: 7, date: '2026-10-01', amount: 50, name: 'OCTOBER ROW', confirmed: false },                           // not this month
    { id: 8, date: '2026-09-20', amount: 10, name: 'PENDING', confirmed: false, pending: true },                 // pending, ignored
  ]
  const verdicts = [{ plaid_transaction_id: 3, confidence: 0.92, status: 'proposed' }, { plaid_transaction_id: 2, confidence: 0.6, status: 'proposed' }]
  const invoices = [
    { id: 100, invoice_id: 'INV-A', customer_name: 'Ivy', payment_status: 'Paid', invoice_date: '2026-08-20', amount: 23883, discount_applied: 0, tax_amount: 0 },   // paid Sep 17 by its payment row
    { id: 101, invoice_id: 'INV-B', customer_name: 'Phantom Co', payment_status: 'Paid', invoice_date: '2026-09-09', amount: 1200, discount_applied: 0, tax_amount: 0 },
    { id: 102, invoice_id: 'INV-C', customer_name: 'Slow Payer', payment_status: 'Pending', due_date: '2026-07-01', amount: 900 },
    { id: 103, invoice_id: 'INV-D', customer_name: 'On Time', payment_status: 'Pending', due_date: '2026-10-20', amount: 400 },
  ]
  const payments = [{ invoice_id: 100, amount: 23883, date: '2026-09-17', status: 'Completed' }]
  const payrollRuns = [{ id: 13, pay_date: '2026-09-18', total_gross: 33394, status: 'completed' }, { id: 14, pay_date: '2026-09-05', total_gross: 30000, status: 'completed' }, { id: 15, pay_date: '2026-09-05', total_gross: 1, status: 'void' }]
  const loans = [{ id: 1, name: 'F-250 loan', monthly_payment: 612.5, status: 'active' }, { id: 2, name: 'LOC', monthly_payment: 350, status: 'active' }, { id: 3, name: 'Old', monthly_payment: 100, status: 'paid_off' }]
  const loanPayments = [{ liability_id: 1, date: '2026-09-15', amount: 612.5 }]
  const claims = [{ id: 111, utility_name: 'SRP', amount: 30000, payment_status: 'Paid', paid_at: '2026-09-14', source_transaction_id: null }, { id: 139, utility_name: 'RMP', amount: 13652.85, payment_status: 'Paid', paid_at: '2026-09-18', source_transaction_id: 77 }]

  const r = monthClose('2026-09', { bankRows, verdicts, invoices, payments, payrollRuns, loans, loanPayments, claims, today })
  const by = Object.fromEntries(r.checks.map(c => [c.id, c]))

  it('counts only the month, skips pending rows, and knows which blockers Frankie is sure about', () => {
    expect(by.bank_confirmed).toMatchObject({ open: 2, total: 6, blocking: true, action: 'verdicts' })
    expect(by.bank_confirmed.detail).toMatch(/Frankie is sure about 1/)
    expect(by.bank_confirmed.items[0]).toMatch(/57,372.68/)
  })
  it('deposits: tied means a payment, claim, payout, or a confirmed category', () => {
    expect(by.deposits_matched).toMatchObject({ open: 1, total: 2, blocking: true })
  })
  it('phantom Paid invoices are flagged but do not block', () => {
    expect(by.paid_have_payments).toMatchObject({ open: 1, total: 2, blocking: false })
    expect(by.paid_have_payments.items[0]).toMatch(/INV-B/)
  })
  it('payroll runs without a draw within four days, void runs ignored', () => {
    expect(by.payroll_tied).toMatchObject({ open: 1, total: 2 })
    expect(by.payroll_tied.items[0]).toMatch(/Run #14/)
  })
  it('loans without a booked payment this month, paid-off ones ignored', () => {
    expect(by.loans_booked).toMatchObject({ open: 1, total: 2 })
    expect(by.loans_booked.items[0]).toMatch(/LOC/)
  })
  it('incentive claims paid but not tied to a deposit', () => {
    expect(by.claims_tied).toMatchObject({ open: 1, total: 2 })
  })
  it('same payee, same amount, within three days is an anomaly', () => {
    expect(by.anomalies.open).toBe(1)
    expect(by.anomalies.items[0]).toMatch(/HOME DEPOT/)
  })
  it('receivables past 60 days', () => {
    expect(by.ar_aged).toMatchObject({ open: 1, total: 2 })
  })
  it('rolls up: blockers are the unconfirmed + untied rows; ready only when zero; closed when the setting covers it', () => {
    expect(r.blockers).toBe(3)
    expect(r.ready).toBe(false)
    expect(r.attention).toBe(6)
    expect(monthClose('2026-09', { closedThrough: '2026-09' }).closed).toBe(true)
    expect(monthClose('2026-09', { closedThrough: '2026-08' }).closed).toBe(false)
    expect(monthClose('2026-09', {}).ready).toBe(true)
  })
})
