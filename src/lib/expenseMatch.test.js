import { describe, it, expect } from 'vitest'
import { suggestExpensesForTransaction, suggestTransactionsForExpense } from './expenseMatch'

const txn = { id: 9, amount: 84.12, date: '2026-09-10', merchant_name: 'Home Depot', name: 'HOME DEPOT #4412' }
const expenses = [
  { id: 1, amount: 84.12, date: '2026-09-09', merchant: 'Home Depot', receipt_url: 'x' },   // best: same money, name, receipt
  { id: 2, amount: 84.12, date: '2026-09-09', merchant: 'Lowes' },                          // same money, no name match
  { id: 3, amount: 84.12, date: '2026-08-01', merchant: 'Home Depot' },                     // too old
  { id: 4, amount: 12.00, date: '2026-09-10', merchant: 'Home Depot' },                     // different money
  { id: 5, amount: 84.12, date: '2026-09-10', merchant: 'Home Depot', plaid_transaction_id: 3 }, // already linked
]

describe('suggestExpensesForTransaction', () => {
  it('ranks the same-money, same-merchant, receipted expense first and drops the rest', () => {
    const s = suggestExpensesForTransaction(txn, expenses)
    expect(s.map(x => x.expense.id)).toEqual([1, 2])
    expect(s[0].score).toBeGreaterThan(s[1].score)
  })
  it('ignores money in', () => {
    expect(suggestExpensesForTransaction({ ...txn, amount: -84.12 }, expenses)).toEqual([])
  })
  it('tolerates a small rounding/tip difference but not a big one', () => {
    expect(suggestExpensesForTransaction({ ...txn, amount: 85.0 }, [expenses[0]])).toHaveLength(1)
    expect(suggestExpensesForTransaction({ ...txn, amount: 95.0 }, [expenses[0]])).toHaveLength(0)
  })
})

describe('suggestTransactionsForExpense', () => {
  it('finds the unlinked outflow for an expense', () => {
    const txns = [txn, { ...txn, id: 10, amount: -84.12 }, { ...txn, id: 11, is_transfer: true }, { ...txn, id: 12, expense_id: 1 }]
    expect(suggestTransactionsForExpense(expenses[0], txns).map(x => x.transaction.id)).toEqual([9])
  })
})
