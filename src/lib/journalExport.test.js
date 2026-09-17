import { describe, it, expect } from 'vitest'
import { buildJournal, journalTotals, journalCsv, qboBankCsvs } from './journalExport'

const from = '2026-09-01', to = '2026-09-30'
const connectedAccounts = [{ id: 5, account_name: 'Business Checking', mask: '3032' }]
const payments = [
  { id: 1, date: '2026-09-03', amount: 500, method: 'Venmo', invoice: { invoice_id: 'INV-1' } },
  { id: 2, date: '2026-09-04', amount: 80, status: 'Refunded' },
  { id: 3, date: '2026-08-04', amount: 999 },
]
const plaid = [
  { id: 10, date: '2026-09-05', amount: -500, name: 'VENMO CASHOUT', connected_account_id: 5, matched_payment_id: 1 },
  { id: 11, date: '2026-09-06', amount: -75, name: 'Zelle from Pat', connected_account_id: 5 },
  { id: 12, date: '2026-09-07', amount: 120, name: 'HOME DEPOT', connected_account_id: 5, ai_tax_category: 'Line 2 - Cost of goods sold' },
  { id: 13, date: '2026-09-08', amount: 60, name: 'SHELL', connected_account_id: 5 },              // linked to expense 20
  { id: 14, date: '2026-09-09', amount: 1000, name: 'TRANSFER TO SAVINGS', connected_account_id: 5, is_transfer: true },
]
const expenses = [{ id: 20, date: '2026-09-08', amount: 60, merchant: 'Shell', category: 'Fuel', plaid_transaction_id: 13 }]
const manualExpenses = [
  { id: 30, expense_date: '2026-09-10', amount: 40, description: 'Venmo fees', category: { name: 'Bank Fees' }, bank_account_id: 7 },
  { id: 31, expense_date: '2026-09-11', amount: 100, description: 'Mixed run', category: null },
]
const splitsByExpense = { 31: [{ amount: 70, tax_category: 'Line 2 - Cost of goods sold' }, { amount: 30, category: { name: 'Meals' } }] }
const bankAccounts = [{ id: 7, name: 'Venmo', provider: 'manual' }]

describe('buildJournal', () => {
  const rows = buildJournal({ payments, manualExpenses, splitsByExpense, expenses, plaidTransactions: plaid, connectedAccounts, bankAccounts, from, to })

  it('balances', () => {
    const t = journalTotals(rows)
    expect(t.balanced).toBe(true)
    expect(t.debit).toBe(t.credit)
  })
  it('posts a payment once as income and its matched deposit as a move out of undeposited funds', () => {
    const income = rows.filter(r => r.account === 'Income: Services')
    expect(income).toHaveLength(1)
    expect(income[0].credit).toBe(500)
    const undep = rows.filter(r => r.account === 'Undeposited Funds')
    expect(undep.map(r => [r.debit, r.credit])).toEqual([[500, 0], [0, 500]])
  })
  it('flags an unmatched deposit for review rather than calling it income', () => {
    expect(rows.find(r => r.account === 'Income: Unmatched deposits (review)').credit).toBe(75)
  })
  it('skips refunded, out-of-range, transfer, and bank rows already posted by a linked expense', () => {
    expect(rows.some(r => r.ref === 2)).toBe(false)
    expect(rows.some(r => r.ref === 3)).toBe(false)
    expect(rows.some(r => r.ref === 14)).toBe(false)
    expect(rows.filter(r => r.source === 'bank' && r.ref === 13)).toHaveLength(0)
    const fuel = rows.filter(r => r.source === 'expense' && r.ref === 20)
    expect(fuel.map(r => r.account)).toEqual(['Fuel', 'Bank: Business Checking ····3032'])
  })
  it('splits a manual expense into one debit per line and credits the wallet it was paid from', () => {
    const split = rows.filter(r => r.source === 'manual' && r.ref === 31)
    expect(split.filter(r => r.debit > 0).map(r => r.account)).toEqual(['Line 2 - Cost of goods sold', 'Meals'])
    expect(rows.find(r => r.ref === 30 && r.credit > 0).account).toBe('Wallet: Venmo')
  })
  it('renders CSV with a header', () => {
    expect(journalCsv(rows).split('\n')[0]).toBe('"Date","Account","Debit","Credit","Memo","Source","Ref"')
  })
})

describe('qboBankCsvs', () => {
  it('one file per account, deposits positive, withdrawals negative, transfers included (the bank had them)', () => {
    const files = qboBankCsvs({ plaidTransactions: plaid, connectedAccounts, from, to })
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('qbo-bank-business-checking-3032.csv')
    const lines = files[0].csv.split('\n')
    expect(lines[0]).toBe('"Date","Description","Amount"')
    expect(lines).toContain('"2026-09-05","VENMO CASHOUT","500.00"')
    expect(lines).toContain('"2026-09-07","HOME DEPOT","-120.00"')
    expect(files[0].count).toBe(5)
  })
})
