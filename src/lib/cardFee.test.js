import { describe, it, expect } from 'vitest'
import { cardFeeSplit } from './cardFee'

const forward = (principal, pct) => Math.round((principal + Math.round(principal * pct / 100 * 100) / 100) * 100) / 100

describe('splitting a card charge back into amount and fee', () => {
  it("Tracy's invoice: $550.68 charged at 1.9% is $540.41 owed + $10.27 fee", () => {
    expect(cardFeeSplit(550.68, 1.9)).toEqual({ principal: 540.41, fee: 10.27 })
  })
  it('reproduces the portal arithmetic exactly for every cent in a range', () => {
    for (let cents = 100; cents < 100000; cents += 37) {
      const principal = cents / 100
      const total = forward(principal, 1.9)
      const split = cardFeeSplit(total, 1.9)
      expect(split.principal + split.fee).toBeCloseTo(total, 2)
      expect(forward(split.principal, 1.9)).toBeCloseTo(total, 2)
    }
  })
  it('other percentages and no fee', () => {
    expect(cardFeeSplit(103, 3)).toEqual({ principal: 100, fee: 3 })
    expect(cardFeeSplit(100, 0)).toEqual({ principal: 100, fee: 0 })
    expect(cardFeeSplit(0, 1.9)).toEqual({ principal: 0, fee: 0 })
    expect(cardFeeSplit('550.68', '1.9')).toEqual({ principal: 540.41, fee: 10.27 })
  })
})
