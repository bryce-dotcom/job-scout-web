// Lifecycle economics — the maths behind "sell it or keep it".
//
// These assert PROPERTIES rather than magic numbers, because the class curves
// are estimates that will be retuned as real comps arrive. What must never
// change is the shape: depreciation front-loaded, operating cost rising, the
// sum U-shaped with a single minimum, and unknowns surfacing as unknown
// instead of as zero.
//
// The last one matters most. A missing purchase price silently read as $0
// makes every asset look free to own and therefore worth keeping forever.

import { describe, it, expect } from 'vitest'
import {
  residualFraction, estimateValue, operatingRate, costPerUnitAt,
  optimalReplacementPoint, computeLifecycle, utilisation, recommend,
  curveFor, CLASS_CURVES,
} from './fleetLifecycle'

const pickup = curveFor('pickup')
const skid = curveFor('skid_steer')

describe('residual value', () => {
  it('starts at full price and never rises', () => {
    expect(residualFraction(0, pickup)).toBe(1)
    let prev = 1
    for (let m = 0; m <= pickup.life; m += pickup.life / 20) {
      const f = residualFraction(m, pickup)
      expect(f).toBeLessThanOrEqual(prev + 1e-9)
      prev = f
    }
  })

  it('loses more value in the first third of life than the last', () => {
    // The fact a straight-line schedule hides, and the reason people hold
    // equipment years past the point it stopped being cheap.
    const third = pickup.life / 3
    const early = residualFraction(0, pickup) - residualFraction(third, pickup)
    const late = residualFraction(third * 2, pickup) - residualFraction(third * 3, pickup)
    expect(early).toBeGreaterThan(late)
  })

  it('holds value better for iron than for road vehicles', () => {
    expect(residualFraction(skid.life * 0.5, skid))
      .toBeGreaterThan(residualFraction(pickup.life * 0.5, pickup))
  })

  it('never goes negative, even far past end of life', () => {
    expect(residualFraction(pickup.life * 5, pickup)).toBeGreaterThan(0)
  })
})

describe('value sources', () => {
  it('prefers the owner override over everything', () => {
    const r = estimateValue({ purchasePrice: 30000, used: 50000, curve: pickup, comp: 19000, override: 15000 })
    expect(r).toEqual({ value: 15000, source: 'override' })
  })

  it('prefers a researched comp over the class curve', () => {
    expect(estimateValue({ purchasePrice: 30000, used: 50000, curve: pickup, comp: 19000 }).source).toBe('comps')
  })

  it('returns null — not zero — with no purchase price', () => {
    expect(estimateValue({ used: 50000, curve: pickup }).value).toBeNull()
  })

  it('treats an explicit null price as unknown, not as $0', () => {
    // Number(null) === 0, so the obvious isFinite guard waves null through as
    // a real zero and reports the machine as free to own.
    expect(estimateValue({ purchasePrice: null, used: 50000, curve: pickup }).value).toBeNull()
    expect(estimateValue({ purchasePrice: '', used: 50000, curve: pickup }).value).toBeNull()
  })
})

describe('operating cost', () => {
  it('rises with use', () => {
    expect(operatingRate(pickup.life, pickup)).toBeGreaterThan(operatingRate(0, pickup))
  })

  it('uses measured spend over the class anchor when available', () => {
    expect(operatingRate(0, pickup, 5)).toBeGreaterThan(operatingRate(0, pickup))
  })
})

describe('the U-curve', () => {
  it('has a minimum inside a plausible life', () => {
    const best = optimalReplacementPoint({ purchasePrice: 30000, curve: pickup })
    expect(best.at).toBeGreaterThan(0)
    expect(best.at).toBeLessThan(pickup.life * 1.5)
  })

  it('really is a minimum — costlier on both sides', () => {
    const best = optimalReplacementPoint({ purchasePrice: 30000, curve: pickup })
    const before = costPerUnitAt(best.at * 0.4, { purchasePrice: 30000, curve: pickup })
    const after = costPerUnitAt(best.at * 1.4, { purchasePrice: 30000, curve: pickup })
    expect(before.total).toBeGreaterThan(best.total)
    expect(after.total).toBeGreaterThan(best.total)
  })

  it('splits into ownership plus operating exactly', () => {
    const c = costPerUnitAt(50000, { purchasePrice: 30000, curve: pickup })
    expect(c.ownership + c.operating).toBeCloseTo(c.total, 6)
  })

  it('shows ownership cost falling as use spreads it thinner', () => {
    const early = costPerUnitAt(10000, { purchasePrice: 30000, curve: pickup })
    const later = costPerUnitAt(100000, { purchasePrice: 30000, curve: pickup })
    expect(later.ownership).toBeLessThan(early.ownership)
  })

  it('moves the sell point earlier when the machine is expensive to run', () => {
    const cheap = optimalReplacementPoint({ purchasePrice: 30000, curve: pickup, measuredRate: 0.2 })
    const dear = optimalReplacementPoint({ purchasePrice: 30000, curve: pickup, measuredRate: 2.0 })
    expect(dear.at).toBeLessThan(cheap.at)
  })
})

