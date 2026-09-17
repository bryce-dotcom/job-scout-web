import { describe, it, expect } from 'vitest'
import { computeExpenses, accrualExpenses, cashExpenses, BASIS_CASH, BASIS_ACCRUAL } from './revenueBasis'

const inSep = (d) => String(d || '').startsWith('2026-09')
// Shape of the store's `expenses` rows (the expenses table uses `date`).
const expenses = [
  { id: 1, amount: 100, date: '2026-09-03', plaid_transaction_id: null },
  { id: 2, amount: 50, date: '2026-09-05', plaid_transaction_id: 77 },   // also in the bank feed
  { id: 3, amount: 999, date: '2026-08-20', plaid_transaction_id: null }, // last month
]
const plaid = [
  { id: 77, amount: 50, date: '2026-09-06', is_transfer: false },   // the linked expense
  { id: 78, amount: 200, date: '2026-09-10', is_transfer: false },  // a bill payment reaching the bank
  { id: 79, amount: 30, date: '2026-09-11', is_transfer: false },   // fuel, no bill, no manual expense
  { id: 80, amount: 5000, date: '2026-09-12', is_transfer: true },  // transfer, never an expense
]
const bills = [
  { id: 1, amount: 200, bill_date: '2026-09-01' },
  { id: 2, amount: 400, bill_date: '2026-09-15' }, // unpaid — incurred, not cash
]
const billPayments = [{ bill_id: 1, amount: 200, paid_at: '2026-09-09T12:00:00Z' }]

describe('expenses by basis', () => {
  it('cash = bank outflows + manual expenses not already in the feed', () => {
    // 50 + 200 + 30 (bank) + 100 (manual, unlinked) — the linked 50 counts once
    expect(cashExpenses({ expenses, plaidTransactions: plaid }, inSep)).toBe(380)
    expect(computeExpenses(BASIS_CASH, { expenses, plaidTransactions: plaid, bills, billPayments }, inSep)).toBe(380)
  })
  it('accrual = manual incurred + bills incurred + bank outflows that are neither', () => {
    // manual 100 + 50; bills 200 + 400; bank: 77 linked (skip), 78 = bill payment (skip), 79 fuel 30
    expect(accrualExpenses({ expenses, plaidTransactions: plaid, bills, billPayments }, inSep)).toBe(780)
    expect(computeExpenses(BASIS_ACCRUAL, { expenses, plaidTransactions: plaid, bills, billPayments }, inSep)).toBe(780)
  })
  it('accrual without bill data degrades to manual + all unlinked outflows', () => {
    expect(accrualExpenses({ expenses, plaidTransactions: plaid }, inSep)).toBe(150 + 200 + 30)
  })
})
