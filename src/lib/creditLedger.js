// Trade-credit ledger — credit HHH holds WITH a trade partner (e.g. Haven
// Light, via Christopher's trade work). SUM(amount) over a customer's entries
// is the current balance: (+) earned/added, (-) applied to an invoice or used.

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Current credit balance = sum of all signed entry amounts. */
export function creditBalance(entries) {
  return round2((entries || []).reduce((s, e) => s + (Number(e.amount) || 0), 0))
}

/** Break the ledger into earned vs used totals (both positive) + net balance. */
export function creditTotals(entries) {
  let earned = 0, used = 0
  for (const e of entries || []) {
    const a = Number(e.amount) || 0
    if (a >= 0) earned += a
    else used += -a
  }
  return { earned: round2(earned), used: round2(used), balance: round2(earned - used) }
}

/** How much credit can be applied to an invoice: min(balance, amount still due). */
export function applicableCredit(balance, amountDue) {
  return round2(Math.max(0, Math.min(Number(balance) || 0, Number(amountDue) || 0)))
}

export function fmtMoney(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function creditKindLabel(kind) {
  return { earned: 'Credit earned', applied: 'Applied to invoice', adjustment: 'Adjustment', used: 'Credit used' }[kind] || kind
}
