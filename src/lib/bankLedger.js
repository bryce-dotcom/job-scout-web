// The bank ledger Books renders, and the one rule for what counts as a
// duplicate in it.
//
// Two importers write into plaid_transactions:
//   - plaid-link, for real bank transactions
//   - stripe-sync-books, which adds a synthetic "Stripe Payout" journal row per
//     payout, keyed `stripe_<payout_id>`, with no connected_account_id
//
// A payout is one movement of money seen twice: leaving Stripe, arriving at the
// bank. Both rows were categorised "Sales" and confirmed, so $24,898.88 was
// counted twice in the ledger Tracy works from.
//
// The bank row is the one that actually happened in a bank account, so the
// synthetic journal row is what gets hidden — never the other way round. The
// rows are kept, not deleted: all 31 carry a category, a confirmation and a
// note that somebody typed.

// Written by stripe-sync-books, which prefixes the key so it can never collide
// with a real Plaid transaction id.
export function isStripeJournalRow(txn) {
  return String(txn?.plaid_transaction_id || '').startsWith('stripe_')
}

const DAY = 24 * 60 * 60 * 1000
const TWIN_WINDOW_DAYS = 2

function mentionsStripe(txn) {
  return /stripe/i.test(`${txn?.name || ''} ${txn?.merchant_name || ''}`)
}

// Does the bank feed already contain this payout?
//
// Same amount, within a couple of days (a payout's arrival date and the bank's
// posting date rarely agree), and the bank row must itself name Stripe. That
// last condition is what makes this safe: on the real data all 21 twins name
// Stripe, so requiring it costs nothing and stops an unrelated transaction that
// happens to share an amount from suppressing a payout.
export function hasBankTwin(journalRow, rows = []) {
  const amount = Number(journalRow?.amount)
  const when = new Date(journalRow?.date).getTime()
  if (!Number.isFinite(amount) || !Number.isFinite(when)) return false
  return rows.some(other =>
    other !== journalRow &&
    !isStripeJournalRow(other) &&
    Number(other?.amount) === amount &&
    Math.abs(new Date(other?.date).getTime() - when) <= TWIN_WINDOW_DAYS * DAY &&
    mentionsStripe(other),
  )
}

// Returns the ledger with duplicated payout journals removed, plus how many
// went — the count is reported in Books rather than swallowed, because a list
// that quietly drops rows is its own kind of wrong.
export function dedupeStripePayouts(rows = []) {
  const hidden = []
  const kept = []
  for (const row of rows) {
    if (isStripeJournalRow(row) && hasBankTwin(row, rows)) hidden.push(row)
    else kept.push(row)
  }
  return { rows: kept, hidden: hidden.length }
}
