import { describe, it, expect } from 'vitest'
import { computeLightingSavings, savingsForStorage, kwReduced } from './lightingSavings'

// AUD-MSZ3KA5S, a real audit: 10,780 W off the load, 10h x 260d at $0.08/kWh,
// customer on Rocky Mountain Schedule 6 ($9.50/kW/month).
const REAL = {
  wattsReduced: 10780,
  operatingHours: 10,
  operatingDays: 260,
  electricRate: 0.08,
  demandChargePerKw: 9.5,
  demandCoincidence: 0.8,
}

describe('the number Cole said was low', () => {
  it('still computes the energy half exactly as before', () => {
    const s = computeLightingSavings(REAL)
    expect(s.annualKwh).toBeCloseTo(28028, 0)      // 10.78kW x 2600h
    expect(s.energyDollars).toBeCloseTo(2242.24, 2) // what the audit showed
  })

  it('adds the demand half the bill actually charges for', () => {
    const s = computeLightingSavings(REAL)
    expect(s.demandDollars).toBeCloseTo(983.14, 2)  // 10.78kW x $9.50 x 12 x 0.8
    expect(s.totalDollars).toBeCloseTo(3225.38, 2)
  })

  // The whole point of the ticket: the old number was ~41% light.
  it('is materially larger than energy alone', () => {
    const s = computeLightingSavings(REAL)
    expect(s.totalDollars / s.energyDollars).toBeGreaterThan(1.4)
  })
})

describe('customers who are not on a demand tariff', () => {
  it('is unchanged when the tariff has no demand charge', () => {
    const s = computeLightingSavings({ ...REAL, demandChargePerKw: 0 })
    expect(s.demandDollars).toBe(0)
    expect(s.totalDollars).toBeCloseTo(s.energyDollars, 6)
  })

  it('treats null/undefined/missing the same as no demand charge', () => {
    for (const dc of [null, undefined, '', NaN]) {
      expect(computeLightingSavings({ ...REAL, demandChargePerKw: dc }).demandDollars).toBe(0)
    }
  })
})

describe('the coincidence factor cannot inflate the claim', () => {
  it('never claims more demand reduction than the fixtures draw', () => {
    const full = computeLightingSavings({ ...REAL, demandCoincidence: 1 })
    const silly = computeLightingSavings({ ...REAL, demandCoincidence: 4 })
    expect(silly.demandDollars).toBeCloseTo(full.demandDollars, 6)
  })

  it('a zero factor removes the demand claim entirely', () => {
    expect(computeLightingSavings({ ...REAL, demandCoincidence: 0 }).demandDollars).toBe(0)
  })

  it('a negative factor cannot subtract savings', () => {
    expect(computeLightingSavings({ ...REAL, demandCoincidence: -2 }).demandDollars).toBe(0)
  })
})

describe('junk in does not produce a wrong number on a proposal', () => {
  it('returns zeroes rather than NaN for an empty audit', () => {
    const s = computeLightingSavings({})
    expect(s.totalDollars).toBe(0)
    expect(s.annualKwh).toBe(0)
    expect(Number.isNaN(s.totalDollars)).toBe(false)
  })

  it('ignores a negative wattage reduction instead of inventing a loss', () => {
    expect(kwReduced(-5000)).toBe(0)
    expect(computeLightingSavings({ ...REAL, wattsReduced: -5000 }).totalDollars).toBe(0)
  })

  it('survives strings, which is what form inputs hand over', () => {
    const s = computeLightingSavings({
      wattsReduced: '10780', operatingHours: '10', operatingDays: '260',
      electricRate: '0.08', demandChargePerKw: '9.5', demandCoincidence: '0.8',
    })
    expect(s.totalDollars).toBeCloseTo(3225.38, 2)
  })
})

describe('storage shape matches the existing columns', () => {
  it('rounds kWh to a whole number and dollars to cents', () => {
    expect(savingsForStorage(REAL)).toEqual({
      annual_savings_kwh: 28028,
      annual_savings_dollars: 3225.38,
    })
  })

  it('never writes NaN into the audit row', () => {
    expect(savingsForStorage({})).toEqual({ annual_savings_kwh: 0, annual_savings_dollars: 0 })
  })
})
