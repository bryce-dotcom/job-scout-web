// General journal + QuickBooks bank-import CSVs for the CPA package.
//
// JobScout is not a double-entry ledger; money lives in payments, two expense
// tables, and the Plaid feed. This turns that into the two things a CPA can
// actually use: a double-entry general journal for the period (every money
// event as a debit and a credit against named accounts) and, per connected
// bank account, the 3-column CSV QuickBooks Online's bank upload accepts.
//
// Dedupe rules (the same money must post once):
//   • a customer payment posts Undeposited Funds → Income when recorded
//   • the bank deposit that carries it (matched_payment_id) moves
//     Undeposited Funds → Bank; an unmatched deposit is income under review
//   • an expenses-table row linked to a bank row (plaid_transaction_id) is
//     the expense; the bank row it points at is skipped
//   • a manual_expenses row with splits posts one debit per split
//   • transfers between own accounts never post

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100

export function accountNameFor(t, connectedById = new Map()) {
  const a = t?.account || connectedById.get(t?.connected_account_id)
  if (!a) return 'Bank'
  const name = a.account_name || a.institution_name || 'Bank'
  return a.mask ? `${name} ····${a.mask}` : name
}

function makeInRange(from, to) {
  const f = new Date(from), t = new Date(to)
  return (d) => { if (!d) return false; const x = new Date(d); return x >= f && x <= t }
}

/**
 * @returns {Array<{date, account, debit, credit, memo, source, ref}>}
 */
export function buildJournal({
  payments = [], manualExpenses = [], splitsByExpense = {}, expenses = [], plaidTransactions = [],
  connectedAccounts = [], bankAccounts = [], from, to,
} = {}) {
  const inRange = makeInRange(from, to)
  const connectedById = new Map((connectedAccounts || []).map(a => [a.id, a]))
  const bankById = new Map((bankAccounts || []).map(b => [b.id, b]))
  const rows = []
  const post = (date, account, debit, credit, memo, source, ref) =>
    rows.push({ date: String(date).slice(0, 10), account, debit: r2(debit), credit: r2(credit), memo, source, ref })

  // 1. Customer payments recorded (cash basis income).
  for (const p of payments || []) {
    if (!inRange(p.date)) continue
    const st = p.status || 'Completed'
    if (st === 'Refunded' || st === 'Voided') continue
    const amt = num(p.amount)
    if (amt <= 0) continue
    const memo = `Payment${p.invoice?.invoice_id ? ` on ${p.invoice.invoice_id}` : p.invoice_id ? ` on invoice ${p.invoice_id}` : ''}${p.method ? ` (${p.method})` : ''}`
    post(p.date, 'Undeposited Funds', amt, 0, memo, 'payment', p.id)
    post(p.date, 'Income: Services', 0, amt, memo, 'payment', p.id)
  }

  // 2. Bank feed.
  const linkedTxnIds = new Set((expenses || []).map(e => e.plaid_transaction_id).filter(Boolean))
  for (const t of plaidTransactions || []) {
    if (!inRange(t.date) || t.is_transfer || t.pending) continue
    const amt = num(t.amount)
    const bank = `Bank: ${accountNameFor(t, connectedById)}`
    const desc = t.merchant_name || t.name || 'Bank transaction'
    if (amt < 0) {
      const inflow = -amt
      if (t.matched_payment_id || t.matched_invoice_id) {
        post(t.date, bank, inflow, 0, `Deposit — ${desc}`, 'bank', t.id)
        post(t.date, 'Undeposited Funds', 0, inflow, `Deposit — ${desc}`, 'bank', t.id)
      } else {
        post(t.date, bank, inflow, 0, `Deposit — ${desc}`, 'bank', t.id)
        post(t.date, 'Income: Unmatched deposits (review)', 0, inflow, `Deposit — ${desc}`, 'bank', t.id)
      }
    } else if (amt > 0) {
      if (linkedTxnIds.has(t.id)) continue // posted by the expense row below
      const cat = t.user_tax_category || t.ai_tax_category || t.user_category || t.ai_category || 'Uncategorized expense'
      post(t.date, cat, amt, 0, desc, 'bank', t.id)
      post(t.date, bank, 0, amt, desc, 'bank', t.id)
    }
  }

  // 3. Expenses table (the page at /expenses), crediting the bank row when linked.
  const txnById = new Map((plaidTransactions || []).map(t => [t.id, t]))
  for (const e of expenses || []) {
    const d = e.date || e.expense_date || e.created_at
    if (!inRange(d)) continue
    const amt = num(e.amount)
    if (amt <= 0) continue
    const cat = e.tax_category || e.category || 'Uncategorized expense'
    const memo = `${e.merchant || e.description || 'Expense'}`
    const linked = e.plaid_transaction_id ? txnById.get(e.plaid_transaction_id) : null
    const credit = linked ? `Bank: ${accountNameFor(linked, connectedById)}` : 'Cash / unspecified'
    post(d, cat, amt, 0, memo, 'expense', e.id)
    post(d, credit, 0, amt, memo, 'expense', e.id)
  }

  // 4. Manual expenses (Books), one debit per split when split.
  for (const e of manualExpenses || []) {
    if (!inRange(e.expense_date)) continue
    const amt = num(e.amount)
    if (amt <= 0) continue
    const memo = e.description || e.vendor || 'Expense'
    const paidFrom = e.bank_account_id ? bankById.get(e.bank_account_id) : null
    const credit = paidFrom ? `${paidFrom.provider === 'manual' ? 'Wallet' : 'Bank'}: ${paidFrom.name}` : 'Cash / unspecified'
    const splits = (splitsByExpense || {})[e.id] || []
    if (splits.length > 0) {
      for (const s of splits) post(e.expense_date, s.tax_category || s.category?.name || 'Uncategorized expense', num(s.amount), 0, `${memo}${s.note ? ` — ${s.note}` : ''}`, 'manual', e.id)
    } else {
      post(e.expense_date, e.category?.default_tax_category || e.category?.name || 'Uncategorized expense', amt, 0, memo, 'manual', e.id)
    }
    post(e.expense_date, credit, 0, amt, memo, 'manual', e.id)
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.ref).localeCompare(String(b.ref)))
  return rows
}

