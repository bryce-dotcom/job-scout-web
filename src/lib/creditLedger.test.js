import { describe, it, expect } from 'vitest'
import { creditBalance, creditTotals, applicableCredit, round2 } from './creditLedger'

const ledger = [
  { amount: 500, kind: 'earned' },
  { amount: 150.5, kind: 'earned' },
  { amount: -200, kind: 'applied' },
  { amount: -50.25, kind: 'applied' },
]

describe('creditBalance', () => {
  it('sums signed amounts to the running balance', () => {
    expect(creditBalance(ledger)).toBe(400.25)
  })
  it('is 0 for an empty ledger', () => {
    expect(creditBalance([])).toBe(0)
    expect(creditBalance(null)).toBe(0)
  })
})

describe('creditTotals', () => {
  it('splits earned vs used and nets to the balance', () => {
    expect(creditTotals(ledger)).toEqual({ earned: 650.5, used: 250.25, balance: 400.25 })
  })
})

describe('applicableCredit', () => {
  it('caps at the lesser of balance and amount due', () => {
    expect(applicableCredit(400.25, 1000)).toBe(400.25) // balance-limited
    expect(applicableCredit(400.25, 120)).toBe(120)     // due-limited
    expect(applicableCredit(0, 500)).toBe(0)            // no credit
    expect(applicableCredit(300, -5)).toBe(0)           // nothing due
  })
})

describe('round2', () => {
  it('avoids float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})
