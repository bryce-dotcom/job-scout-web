// Allocation of calendar costs — insurance, drivers — across a fleet.
//
// The property that matters throughout: the money must all land somewhere.
// Every test that checks a split also checks the total is preserved, because
// the failure mode here is silent. An asset that drops out of a weighting
// takes its share with it, the fleet's insurance total quietly shrinks, and
// every machine looks slightly cheaper to own than it is.

import { describe, it, expect } from 'vitest'
import {
  annualAmount, isActiveOn, allocateFleetWide, annualRecurringByAsset, annualByType,
  COST_TYPES, ALLOCATIONS,
} from './fleetRecurringCosts'

const fleetWide = (over = {}) => ({
  id: 1, fleet_id: null, cost_type: 'insurance', amount: 1200, period: 'monthly',
  allocation: 'even', effective_from: '2020-01-01', effective_to: null, ...over,
})

const assets = [
  { id: 10, value: 80000, meter: 20000 },
  { id: 11, value: 20000, meter: 5000 },
]

const sum = m => [...m.values()].reduce((t, v) => t + v, 0)

describe('period normalisation', () => {
  it('converts each billing period to a year', () => {
    expect(annualAmount({ amount: 100, period: 'weekly' })).toBe(5200)
    expect(annualAmount({ amount: 100, period: 'monthly' })).toBe(1200)
    expect(annualAmount({ amount: 100, period: 'quarterly' })).toBe(400)
    expect(annualAmount({ amount: 100, period: 'annual' })).toBe(100)
  })

  it('treats a missing amount as nothing, not as NaN', () => {
    expect(annualAmount({ amount: null, period: 'monthly' })).toBe(0)
    expect(annualAmount({})).toBe(0)
  })
})

describe('effective dates', () => {
  // Passed as YYYY-MM-DD on purpose: these are calendar dates, and new Date()
  // on a bare date string means UTC midnight, which is the previous day in
  // every timezone west of Greenwich.
  // Rates are history, not editable state: a premium rising in March must not
  // retroactively change what a machine cost to own in January.
  const row = fleetWide({ effective_from: '2026-03-01', effective_to: '2026-06-30' })

  it('excludes a cost before it starts', () => {
    expect(isActiveOn(row, '2026-02-15')).toBe(false)
  })

  it('includes a cost inside its window, edges included', () => {
    expect(isActiveOn(row, '2026-03-01')).toBe(true)
    expect(isActiveOn(row, '2026-06-30')).toBe(true)
  })

  it('excludes a cost after it ends', () => {
    expect(isActiveOn(row, '2026-07-01')).toBe(false)
  })

  it('treats an open end date as still in force', () => {
    expect(isActiveOn(fleetWide({ effective_to: null }), '2030-01-01')).toBe(true)
  })
})

