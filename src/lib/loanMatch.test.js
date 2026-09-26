import { describe, it, expect } from 'vitest'
import { matchLoanPayments, splitPayment, loanSummary, nextDueDate, loanJournalRows, loanInterestInRange, payeeMatches, scheduledPayment } from './loanMatch'

const today = new Date(2026, 8, 25) // Sep 25, 2026
const truck = { id: 1, name: 'F-250 loan', lender: 'Ford Credit', current_balance: 28400, monthly_payment: 612.5, interest_rate: 6.9, payment_day: 15, match_payee: 'FORD CREDIT', status: 'active' }
const sba = { id: 2, name: 'SBA 7(a)', lender: 'Zions Bank', current_balance: 150000, monthly_payment: 2100, interest_rate: 9.5, next_payment_due: '2026-10-01', status: 'active' }
const closed = { id: 3, name: 'Old lift', lender: 'Genie Financial', monthly_payment: 300, status: 'paid_off' }

const txns = [
  { id: 11, amount: 612.5, date: '2026-09-15', name: 'FORD CREDIT PAYMENT', merchant_name: 'Ford Credit' },
  { id: 12, amount: 612.5, date: '2026-08-15', name: 'FORD CREDIT PAYMENT', loan_payment_id: 900 },     // already booked
  { id: 13, amount: 2100, date: '2026-09-01', name: 'ACH DEBIT ZIONS BANK LOAN' },
  { id: 14, amount: 2100, date: '2026-09-03', name: 'HOME DEPOT' },                                         // amount only
  { id: 15, amount: 55.2, date: '2026-09-10', name: 'FORD CREDIT LATE FEE' },                             // payee only
  { id: 16, amount: -612.5, date: '2026-09-16', name: 'FORD CREDIT REFUND' },                             // money in
  { id: 17, amount: 612.5, date: '2026-09-17', name: 'TRANSFER TO SAVINGS', is_transfer: true },
  { id: 18, amount: 300, date: '2026-09-02', name: 'GENIE FINANCIAL' },                                   // closed loan
  { id: 19, amount: 612.5, date: '2026-03-15', name: 'FORD CREDIT PAYMENT' },                             // outside window
]

describe('matchLoanPayments', () => {
  it('finds exact, amount-only and payee-only candidates, best first, skipping booked / transfer / inflow / closed / stale rows', () => {
    const c = matchLoanPayments({ loans: [truck, sba, closed], plaidTransactions: txns, today })
    expect(c.map(x => [x.txn.id, x.loan.id, x.confidence])).toEqual([
      [11, 1, 'exact'],
      [13, 2, 'exact'],
      [14, 2, 'amount'],
      [15, 1, 'payee'],
    ])
  })
  it('tolerates a dollar or 1% on the amount', () => {
    const c = matchLoanPayments({ loans: [truck], plaidTransactions: [{ id: 1, amount: 613.4, date: '2026-09-15', name: 'X' }], today })
    expect(c).toHaveLength(1)
    expect(matchLoanPayments({ loans: [truck], plaidTransactions: [{ id: 1, amount: 640, date: '2026-09-15', name: 'X' }], today })).toHaveLength(0)
  })
  it('prefers the lender\'s scheduled amount when Plaid supplied one', () => {
    expect(scheduledPayment({ monthly_payment: 500, next_payment_amount: 512.34 })).toBe(512.34)
  })
  it('payee matching is whole-word for short names', () => {
    expect(payeeMatches({ lender: 'Ally' }, { name: 'ALLY FINANCIAL PMT' })).toBe(true)
    expect(payeeMatches({ lender: 'Ally' }, { name: 'RALLY HOUSE' })).toBe(false)
  })
})

describe('splitPayment', () => {
  it('one month of interest on the balance, rest principal', () => {
    expect(splitPayment(truck, 612.5)).toEqual({ principal: 449.2, interest: 163.3 })   // 28400 × 6.9% / 12 = 163.30
  })
  it('no rate → all principal; interest capped at the payment', () => {
    expect(splitPayment({ current_balance: 1000 }, 200)).toEqual({ principal: 200, interest: 0 })
    expect(splitPayment({ current_balance: 100000, interest_rate: 24 }, 500)).toEqual({ principal: 0, interest: 500 })
  })
})

describe('nextDueDate / loanSummary', () => {
  it('uses the lender date when ahead, else the payment day, rolling into next month', () => {
    expect(nextDueDate(sba, today)).toBe('2026-10-01')
    expect(nextDueDate(truck, today)).toBe('2026-10-15')
    expect(nextDueDate({ payment_day: 25 }, today)).toBe('2026-09-25')
    expect(nextDueDate({ next_payment_due: '2026-09-01' }, today)).toBe('2026-09-01')   // passed and unpaid = overdue, not rolled
    expect(nextDueDate({}, today)).toBeNull()
  })
  it('rolls up the year and flags an overdue loan', () => {
    const pays = [
      { id: 1, liability_id: 1, date: '2026-08-15', amount: 612.5, principal: 449, interest: 163.5, plaid_transaction_id: 12 },
      { id: 2, liability_id: 1, date: '2026-07-15', amount: 612.5, principal: 448, interest: 164.5 },
      { id: 3, liability_id: 2, date: '2026-09-01', amount: 2100, principal: 913, interest: 1187 },
    ]
    const s = loanSummary(truck, pays, today)
    expect(s).toMatchObject({ paidThisYear: 1225, principalThisYear: 897, interestThisYear: 328, count: 2, verified: 1, nextDue: '2026-10-15', overdue: false, scheduled: 612.5 })
    expect(s.lastPayment.id).toBe(1)
    expect(loanSummary({ ...truck, next_payment_due: '2026-09-15', payment_day: null }, [], today).overdue).toBe(true)
    expect(loanInterestInRange(pays, (d) => String(d).startsWith('2026-08'))).toBe(163.5)
  })
})

describe('loanJournalRows', () => {
  it('balances: principal to the loan, interest to expense, whole payment out of the bank', () => {
    const rows = loanJournalRows([{ id: 7, liability_id: 1, date: '2026-09-15', amount: 612.5, principal: 449.2, interest: 163.3, plaid_transaction_id: 11 }], [truck])
    const debit = rows.reduce((s, r) => s + r.debit, 0), credit = rows.reduce((s, r) => s + r.credit, 0)
    expect(Math.abs(debit - credit)).toBeLessThan(0.005)
    expect(rows.map(r => r.account)).toEqual(['Loan payable: F-250 loan', 'Interest Expense', 'Bank: loan payments'])
    expect(rows[2].credit).toBe(612.5)
  })
})
