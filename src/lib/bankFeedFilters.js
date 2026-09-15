// Virtual account filters for the Books > Transactions bank feed.
//
// Venmo (and its cousins) are not a bank account Plaid syncs for most small
// businesses, so there is no connected_account_id to filter on. What DOES
// exist is every Venmo cash-out, payment and fee as it lands in the real bank
// account — "VENMO CASHOUT", "Venmo *Payment", "VENMO PAYMENT 1234567890".
// The Venmo option in the account filter selects those rows.

const VENMO_RE = /\bvenmo\b/i

// Plaid fills merchant_name when it recognizes the counterparty and always
// fills name with the raw bank descriptor. Check both — cash-outs often have
// no merchant_name at all.
export function isVenmoTransaction(t) {
  if (!t) return false
  return VENMO_RE.test(t.merchant_name || '') || VENMO_RE.test(t.name || '')
}

export const VENMO_FILTER = 'venmo'

// Value the account <select> uses for the virtual Venmo option, kept distinct
// from the numeric connected_account ids so parseInt never mistakes it.
export function isVirtualAccountFilter(value) {
  return value === VENMO_FILTER
}