export function journalTotals(rows) {
  const debit = r2(rows.reduce((s, r) => s + r.debit, 0))
  const credit = r2(rows.reduce((s, r) => s + r.credit, 0))
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 }
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csv = (rows) => rows.map(r => r.map(cell).join(',')).join('\n')

export function journalCsv(rows) {
  return csv([
    ['Date', 'Account', 'Debit', 'Credit', 'Memo', 'Source', 'Ref'],
    ...rows.map(r => [r.date, r.account, r.debit ? r.debit.toFixed(2) : '', r.credit ? r.credit.toFixed(2) : '', r.memo, r.source, r.ref]),
  ])
}

// QuickBooks Online bank upload, 3-column format: Date, Description, Amount
// (positive = deposit, negative = withdrawal). One file per bank account.
export function qboBankCsvs({ plaidTransactions = [], connectedAccounts = [], from, to } = {}) {
  const inRange = makeInRange(from, to)
  const connectedById = new Map((connectedAccounts || []).map(a => [a.id, a]))
  const byAccount = new Map()
  for (const t of plaidTransactions || []) {
    if (!inRange(t.date) || t.pending) continue
    const name = accountNameFor(t, connectedById)
    if (!byAccount.has(name)) byAccount.set(name, [])
    byAccount.get(name).push(t)
  }
  return [...byAccount.entries()].map(([name, txns]) => ({
    account: name,
    filename: `qbo-bank-${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.csv`,
    csv: csv([
      ['Date', 'Description', 'Amount'],
      ...txns
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(t => [String(t.date).slice(0, 10), t.merchant_name || t.name || '', (-num(t.amount)).toFixed(2)]),
    ]),
    count: txns.length,
  }))
}
