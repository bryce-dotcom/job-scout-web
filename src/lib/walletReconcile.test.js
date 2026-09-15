import { describe, it, expect } from 'vitest'
import { findWalletPayout } from './walletReconcile'
import { walletById } from './wallets'

const venmo = walletById('venmo')
const zelle = walletById('zelle')
const P = (id, amount) => ({ id, amount })

describe('findWalletPayout — which wallet payments a bank payout carries', () => {
  it('one payment, same amount', () => {
    const r = findWalletPayout(venmo, [P(1, 50), P(2, 120)], 120)
    expect(r.payments.map(p => p.id)).toEqual([2])
    expect(r.basis).toBe('gross')
  })
  it('one payment net of the business fee (Venmo: 1.9% + 10¢)', () => {
    // $200 gross → $200 * 0.981 − 0.10 = $196.10
    const r = findWalletPayout(venmo, [P(1, 200)], 196.10, 'business')
    expect(r.payments.map(p => p.id)).toEqual([1])
    expect(r.basis).toBe('net')
  })
  it('does not apply a fee for a personal profile', () => {
    expect(findWalletPayout(venmo, [P(1, 200)], 196.10, 'personal')).toBe(null)
  })
  it('a lump cash-out of several payments, gross', () => {
    const r = findWalletPayout(venmo, [P(1, 75), P(2, 40), P(3, 120), P(4, 33.33)], 148.33, 'personal')
    expect(r.payments.map(p => p.id).sort()).toEqual([1, 2, 4])
    expect(r.total).toBeCloseTo(148.33, 2)
  })
  it('a lump cash-out of several payments, each net of fee', () => {
    // 100 → 98.00, 50 → 48.95; together 146.95
    const r = findWalletPayout(venmo, [P(1, 100), P(2, 50), P(3, 999)], 146.95, 'business')
    expect(r.payments.map(p => p.id).sort()).toEqual([1, 2])
    expect(r.basis).toBe('net')
  })
  it('returns null when nothing adds up', () => {
    expect(findWalletPayout(venmo, [P(1, 10), P(2, 20)], 25)).toBe(null)
    expect(findWalletPayout(venmo, [], 25)).toBe(null)
  })
  it('Zelle has no fee, so only gross matches apply', () => {
    expect(findWalletPayout(zelle, [P(1, 100)], 98)).toBe(null)
    expect(findWalletPayout(zelle, [P(1, 100)], 100).basis).toBe('gross')
  })
  it('stays fast on a long list that cannot match', () => {
    const many = Array.from({ length: 40 }, (_, i) => P(i, 7 + i * 3))
    const t0 = Date.now()
    expect(findWalletPayout(venmo, many, 0.37, 'personal')).toBe(null)
    expect(Date.now() - t0).toBeLessThan(1500)
  })
})
