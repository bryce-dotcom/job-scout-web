// Virtual account filters for the Books > Transactions bank feed.
//
// Venmo, Cash App and Zelle are not bank accounts Plaid syncs for most
// small businesses, so there is no connected_account_id to filter on. What
// DOES exist is every cash-out, payment and fee as it lands in the real bank
// account — "VENMO CASHOUT", "SQ *CASH APP", "Zelle payment from …". Each
// wallet gets a virtual option in the account filter that selects those rows.
import { WALLETS, walletById } from './wallets'

const VALUE_PREFIX = 'wallet:'

// Plaid fills merchant_name when it recognizes the counterparty and always
// fills name with the raw bank descriptor. Check both — cash-outs often have
// no merchant_name at all.
export function isWalletTransaction(wallet, t) {
  if (!wallet || !t) return false
  return wallet.feedRe.test(t.merchant_name || '') || wallet.feedRe.test(t.name || '')
}

// Kept for existing callers and tests.
export function isVenmoTransaction(t) {
  return isWalletTransaction(walletById('venmo'), t)
}

// Options for the account <select>, after the real connected accounts.
export const WALLET_FEED_FILTERS = WALLETS.map(w => ({
  value: `${VALUE_PREFIX}${w.id}`,
  label: `${w.label} (via bank feed)`,
  wallet: w,
}))

export const VENMO_FILTER = `${VALUE_PREFIX}venmo`

// Values are distinct from the numeric connected_account ids so parseInt
// never mistakes one for an account.
export function isVirtualAccountFilter(value) {
  return typeof value === 'string' && value.startsWith(VALUE_PREFIX)
}

export function walletForFilter(value) {
  if (!isVirtualAccountFilter(value)) return null
  return walletById(value.slice(VALUE_PREFIX.length))
}

// Does this feed row belong to the selected virtual account?
export function matchesAccountFilter(value, t) {
  const w = walletForFilter(value)
  return w ? isWalletTransaction(w, t) : false
}
