import { describe, it, expect } from 'vitest'
import { zonesFromRows, priceAssessment } from './walterRows'
import { DEMO_ASSESSMENT, DEMO_REGISTER, expandRegister } from './walterDemoRegister'
import { TYPICAL_SHARE_OF_REPLACEMENT, quoteTotalFromLines } from './windowEstimator'

const demo = (over = {}) => ({
  ...DEMO_ASSESSMENT,
  ...over,
  glass_damage_items: over.glass_damage_items ?? expandRegister(),
})

const lineOf = (bid, type) => bid.lines.find((l) => l.work_type === type)

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

describe('what the register is made of', () => {
  it('keeps duplicate photographs apart from marks excluded for a reason', () => {
    const { counts } = priceAssessment(demo())
    expect(counts.rows).toBe(68)
    expect(counts.duplicates).toBe(45)
    expect(counts.excluded).toBe(5)
    // `marks` is what the engine will WORK, so it leaves out both.
    expect(counts.marks).toBe(18)
  })

  it('rows less duplicates is how many real marks the building has', () => {
    const { counts } = priceAssessment(demo())
    expect(counts.rows - counts.duplicates).toBe(DEMO_REGISTER.length)
    expect(counts.marks + counts.excluded).toBe(DEMO_REGISTER.length)
  })

  it('names the reasons separately, because they are different conversations', () => {
    // A coating that cannot be abraded is our problem to explain; a factory
    // defect is a warranty claim against the window maker.
    const { counts } = priceAssessment(demo())
    expect(counts.excluded_reasons).toEqual({
      coated_surface: 1,
      factory_defect: 3,
      through_crack: 1,
    })
  })

  it('23 marks split into 14 to resurface, 4 to clean and 5 left alone', () => {
    const { bid, counts } = priceAssessment(demo())
    expect(counts.to_resurface).toBe(14)
    expect(counts.to_clean).toBe(4)
    // Nothing quietly vanishes between the register and the bid.
    expect(counts.to_resurface + counts.to_clean + counts.excluded)
      .toBe(counts.rows - counts.duplicates)
    expect(bid.restoration.zones_counted).toBe(14)
  })
})

describe('the demo register, priced', () => {
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

  it('prices the glass against replacing it, not against our labour', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.pricing_basis).toBe('value')
    // Within a whisker of the $19,400 the same shape of job actually sold for.
    expect(bid.expected).toBeCloseTo(19375, 0)
  })

  it('bills the residue removal as our own crew, not a subbed package', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.cleaning.work_type).toBe('residue')
    expect(lineOf(bid, 'residue')).toBeTruthy()
    expect(lineOf(bid, 'clean')).toBeFalsy()
  })

  it('does NOT spread the value premium across lines a customer can price-check', () => {
    // An earlier cut scaled every line and produced $156/hr window cleaning
    // and a $450 assessment billed at $4,127. Cleaning stays at the company's
    // hourly rate and a flat fee stays flat; the specialist work absorbs it.
    const { bid } = priceAssessment(demo())
    expect(lineOf(bid, 'residue').price).toBe(55)
    expect(lineOf(bid, 'assessment').line_total).toBe(450)
    expect(lineOf(bid, 'resurface').line_total).toBeGreaterThan(bid.restoration.amount)
  })

  it('gives optical finishing a line of its own', () => {
    // It had none until 2026-10-22: WORK_TYPES defined it and walterEstimate
    // never emitted it, so the whole finishing package fell out of the bid.
    const { bid } = priceAssessment(demo())
    expect(lineOf(bid, 'optical_finish').line_total).toBeGreaterThan(0)
  })

  it('is worth the sum of the lines a customer will read', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.expected).toBeCloseTo(quoteTotalFromLines(bid.lines), 2)
    expect(bid.tiers.expected).toBe(bid.expected)
  })

  it('lands all three tiers within a percent of what the job really sold for', () => {
    const { bid } = priceAssessment(demo())
    const sold = { favourable: 15150, expected: 19400, difficult: 26500 }
    for (const k of Object.keys(sold)) {
      expect(Math.abs(bid.tiers[k] - sold[k]) / sold[k]).toBeLessThan(0.01)
    }
  })
})

describe('what the bid is worth against replacing the glass', () => {
  it('reports the share of replacement rather than leaving a page to divide', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.value.replacement_low).toBe(45000)
    expect(bid.value.replacement_high).toBe(110000)
    expect(bid.value.share_of_replacement_low).toBeCloseTo(0.176, 2)
    expect(bid.value.share_of_replacement_high).toBeCloseTo(0.431, 2)
  })

  it('sits inside the band the trade sells at, so nothing is flagged', () => {
    // This is the fix landing: at a real tech rate, cost-plus bid this job at
    // ~$6,700 — 6% to 15% of replacement, under the 17% floor. Pricing on
    // value puts it where the trade actually clears.
    const { bid } = priceAssessment(demo())
    expect(bid.value.share_of_replacement_high)
      .toBeGreaterThanOrEqual(TYPICAL_SHARE_OF_REPLACEMENT.low)
    expect(bid.value.below_typical_band).toBe(false)
  })

  it('shows the margin over what the work actually costs', () => {
    const { bid } = priceAssessment(demo())
    expect(bid.direct_cost).toBeGreaterThan(0)
    expect(bid.value.gross_margin).toBeCloseTo(bid.expected - bid.direct_cost, 2)
  })

  it('says nothing about value when nobody priced the alternative', () => {
    const { bid } = priceAssessment(demo({ replacement_cost_low: 0, replacement_cost_high: 0 }))
    expect(bid.value).toBeUndefined()
    expect(bid.pricing_basis).toBe('cost_plus')
  })

  it('refuses to let value pricing bid under what the work costs', () => {
    // Cheap glass with a lot of marks on it: a quarter of a $3,500 midpoint is
    // $875 against four tech days. The cost side has to win.
    const { bid } = priceAssessment(demo({
      replacement_cost_low: 3000,
      replacement_cost_high: 4000,
    }))
    expect(bid.pricing_basis).not.toBe('value')
    expect(bid.expected).toBeGreaterThan(bid.direct_cost)
    expect(bid.expected).toBeGreaterThanOrEqual(bid.cost_floor)
  })
})

describe('the vertical decides which half runs', () => {
  it('a cleaning-only visit is not handed a damage register to resurface', () => {
    const { bid } = priceAssessment(demo({ vertical: 'cleaning' }))
    expect(bid.restoration).toBeNull()
    expect(bid.cleaning).toBeTruthy()
    expect(lineOf(bid, 'resurface')).toBeFalsy()
  })

  it('never prices a cleaning-only visit against the cost of new glass', () => {
    // There are no value-bearing lines, so value pricing cannot apply —
    // scraping stucco off a window is not an alternative to replacing it.
    const { bid } = priceAssessment(demo({ vertical: 'cleaning' }))
    expect(bid.pricing_basis).toBe('cost_plus')
    expect(lineOf(bid, 'residue').price).toBe(55)
  })

  it('a restoration-only visit does not bill a pane count nobody took', () => {
    const { bid } = priceAssessment(demo({ vertical: 'restoration' }))
    expect(bid.cleaning).toBeNull()
    expect(bid.restoration).toBeTruthy()
    expect(lineOf(bid, 'residue')).toBeFalsy()
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
