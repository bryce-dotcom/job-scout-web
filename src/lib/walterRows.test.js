import { describe, it, expect } from 'vitest'
import { zonesFromRows, registerCounts, priceAssessment } from './walterRows'
import { DEMO_ASSESSMENT, DEMO_REGISTER, expandRegister } from './walterDemoRegister'
import { TYPICAL_SHARE_OF_REPLACEMENT, quoteTotalFromLines } from './windowEstimator'

const demo = (over = {}) => ({
  ...DEMO_ASSESSMENT,
  ...over,
  glass_damage_items: over.glass_damage_items ?? expandRegister(),
})

describe('stored rows become the zones the engine counts', () => {
  it('uses the code a person reads as the id, because duplicate_of points at it', () => {
    const [z] = zonesFromRows([{ id: 991, code: 'A07', severity: 'L1' }])
    expect(z.id).toBe('A07')
  })

  it('falls back to the row id when a mark was saved without a code', () => {
    const [z] = zonesFromRows([{ id: 991, severity: 'L1' }])
    expect(z.id).toBe('991')
  })

  it('carries the duplicate link and the reason a mark is untouchable', () => {
    const [a, b] = zonesFromRows([
      { code: 'A07-b', duplicate_of: 'A07', severity: 'L1' },
      { code: 'A19', not_restorable_reason: 'coated_surface', severity: 'L2' },
    ])
    expect(a.duplicate_of).toBe('A07')
    expect(b.not_restorable_reason).toBe('coated_surface')
  })

  it('survives a register that is empty, missing or not a list', () => {
    expect(zonesFromRows([])).toEqual([])
    expect(zonesFromRows(undefined)).toEqual([])
    expect(zonesFromRows(null)).toEqual([])
  })
})

describe('the four numbers a person asks about a register', () => {
  // The engine's `excluded` lumps duplicate photographs in with marks that
  // must not be touched, which on the demo register is 54 of 68 and reads
  // like a fault. These are the kinds kept apart.
  it('separates duplicate photos from marks excluded for a reason', () => {
    const { counts } = priceAssessment(demo())
    expect(counts.rows).toBe(68)
    expect(counts.marks).toBe(23)
    expect(counts.dupes).toBe(45)
    expect(counts.blocked).toBe(5)
  })

  it('a duplicate is never also counted as an exclusion', () => {
    const zones = zonesFromRows([
      { code: 'A01', severity: 'L1' },
      { code: 'A01-b', duplicate_of: 'A01', severity: 'L1', not_restorable_reason: 'factory_defect' },
    ])
    // The duplicate inherits its parent's reason in the seed; it must still
    // count once, as a duplicate, or the same mark is reported twice.
    const counts = registerCounts(zones, null)
    expect(counts.dupes).toBe(1)
    expect(counts.blocked).toBe(0)
  })

  it('rows minus duplicates is the number of real marks', () => {
    const { counts } = priceAssessment(demo())
    expect(counts.rows - counts.dupes).toBe(counts.marks)
    expect(counts.marks).toBe(DEMO_REGISTER.length)
  })
})

describe('the demo register, priced', () => {
  it('23 marks split into 14 to resurface, 4 to clean and 5 left alone', () => {
    const { bid, counts } = priceAssessment(demo())
    expect(counts.to_resurface).toBe(14)
    expect(counts.to_clean).toBe(4)
    expect(counts.blocked).toBe(5)
    // Everything accounted for: nothing quietly vanishes between the register
    // and the bid.
    expect(counts.to_resurface + counts.to_clean + counts.blocked).toBe(counts.marks)
    expect(bid.restoration.zones_counted).toBe(14)
  })

  it('buys four whole tech days for three and a bit days of work', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.restoration.days.exact).toBeCloseTo(3.693, 2)
    expect(bid.restoration.days.billable).toBe(4)
  })

  it('costs the day at the hours you PAY for, not the hours of glass work', () => {
    const { bid } = priceAssessment(demo())
    // $32.50/hr over an 8-hour day. Costing it at the 6.5 productive hours
    // instead would make the bid about 19% light.
    expect(bid.restoration.day_cost).toBe(260)
    expect(bid.restoration.sub_cost).toBe(4 * 260)
  })

  it('bills the residue removal as our own crew, not a subbed package', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.cleaning.work_type).toBe('residue')
    expect(bid.lines.some((l) => l.work_type === 'residue')).toBe(true)
    expect(bid.lines.some((l) => l.work_type === 'clean')).toBe(false)
  })

  it('gives optical finishing a line of its own', () => {
    // It had none until 2026-10-22: WORK_TYPES defined it and walterEstimate
    // never emitted it, so the whole finishing package fell out of the bid.
    const { bid } = priceAssessment(demo())
    const finish = bid.lines.find((l) => l.work_type === 'optical_finish')
    expect(finish).toBeTruthy()
    expect(finish.line_total).toBeGreaterThan(0)
  })

  it('is worth the sum of the lines a customer will read', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.expected).toBeCloseTo(quoteTotalFromLines(bid.lines), 2)
    expect(bid.tiers.expected).toBe(bid.expected)
  })
})

