// Match a wallet payout in the bank feed to the wallet payments it carries.
//
// A Venmo cash-out (or Cash App payout) is rarely one payment. It is
// whatever the wallet held when someone tapped "transfer": three customers'
// payments in one lump, or one payment minus the business-profile fee.
// The deposit matcher already handles "one payment, same amount". This
// finds the rest: a single payment net of fee, or a subset of unlinked
// wallet payments that sums to the deposit, gross or net.
import { walletNetAmount } from './wallets'

const CENTS = (n) => Math.round((parseFloat(n) || 0) * 100)

// Depth-first subset search over amounts in cents, largest first, with a
// node budget so a pathological list cannot hang the UI. Returns the
// indices of the first subset found, or null.
export function findSubset(cents, targetCents, tolerance = 1, budget = 200000) {
  const order = cents.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0])
  const vals = order.map(o => o[0])
  const idx = order.map(o => o[1])
  // Suffix sums let us prune branches that can no longer reach the target.
  const suffix = new Array(vals.length + 1).fill(0)
  for (let i = vals.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + vals[i]
  let nodes = 0
  const chosen = []
  const dfs = (i, remaining) => {
    if (Math.abs(remaining) <= tolerance && chosen.length > 0) return true
    if (i >= vals.length || remaining < -tolerance) return false
    if (suffix[i] + tolerance < remaining) return false
    if (++nodes > budget) return false
    chosen.push(idx[i])
    if (dfs(i + 1, remaining - vals[i])) return true
    chosen.pop()
    return dfs(i + 1, remaining)
  }
  return dfs(0, targetCents) ? chosen.slice() : null
}

/**
 * @param wallet    a WALLETS entry
 * @param payments  unlinked wallet payments: [{ id, amount, ... }]
 * @param depositAmount  absolute deposit amount in dollars
 * @param profile   'business' | 'personal' (decides whether a fee applies)
 * @returns { payments: [...], basis: 'gross' | 'net', total } or null
 */
export function findWalletPayout(wallet, payments, depositAmount, profile = 'business') {
  const list = (payments || []).filter(p => CENTS(p.amount) > 0)
  if (list.length === 0) return null
  const target = CENTS(depositAmount)
  if (target <= 0) return null

  const gross = list.map(p => CENTS(p.amount))
  const net = list.map(p => CENTS(walletNetAmount(wallet, p.amount, profile)))
  const feeApplies = net.some((n, i) => n !== gross[i])

  // 1. One payment, exact gross.
  let i = gross.findIndex(c => Math.abs(c - target) <= 1)
  if (i >= 0) return { payments: [list[i]], basis: 'gross', total: list[i].amount }
  // 2. One payment, net of the wallet's fee.
  if (feeApplies) {
    i = net.findIndex(c => Math.abs(c - target) <= 2)
    if (i >= 0) return { payments: [list[i]], basis: 'net', total: list[i].amount }
  }
  // 3. Several payments, gross.
  const capped = list.slice(0, 40)
  let subset = findSubset(gross.slice(0, capped.length), target)
  if (subset && subset.length > 1) {
    const chosen = subset.map(k => capped[k])
    return { payments: chosen, basis: 'gross', total: chosen.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) }
  }
  // 4. Several payments, each net of fee (fees are per payment, so the
  //    tolerance grows with the count — allow a cent per payment).
  if (feeApplies) {
    subset = findSubset(net.slice(0, capped.length), target, 1 + Math.min(capped.length, 40))
    if (subset && subset.length > 1) {
      const chosen = subset.map(k => capped[k])
      return { payments: chosen, basis: 'net', total: chosen.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) }
    }
  }
  return null
}
