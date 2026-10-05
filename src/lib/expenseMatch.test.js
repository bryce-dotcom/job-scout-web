import { describe, it, expect } from 'vitest'
import { suggestExpensesForTransaction, suggestTransactionsForExpense, autoLinkReceipts } from './expenseMatch'

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

describe('autoLinkReceipts — the links Books makes on its own', () => {
  const receipt = { id: 1, amount: 84.12, date: '2026-09-09', merchant: 'Lowes', receipt_storage_path: 'r.jpg' }
  const bank = { id: 9, amount: 84.12, date: '2026-09-10', merchant_name: 'LOWES #221', name: 'LOWES' }

  it('links an exact-amount receipt to the one bank row within five days', () => {
    expect(autoLinkReceipts([bank], [receipt])).toEqual([{ transactionId: 9, expenseId: 1 }])
  })
  it('links on a shared merchant word when there is no receipt photo', () => {
    expect(autoLinkReceipts([bank], [{ ...receipt, receipt_storage_path: null }])).toHaveLength(1)
    expect(autoLinkReceipts([bank], [{ ...receipt, receipt_storage_path: null, merchant: 'Ace' }])).toHaveLength(0)
  })
  it('will not guess: a cent off, a week late, or two candidates on either side', () => {
    expect(autoLinkReceipts([{ ...bank, amount: 84.13 }], [receipt])).toHaveLength(0)
    expect(autoLinkReceipts([{ ...bank, date: '2026-09-17' }], [receipt])).toHaveLength(0)
    expect(autoLinkReceipts([bank, { ...bank, id: 10 }], [receipt])).toHaveLength(0)
    expect(autoLinkReceipts([bank], [receipt, { ...receipt, id: 2 }])).toHaveLength(0)
  })
  it('skips rows already linked, transfers, pending charges and money in', () => {
    expect(autoLinkReceipts([{ ...bank, expense_id: 4 }], [receipt])).toHaveLength(0)
    expect(autoLinkReceipts([bank], [{ ...receipt, plaid_transaction_id: 3 }])).toHaveLength(0)
    expect(autoLinkReceipts([{ ...bank, is_transfer: true }], [receipt])).toHaveLength(0)
    expect(autoLinkReceipts([{ ...bank, pending: true }], [receipt])).toHaveLength(0)
    expect(autoLinkReceipts([{ ...bank, amount: -84.12 }], [receipt])).toHaveLength(0)
  })
  it('pairs several receipts with several rows in one pass', () => {
    const r2 = { id: 2, amount: 12.5, date: '2026-09-10', merchant: 'Maverik', receipt_url: 'x' }
    const b2 = { id: 10, amount: 12.5, date: '2026-09-11', merchant_name: 'MAVERIK' }
    expect(autoLinkReceipts([bank, b2], [receipt, r2])).toEqual([{ transactionId: 9, expenseId: 1 }, { transactionId: 10, expenseId: 2 }])
  })
})

describe('suggestTransactionsForExpense', () => {
  it('finds the unlinked outflow for an expense', () => {
    const txns = [txn, { ...txn, id: 10, amount: -84.12 }, { ...txn, id: 11, is_transfer: true }, { ...txn, id: 12, expense_id: 1 }]
    expect(suggestTransactionsForExpense(expenses[0], txns).map(x => x.transaction.id)).toEqual([9])
  })
})