describe('fleet-wide allocation', () => {
  it('splits evenly when asked to', () => {
    const { perAsset } = allocateFleetWide([fleetWide()], assets)
    expect(perAsset.get(10)).toBe(7200)
    expect(perAsset.get(11)).toBe(7200)
  })

  it('charges costlier machines more when allocating by value', () => {
    // The whole reason the basis is configurable. An $80k truck and a $20k
    // trailer are not the same risk, and an even split makes the trailer look
    // expensive to own and the truck cheap — which is exactly the comparison
    // this layer exists to get right.
    const { perAsset } = allocateFleetWide([fleetWide({ allocation: 'value' })], assets)
    expect(perAsset.get(10)).toBeCloseTo(14400 * 0.8, 6)
    expect(perAsset.get(11)).toBeCloseTo(14400 * 0.2, 6)
    expect(sum(perAsset)).toBeCloseTo(14400, 6)
  })

  it('allocates by usage when that is the basis', () => {
    const { perAsset } = allocateFleetWide([fleetWide({ allocation: 'usage' })], assets)
    expect(perAsset.get(10)).toBeCloseTo(14400 * (20000 / 25000), 6)
    expect(sum(perAsset)).toBeCloseTo(14400, 6)
  })

  it('preserves the total under every basis', () => {
    for (const basis of ['even', 'value', 'usage']) {
      const { perAsset } = allocateFleetWide([fleetWide({ allocation: basis })], assets)
      expect(sum(perAsset), basis).toBeCloseTo(14400, 6)
    }
  })

  it('gives an unpriced asset the mean rather than dropping it', () => {
    // Without this the unpriced machine vanishes from the split and the other
    // assets silently absorb its share — the fleet total stays right while
    // every per-asset figure is wrong.
    const mixed = [{ id: 10, value: 80000 }, { id: 11, value: null }]
    const { perAsset, fallbacks } = allocateFleetWide([fleetWide({ allocation: 'value' })], mixed)
    expect(perAsset.get(11)).toBeGreaterThan(0)
    expect(sum(perAsset)).toBeCloseTo(14400, 6)
    expect(fallbacks.length).toBe(1)
  })

  it('falls back to an even split when nothing can be weighted, and says so', () => {
    const unpriced = [{ id: 10, value: null }, { id: 11, value: null }]
    const { perAsset, fallbacks } = allocateFleetWide([fleetWide({ allocation: 'value' })], unpriced)
    expect(perAsset.get(10)).toBe(7200)
    expect(sum(perAsset)).toBeCloseTo(14400, 6)
    expect(fallbacks[0]).toMatchObject({ requested: 'value', used: 'even' })
  })

  it('ignores costs outside their effective window', () => {
    const { perAsset } = allocateFleetWide(
      [fleetWide({ effective_to: '2020-12-31' })], assets, '2026-01-01',
    )
    expect(sum(perAsset)).toBe(0)
  })

  it('does not fall over on an empty fleet', () => {
    expect(sum(allocateFleetWide([fleetWide()], []).perAsset)).toBe(0)
  })
})

describe('per-unit plus allocated share', () => {
  it('adds an asset-specific cost on top of its fleet-wide share', () => {
    const rows = [
      fleetWide({ id: 1, allocation: 'even' }),                                  // 14,400/yr split
      { id: 2, fleet_id: 10, cost_type: 'driver', amount: 4000, period: 'monthly', effective_from: '2020-01-01' },
    ]
    const { perAsset } = annualRecurringByAsset(rows, assets)
    expect(perAsset.get(10)).toBe(7200 + 48000)
    expect(perAsset.get(11)).toBe(7200)
  })

  it('ignores a cost pointing at an asset that is gone', () => {
    const rows = [{ id: 3, fleet_id: 999, cost_type: 'driver', amount: 100, period: 'monthly', effective_from: '2020-01-01' }]
    expect(() => annualRecurringByAsset(rows, assets)).not.toThrow()
    expect(sum(annualRecurringByAsset(rows, assets).perAsset)).toBe(0)
  })
})

describe('fleet summary', () => {
  it('totals by type and overall', () => {
    const { byType, total } = annualByType([
      fleetWide({ id: 1, cost_type: 'insurance', amount: 1200, period: 'monthly' }),
      { id: 2, cost_type: 'driver', amount: 60000, period: 'annual', effective_from: '2020-01-01' },
    ])
    expect(byType.insurance).toBe(14400)
    expect(byType.driver).toBe(60000)
    expect(total).toBe(74400)
  })
})

describe('defaults reflect how each cost behaves', () => {
  it('defaults insurance to value and drivers to even', () => {
    // Insurance premium tracks replacement cost; a driver pool does not.
    expect(COST_TYPES.find(c => c.value === 'insurance').defaultAllocation).toBe('value')
    expect(COST_TYPES.find(c => c.value === 'driver').defaultAllocation).toBe('even')
  })

  it('offers every allocation the allocator implements', () => {
    const implemented = ['value', 'even', 'usage']
    expect(ALLOCATIONS.map(a => a.value).sort()).toEqual([...implemented].sort())
  })
})
