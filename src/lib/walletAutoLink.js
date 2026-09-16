// Decide when a wallet payout can be linked to its payments WITHOUT a human.
//
// findWalletPayout says "these payments add up to this deposit". That is
// enough to offer a one-click link in the match modal. It is NOT enough to
// link silently: two $150 Venmo payments from different customers both fit
// a $150 cash-out, and picking one puts the deposit on the wrong invoice.
// Auto-link only when there is exactly one way to read the deposit.
import { walletNetAmount } from './wallets'

const CENTS = (n) => Math.round((parseFloat(n) || 0) * 100)

// Unlinked wallet payments that could be in a payout dated `depositDate`:
// recorded up to 45 days before (a wallet is emptied every few weeks at
// most) and up to 3 days after (a payment logged the day after the sync).
export function paymentsInWindow(payments, depositDate, { before = 45, after = 3 } = {}) {
  const dep = new Date(depositDate).getTime()
  if (!Number.isFinite(dep)) return []
  return (payments || []).filter(p => {
    const d = new Date(p.date).getTime()
    return Number.isFinite(d) && d >= dep - before * 86400000 && d <= dep + after * 86400000
  })
}

/**
 * @param found       result of findWalletPayout, or null
 * @param candidates  the unlinked wallet payments the search ran over
 * @param wallet      the WALLETS entry (for the fee)
 * @param profile     'business' | 'personal'
 * @returns found when it is safe to link automatically, else null
 */
export function chooseAutoLink(found, candidates, wallet, profile = 'business') {
  if (!found || !found.payments?.length) return null
  const list = candidates || []

  // The payout emptied the wallet: every unlinked payment in the window is
  // in it. Nothing else it could be.
  if (found.payments.length > 1) {
    return found.payments.length === list.length ? found : null
  }

  // One payment: safe only if no OTHER candidate would have matched the
  // same deposit, gross or net — otherwise we are guessing which customer.
  const chosen = found.payments[0]
  const target = found.basis === 'net'
    ? CENTS(walletNetAmount(wallet, chosen.amount, profile))
    : CENTS(chosen.amount)
  const rivals = list.filter(p => p.id !== chosen.id && (
    Math.abs(CENTS(p.amount) - target) <= 1 ||
    Math.abs(CENTS(walletNetAmount(wallet, p.amount, profile)) - target) <= 2
  ))
  return rivals.length === 0 ? found : null
}
