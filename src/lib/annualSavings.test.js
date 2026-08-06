import { describe, it, expect } from 'vitest'
import { resolveAnnualSavings, findSectionMetric, isManualSavings } from './annualSavings'

// Estimate 4512 (White Cap Construction): Lenard computed 2400, Cole worked it
// out as 4629.84 and typed that in. The PDF honoured it; the interactive
// proposal kept sending the customer 2400.
const LENARD_SECTIONS = [{ type: 'roi_summary', metrics: { annual_savings: 2400 } }]

describe('which savings number the customer sees', () => {
  it('a human correction beats the computed figure', () => {
    const doc = { manual_annual_savings: 4629.84, annual_savings_dollars: 2400 }
    expect(resolveAnnualSavings(doc, LENARD_SECTIONS)).toBe(4629.84)
  })

  it('beats a snapshot baked into the proposal layout', () => {
    // This is the actual bug: the interactive proposal read only the snapshot.
    const doc = { manual_annual_savings: 4629.84 }
    expect(resolveAnnualSavings(doc, LENARD_SECTIONS)).toBe(4629.84)
  })

  it('falls back to the quote figure, then the audit, then the snapshot', () => {
    expect(resolveAnnualSavings({ annual_savings_dollars: 3100 }, LENARD_SECTIONS)).toBe(3100)
    expect(resolveAnnualSavings({ audit: { annual_savings_dollars: 900 } }, LENARD_SECTIONS)).toBe(900)
    expect(resolveAnnualSavings({}, LENARD_SECTIONS)).toBe(2400)
  })

  it('does not treat 0 or blank as an override', () => {
    // A cleared field must not wipe the real number out of the proposal.
    expect(resolveAnnualSavings({ manual_annual_savings: 0, annual_savings_dollars: 2400 })).toBe(2400)
    expect(resolveAnnualSavings({ manual_annual_savings: '', annual_savings_dollars: 2400 })).toBe(2400)
    expect(resolveAnnualSavings({ manual_annual_savings: null }, LENARD_SECTIONS)).toBe(2400)
  })

  it('accepts a numeric string, which is what an input gives you', () => {
    expect(resolveAnnualSavings({ manual_annual_savings: '4629.84' }, LENARD_SECTIONS)).toBe(4629.84)
  })

  it('returns 0 rather than NaN when nothing is known', () => {
    expect(resolveAnnualSavings(null)).toBe(0)
    expect(resolveAnnualSavings({}, null)).toBe(0)
    expect(resolveAnnualSavings({ manual_annual_savings: 'abc' }, null)).toBe(0)
  })
})

describe('reading the layout snapshot', () => {
  it('finds the metric on any section that carries it', () => {
    expect(findSectionMetric([{ metrics: { annual_savings: 500 } }], 'annual_savings')).toBe(500)
    expect(findSectionMetric([{ type: 'savings_timeline', annual_savings: 700 }], 'annual_savings')).toBe(700)
  })

  it('survives junk', () => {
    expect(findSectionMetric(null, 'annual_savings')).toBe(0)
    expect(findSectionMetric([null, undefined], 'annual_savings')).toBe(0)
  })
})

describe('knowing it was overridden', () => {
  it('reports a human correction', () => {
    expect(isManualSavings({ manual_annual_savings: 4629.84 })).toBe(true)
    expect(isManualSavings({ manual_annual_savings: 0 })).toBe(false)
    expect(isManualSavings({})).toBe(false)
    expect(isManualSavings(null)).toBe(false)
  })
})
