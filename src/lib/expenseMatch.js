// Match a bank row to the recorded expense it paid for (and back).
//
// The link is expenses.plaid_transaction_id (+ plaid_transactions.expense_id),
// written by the categorize-transactions 'reconcile' action, which had no UI
// until now. Once linked, the expense carries the receipt and the bank row
// stops being a second copy of the same money in every report.

const num = (v) => parseFloat(v) || 0
const dayMs = 86400000
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)

function score(txn, exp, days) {
  const tAmt = Math.abs(num(txn.amount))
  const eAmt = num(exp.amount)
  const diff = Math.abs(tAmt - eAmt)
  if (diff > Math.max(0.01, tAmt * 0.02)) return null           // must be the same money (2% for tips/rounding)
  const tDate = new Date(txn.date).getTime()
  const eDate = new Date(exp.date || exp.expense_date || exp.created_at).getTime()
  if (!Number.isFinite(tDate) || !Number.isFinite(eDate)) return null
  const gap = Math.abs(tDate - eDate) / dayMs
  if (gap > days) return null
  let s = 100 - gap * 4 - (diff > 0.01 ? 15 : 0)
  const tWords = tokens(`${txn.merchant_name || ''} ${txn.name || ''}`)
  const eWords = tokens(`${exp.merchant || ''} ${exp.vendor || ''} ${exp.description || ''}`)
  if (tWords.some(w => eWords.includes(w))) s += 20
  if (exp.receipt_url || exp.receipt_storage_path) s += 10
  return Math.round(s)
}

/** Expenses (expenses-table rows, unlinked) that look like this bank row. */
export function suggestExpensesForTransaction(txn, expenses, { days = 7, limit = 5 } = {}) {
  if (!txn || !(num(txn.amount) > 0)) return []                 // only money out
  return (expenses || [])
    .filter(e => !e.plaid_transaction_id)
    .map(e => ({ expense: e, score: score(txn, e, days) }))
    .filter(x => x.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Bank rows (unlinked outflows) that look like this expense. */
export function suggestTransactionsForExpense(exp, plaidTransactions, { days = 7, limit = 5 } = {}) {
  if (!exp) return []
  return (plaidTransactions || [])
    .filter(t => num(t.amount) > 0 && !t.is_transfer && !t.expense_id)
    .map(t => ({ transaction: t, score: score(t, exp, days) }))
    .filter(x => x.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