describe('what the bid is worth against replacing the glass', () => {
  it('reports the share of replacement rather than leaving a page to divide', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.value.replacement_low).toBe(45000)
    expect(bid.value.replacement_high).toBe(110000)
    expect(bid.value.share_of_replacement_low).toBeCloseTo(0.061, 3)
    expect(bid.value.share_of_replacement_high).toBeCloseTo(0.15, 3)
  })

  it('flags that cost-plus puts this job under the band the trade sells at', () => {
    // The whole argument for the service line. At a real $32.50/hr tech,
    // cost-plus-35% bids this at about $6,700 — 6% to 15% of replacing the
    // glass, under the 17% floor. AGR sold the same shape of job at 17-43%.
    // The engine only flags it; the number is a person's call.
    const { bid } = priceAssessment(demo())
    expect(bid.value.share_of_replacement_high).toBeLessThan(TYPICAL_SHARE_OF_REPLACEMENT.low)
    expect(bid.value.below_typical_band).toBe(true)
  })

  it('shows the margin over what the work actually costs', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.direct_cost).toBeGreaterThan(0)
    expect(bid.value.gross_margin).toBeCloseTo(bid.expected - bid.direct_cost, 2)
  })

  it('says nothing about value when nobody priced the alternative', () => {
    const { bid } = priceAssessment(demo({ replacement_cost_low: 0, replacement_cost_high: 0 }))
    expect(bid.value).toBeUndefined()
  })
})

describe('the vertical decides which half runs', () => {
  it('a cleaning-only visit is not handed a damage register to resurface', () => {
    const { bid } = priceAssessment(demo({ vertical: 'cleaning' }))
    expect(bid.restoration).toBeNull()
    expect(bid.cleaning).toBeTruthy()
    expect(bid.lines.some((l) => l.work_type === 'resurface')).toBe(false)
  })

  it('a restoration-only visit does not bill a pane count nobody took', () => {
    const { bid } = priceAssessment(demo({ vertical: 'restoration' }))
    expect(bid.cleaning).toBeNull()
    expect(bid.restoration).toBeTruthy()
    expect(bid.lines.some((l) => l.work_type === 'residue')).toBe(false)
  })

  it('prices the cleaning side with no damage register at all', () => {
    const { bid, counts } = priceAssessment(demo({ glass_damage_items: [] }))
    expect(counts.rows).toBe(0)
    expect(bid.restoration).toBeNull()
    expect(bid.cleaning.hours).toBeGreaterThan(0)
  })

  it('an assessment with nothing counted is the visit fee, not a crash', () => {
    // Somebody still drove out and looked at the glass. The only line is the
    // assessment, which is credited back against the work if it is booked.
    const { bid, counts } = priceAssessment({ vertical: 'both', glass_damage_items: [] })
    expect(counts.marks).toBe(0)
    expect(bid.cleaning).toBeNull()
    expect(bid.restoration).toBeNull()
    expect(bid.lines.map((l) => l.work_type)).toEqual(['assessment'])
    expect(bid.expected).toBe(bid.pricing_used.assessment_fee)
  })

  it('does not fall over on no assessment at all', () => {
    const { bid, counts } = priceAssessment(null)
    expect(counts.rows).toBe(0)
    expect(bid.lines.map((l) => l.work_type)).toEqual(['assessment'])
  })
})
