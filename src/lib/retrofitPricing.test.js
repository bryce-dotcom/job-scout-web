import { describe, it, expect } from 'vitest'
import {
  effectiveUnitPrice, lineTotal, linesSubtotal,
  linePricingPayload, extrasPayload, projectCostFromParts,
} from './retrofitPricing'

const F = (over) => ({ qty: 10, productPrice: 100, retrofitType: 'fixture', ...over })

describe('effectiveUnitPrice', () => {
  it('uses the catalogue price by default', () => {
    expect(effectiveUnitPrice(F())).toBe(100)
  })
  it('a rep override replaces the catalogue price', () => {
    expect(effectiveUnitPrice(F({ priceOverride: 80 }))).toBe(80)
  })
  it('an override of 0 is honoured, not treated as absent', () => {
    expect(effectiveUnitPrice(F({ priceOverride: 0 }))).toBe(0)
  })
  it('applies a percentage discount', () => {
    expect(effectiveUnitPrice(F({ discount: 25 }))).toBe(75)
  })
  it('discounts the override, not the catalogue price', () => {
    expect(effectiveUnitPrice(F({ priceOverride: 80, discount: 50 }))).toBe(40)
  })
  it('matches the getEffectivePrice it replaces', () => {
    const line = F({ priceOverride: 137.5, discount: 12 })
    const legacy = (line.priceOverride != null ? line.priceOverride : (line.productPrice || 0)) * (1 - line.discount / 100)
    expect(effectiveUnitPrice(line)).toBeCloseTo(legacy, 10)
  })
  it('handles junk', () => {
    expect(effectiveUnitPrice(null)).toBe(0)
    expect(effectiveUnitPrice({})).toBe(0)
  })
})

describe('lineTotal', () => {
  it('is price x order quantity', () => {
    expect(lineTotal(F())).toBe(1000)
  })
  it('does not multiply a fixture product by lamps', () => {
    // The bug this whole module exists to stop.
    expect(lineTotal(F({ retrofitType: 'lamp', lampsPerFixture: 4, pricedPerLamp: false }))).toBe(1000)
  })
  it('does multiply a genuine per-lamp product', () => {
    expect(lineTotal(F({ retrofitType: 'lamp', lampsPerFixture: 4, pricedPerLamp: true }))).toBe(4000)
  })
})

describe('reconciliation', () => {
  // The real Cocola audit, with the lamp inflation removed.
  const cocola = [
    { qty: 30, productPrice: 434.98, retrofitType: 'lamp', lampsPerFixture: 4, pricedPerLamp: false },
    { qty: 3, productPrice: 397.50, retrofitType: 'lamp', lampsPerFixture: 2, pricedPerLamp: false },
    { qty: 3, productPrice: 397.50, retrofitType: 'lamp', lampsPerFixture: 2, pricedPerLamp: false },
    { qty: 1, productPrice: 397.50, retrofitType: 'lamp', lampsPerFixture: 2, pricedPerLamp: false },
    { qty: 4, productPrice: 397.50, retrofitType: 'lamp', lampsPerFixture: 2, pricedPerLamp: false },
    { qty: 8, productPrice: 391.00, retrofitType: 'lamp', lampsPerFixture: 2, pricedPerLamp: false },
  ]
  it('line subtotal equals the true catalogue cost', () => {
    expect(linesSubtotal(cocola)).toBeCloseTo(20549.90, 2)
  })
  it('lines plus extras equal the headline project cost exactly', () => {
    const extras = [
      { label: 'Disposal/recycling fee', amount: 980, in_utility_scope: true },
      { label: '5-year warranty', amount: 1500, in_utility_scope: false },
    ]
    const total = projectCostFromParts(cocola, extras)
    expect(total).toBeCloseTo(20549.90 + 2480, 2)
    // Reconciles by construction: no scale factor is ever needed.
    const sumOfParts = linesSubtotal(cocola) + extrasPayload(extras).reduce((s, e) => s + e.amount, 0)
    expect(sumOfParts).toBeCloseTo(total, 10)
  })
  it('a discount on one line does not move any other line', () => {
    const discounted = cocola.map((l, i) => i === 0 ? { ...l, discount: 10 } : l)
    for (let i = 1; i < cocola.length; i++) {
      expect(lineTotal(discounted[i])).toBe(lineTotal(cocola[i]))
    }
    expect(lineTotal(discounted[0])).toBeCloseTo(30 * 434.98 * 0.9, 2)
  })
})

describe('extrasPayload', () => {
  it('defaults missing scope to in-scope, preserves explicit false', () => {
    expect(extrasPayload([{ label: 'a', amount: 5 }])[0].in_utility_scope).toBe(true)
    expect(extrasPayload([{ label: 'b', amount: 5, in_utility_scope: false }])[0].in_utility_scope).toBe(false)
  })
  it('drops zero and malformed items', () => {
    expect(extrasPayload([{ label: 'x', amount: 0 }, null, { label: 'y' }])).toEqual([])
  })
  it('falls back to type when no label', () => {
    expect(extrasPayload([{ type: 'disposal', amount: 10 }])[0].label).toBe('disposal')
  })
  it('handles absent extras', () => {
    expect(extrasPayload(undefined)).toEqual([])
    expect(projectCostFromParts([], undefined)).toBe(0)
  })
})

describe('linePricingPayload', () => {
  it('carries everything the estimate needs to stop guessing', () => {
    const p = linePricingPayload(F({ priceOverride: 90, discount: 10, retrofitType: 'lamp', lampsPerFixture: 4, pricedPerLamp: true }))
    expect(p).toEqual({
      productQty: 40, unitPrice: 81, lineTotal: 3240,
      priceOverride: 90, discount: 10,
      retrofitType: 'lamp', lampsPerFixture: 4, pricedPerLamp: true,
    })
  })
  it('null override survives the round trip', () => {
    expect(linePricingPayload(F()).priceOverride).toBe(null)
  })
})
