import { describe, it, expect } from 'vitest'
import { chooseAutoLink, paymentsInWindow } from './walletAutoLink'
import { findWalletPayout } from './walletReconcile'
import { walletById } from './wallets'

const venmo = walletById('venmo')
const P = (id, amount, date = '2026-09-10') => ({ id, amount, date })

describe('paymentsInWindow', () => {
  it('keeps payments from 45 days before to 3 days after the deposit', () => {
    const pays = [P(1, 10, '2026-07-01'), P(2, 10, '2026-08-01'), P(3, 10, '2026-09-12'), P(4, 10, '2026-09-20')]
    expect(paymentsInWindow(pays, '2026-09-10').map(p => p.id)).toEqual([2, 3])
  })
})

describe('chooseAutoLink — only when there is one way to read the deposit', () => {
  it('links a lone exact payment', () => {
    const cands = [P(1, 150), P(2, 80)]
    const found = findWalletPayout(venmo, cands, 150, 'personal')
    expect(chooseAutoLink(found, cands, venmo, 'personal')?.payments.map(p => p.id)).toEqual([1])
  })
  it('refuses when two payments of the same amount could each be the deposit', () => {
    const cands = [P(1, 150), P(2, 150)]
    const found = findWalletPayout(venmo, cands, 150, 'personal')
    expect(found).not.toBe(null)
    expect(chooseAutoLink(found, cands, venmo, 'personal')).toBe(null)
  })
  it('refuses when a gross match and a net-of-fee match collide', () => {
    // $98.00 deposit: could be a $98 payment gross, or a $100 payment net of Venmo's fee.
    const cands = [P(1, 98), P(2, 100)]
    const found = findWalletPayout(venmo, cands, 98, 'business')
    expect(chooseAutoLink(found, cands, venmo, 'business')).toBe(null)
  })
  it('links a lump that empties the wallet', () => {
    const cands = [P(1, 75), P(2, 40), P(3, 33.33)]
    const found = findWalletPayout(venmo, cands, 148.33, 'personal')
    expect(chooseAutoLink(found, cands, venmo, 'personal')?.payments).toHaveLength(3)
  })
  it('refuses a lump that leaves other candidates behind', () => {
    const cands = [P(1, 75), P(2, 40), P(3, 33.33), P(4, 500)]
    const found = findWalletPayout(venmo, cands, 148.33, 'personal')
    expect(found?.payments).toHaveLength(3)
    expect(chooseAutoLink(found, cands, venmo, 'personal')).toBe(null)
  })
  it('passes null through', () => {
    expect(chooseAutoLink(null, [], venmo)).toBe(null)
  })
})