describe('computeLifecycle', () => {
  const base = { purchasePrice: 30000, assetClass: 'pickup', meterUsed: 40000, meterAtPurchase: 0 }

  it('reports what is missing rather than guessing', () => {
    const r = computeLifecycle({ assetClass: 'pickup', meterUsed: 40000, meterAtPurchase: 0 })
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('purchase_price')
    expect(r.value).toBeNull()
  })

  it('never invents a value from a missing price', () => {
    // The failure that matters: $0 to own reads as "free", therefore "keep".
    expect(computeLifecycle({ assetClass: 'pickup', meterUsed: 40000, meterAtPurchase: 0 }).costPerUnit).toBeNull()
  })

  it('says keep early in life', () => {
    expect(computeLifecycle(base).verdict).toBe('keep')
  })

  it('says replace once past the optimum', () => {
    const r = computeLifecycle({ ...base, meterUsed: 260000 })
    expect(r.verdict).toBe('replace')
    expect(r.remainingToOptimal).toBe(0)
  })

  it('warns before the optimum, not on the day', () => {
    // Replacement takes months to arrange; arriving at the decision when it
    // is already urgent is how people buy in a hurry at a bad price.
    const opt = computeLifecycle(base).optimalAt
    expect(computeLifecycle({ ...base, meterUsed: opt * 0.85 }).verdict).toBe('plan')
  })

  it('counts prior-owner use toward value but not toward this owner cost', () => {
    const fresh = computeLifecycle(base)
    const used = computeLifecycle({ ...base, meterAtPurchase: 90000 })
    expect(used.value).toBeLessThan(fresh.value)
    expect(used.ownerUsed).toBe(fresh.ownerUsed)
  })

  it('keeps the bar position inside the bar', () => {
    for (const m of [0, 1000, 200000, 900000]) {
      const p = computeLifecycle({ ...base, meterUsed: m }).position
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('orders the zone boundaries', () => {
    const { zones } = computeLifecycle(base)
    expect(zones.keepUntil).toBeLessThan(zones.planUntil)
    expect(zones.planUntil).toBeLessThan(1)
  })

  it('uses real spend as the operating rate when there is any', () => {
    const r = computeLifecycle({ ...base, maintenanceSpend: 4000, repairSpend: 2000, fuelSpend: 6000 })
    expect(r.measuredRate).toBeCloseTo(12000 / 40000, 6)
  })
})

describe('an un-anchored meter', () => {
  it('refuses to price a truck from what the tracker has watched', () => {
    // A tracker fitted last month to a ten-year-old truck reports ~193 miles.
    // Read as an odometer that produced a confident $29.01/mile.
    const r = computeLifecycle({
      purchasePrice: 30000, assetClass: 'pickup', meterUsed: 193.4, meterAnchored: false,
    })
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('odometer_anchor')
    expect(r.costPerUnit).toBeNull()
    expect(r.value).toBeNull()
    expect(r.verdict).toBe('unknown')
    expect(r.position).toBeNull()
  })

  it('treats an absent meter_at_purchase as unknown, not as zero', () => {
    // Defaulting it to 0 asserts 'bought new', which makes a used machine
    // look years younger and pushes the sell point well past reality.
    const r = computeLifecycle({ purchasePrice: 30000, assetClass: 'pickup', meterUsed: 40000 })
    expect(r.missing).toContain('meter_at_purchase')
    expect(r.lifetimeKnown).toBe(false)
  })

  it('still honours an owner override with no meter at all', () => {
    // They know what it's worth even if we don't know its mileage.
    const r = computeLifecycle({
      purchasePrice: 30000, assetClass: 'pickup', meterUsed: 193.4,
      meterAnchored: false, overrideValue: 21500,
    })
    expect(r.value).toBe(21500)
    expect(r.valueSource).toBe('override')
  })
})

describe('the second clock: age', () => {
  // A miles-only curve cannot see a machine ageing in a yard. For lightly
  // used equipment that is the entire cost, and the model said 'keep'.
  const rho = {
    purchasePrice: 83000, assetClass: 'pickup',
    meterUsed: 3898, meterAtPurchase: 0, meterAnchored: true, ageYears: 0.76,
  }

  it('names age as the binding constraint on an under-driven asset', () => {
    const r = computeLifecycle(rho)
    expect(r.limitedBy).toBe('age')
    expect(r.ageFraction).toBeGreaterThan(r.wearFraction)
  })

  it('names wear as binding on a hard-worked one', () => {
    const r = computeLifecycle({ ...rho, meterUsed: 160000, ageYears: 3 })
    expect(r.limitedBy).toBe('wear')
  })

  it('will not call a barely-driven six-year-old truck nearly new', () => {
    // The failure age exists to catch. On miles alone a 3,898-mile truck reads
    // as almost untouched however long it has sat; the market disagrees
    // violently by year six.
    const old = computeLifecycle({ ...rho, ageYears: 6 }).value
    const milesOnly = computeLifecycle({ ...rho, ageYears: null }).value
    expect(old).toBeLessThan(milesOnly * 0.6)
  })

  it('reports the decades needed to wear it out', () => {
    // The clearest possible signal that use will never justify the price.
    expect(computeLifecycle(rho).yearsToWearOut).toBeGreaterThan(25)
  })

  it('recommends selling or renting, citing the age reason', () => {
    const u = utilisation({ meterUsed: 3898, daysOwned: 276, curve: curveFor('pickup') })
    const rec = recommend(computeLifecycle(rho), u)
    expect(rec.action).toBe('sell_or_rent')
    expect(rec.reason).toMatch(/wear out/)
  })

  it('credits low mileage for the age, but only modestly', () => {
    // Low miles are worth a premium — real, and far smaller than owners
    // expect, which is the gap this exists to show.
    const low = residualFraction(20000, pickup, 4)
    const high = residualFraction(90000, pickup, 4)
    expect(low).toBeGreaterThan(high)
    expect(low / high).toBeLessThan(1.6)
  })

  it('leaves iron far less age-sensitive than road vehicles', () => {
    const truck = residualFraction(0, curveFor('pickup'), 5)
    const digger = residualFraction(0, curveFor('excavator'), 5)
    expect(digger).toBeGreaterThan(truck)
  })
})

describe('utilisation and recommendation', () => {
  it('flags an under-used asset for sale or rent regardless of curve position', () => {
    // Capital sitting in a yard. Most fleets never see this because nobody
    // measures hours used against hours available.
    const lc = computeLifecycle({ purchasePrice: 60000, assetClass: 'skid_steer', meterUsed: 400, meterAtPurchase: 0 })
    const u = utilisation({ meterUsed: 400, daysOwned: 730, curve: curveFor('skid_steer') })
    expect(lc.verdict).toBe('keep')
    expect(recommend(lc, u).action).toBe('sell_or_rent')
  })

  it('keeps a well-used young asset', () => {
    const lc = computeLifecycle({ purchasePrice: 60000, assetClass: 'skid_steer', meterUsed: 900, meterAtPurchase: 0 })
    const u = utilisation({ meterUsed: 900, daysOwned: 365, curve: curveFor('skid_steer') })
    expect(recommend(lc, u).action).toBe('keep')
  })

  it('refuses to recommend on incomplete data', () => {
    expect(recommend(computeLifecycle({ assetClass: 'pickup' }), null).action).toBe('incomplete')
  })

  it('returns null utilisation rather than zero with no ownership period', () => {
    expect(utilisation({ meterUsed: 500, daysOwned: 0 }).rate).toBeNull()
  })
})

describe('every class curve is sane', () => {
  it('has ordered, positive parameters', () => {
    for (const [name, c] of Object.entries(CLASS_CURVES)) {
      expect(['hours', 'miles'], name).toContain(c.basis)
      expect(c.life, name).toBeGreaterThan(0)
      expect(c.residual, name).toBeGreaterThan(0)
      expect(c.residual, name).toBeLessThan(1)
      expect(c.opsGrowth, name).toBeGreaterThan(1)
    }
  })

  it('produces a sell point for every class', () => {
    for (const name of Object.keys(CLASS_CURVES)) {
      const r = computeLifecycle({ purchasePrice: 50000, assetClass: name, meterUsed: 100, meterAtPurchase: 0 })
      expect(r.optimalAt, name).toBeGreaterThan(0)
      expect(Number.isFinite(r.optimalAt), name).toBe(true)
    }
  })
})
