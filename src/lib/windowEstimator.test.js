import { describe, it, expect } from 'vitest'
import {
  ACCESS_PROFILES, CONDITION_PROFILES, SEVERITY_PROFILES, EDGE_FACTOR,
  countableZones, excludedZones, splitBySeverity, registerCounts,
  cleaningMinutes, restorationMinutes, techDays, techDayCost, valueCheck, TYPICAL_SHARE_OF_REPLACEMENT, valuePrice,
  threeTiers, computeCalibrationFactor, walterEstimate, quoteTotalFromLines,
} from './windowEstimator'

// The AGR UGR Eden bid, as tests. Its numbers are a worked example, not
// defaults — what is pinned here is the SHAPE of the arithmetic, because that
// is the part a photo-reading AI or a well-meaning refactor will break.
// See WALTER_AGR_FACTS.md.

// 68 marks photographed across 23 groups: the same scratch from several
// angles. A register exactly that shape.
const ugrRegister = () => {
  const zones = []
  for (let i = 1; i <= 23; i++) {
    const code = `A${String(i).padStart(2, '0')}`
    zones.push({ id: code, code, severity: i <= 14 ? 'L1' : 'L2', face: i % 2 ? 'out' : 'in', lite_id: `L${i}` })
  }
  // 45 duplicate photographs of marks already in the register.
  for (let i = 0; i < 45; i++) {
    const of = zones[i % 23]
    zones.push({ id: `${of.code}-dup${i}`, code: of.code, severity: of.severity, face: of.face, lite_id: of.lite_id, duplicate_of: of.id })
  }
  return zones
}

describe('counting what is actually there', () => {
  it('68 marks across 23 photo groups is 23 zones, not 68', () => {
    const reg = ugrRegister()
    expect(reg.length).toBe(68)
    expect(countableZones(reg).length).toBe(23)
  })

  it('a mark that cannot be restored is not counted, and says why', () => {
    const reg = [
      { id: 'A01', severity: 'L1' },
      { id: 'A02', severity: 'L2', not_restorable_reason: 'coated_surface' },
      { id: 'A03', severity: 'L2', not_restorable_reason: 'factory_defect' },
    ]
    expect(countableZones(reg).map((z) => z.id)).toEqual(['A01'])
    expect(excludedZones(reg).length).toBe(2)
  })

  it('the same id twice is one zone', () => {
    expect(countableZones([{ id: 'A01', severity: 'L1' }, { id: 'A01', severity: 'L1' }]).length).toBe(1)
  })

  it('survives a register that is empty or not a list', () => {
    expect(countableZones([])).toEqual([])
    expect(countableZones(null)).toEqual([])
    expect(countableZones(undefined)).toEqual([])
  })
})

describe('L0 is cleaning work, not restoration', () => {
  it('routes L0 to the cleaning side and leaves the rest to restoration', () => {
    const reg = [
      { id: 'A01', severity: 'L0' },
      { id: 'A02', severity: 'L0' },
      { id: 'A03', severity: 'L1' },
      { id: 'A04', severity: 'L2' },
    ]
    const split = splitBySeverity(reg)
    expect(split.cleaning.map((z) => z.id)).toEqual(['A01', 'A02'])
    expect(split.restoration.map((z) => z.id)).toEqual(['A03', 'A04'])
  })

  it('an L0 costs no restoration minutes even if it reaches the engine', () => {
    expect(SEVERITY_PROFILES.L0.minutes_per_zone).toBe(0)
    expect(SEVERITY_PROFILES.L0.restorable).toBe(false)
    const m = restorationMinutes({ zones: [{ id: 'A01', severity: 'L0', lite_id: 'L1', face: 'out' }], setup_minutes_per_face: 0 })
    expect(m).toBe(0)
  })
})

describe('restoration minutes', () => {
  it('a deep mark costs more than a light one, and an edge costs more again', () => {
    const one = (severity, edge) => restorationMinutes({
      zones: [{ id: 'A01', severity, edge, lite_id: 'L1', face: 'out' }],
      setup_minutes_per_face: 0,
    })
    expect(one('L2')).toBeGreaterThan(one('L1'))
    expect(one('L1', true)).toBeCloseTo(one('L1') * EDGE_FACTOR, 1)
  })

  it('setup is charged per FACE, not per zone', () => {
    // Ten marks on one face set up once. Ten marks on ten faces set up ten
    // times. Charging setup per zone is how a 23-zone job grows days it does
    // not have.
    const sameFace = Array.from({ length: 10 }, (_, i) => ({ id: `A${i}`, severity: 'L1', lite_id: 'L1', face: 'out' }))
    const tenFaces = Array.from({ length: 10 }, (_, i) => ({ id: `B${i}`, severity: 'L1', lite_id: `L${i}`, face: 'out' }))
    const setup = 18
    const a = restorationMinutes({ zones: sameFace, setup_minutes_per_face: setup })
    const b = restorationMinutes({ zones: tenFaces, setup_minutes_per_face: setup })
    expect(round(b - a)).toBe(round(setup * 9))
  })

  it('counts the inside and outside of one pane as two faces', () => {
    const z = [
      { id: 'A01', severity: 'L1', lite_id: 'L1', face: 'in' },
      { id: 'A02', severity: 'L1', lite_id: 'L1', face: 'out' },
    ]
    const both = restorationMinutes({ zones: z, setup_minutes_per_face: 18 })
    const oneFace = restorationMinutes({
      zones: [{ id: 'A01', severity: 'L1', lite_id: 'L1', face: 'in' }, { id: 'A02', severity: 'L1', lite_id: 'L1', face: 'in' }],
      setup_minutes_per_face: 18,
    })
    expect(both).toBeGreaterThan(oneFace)
  })

  it('ignores the duplicates, so the bid does not triple', () => {
    const reg = ugrRegister()
    const all = restorationMinutes({ zones: reg.map((z) => ({ ...z, duplicate_of: null })), setup_minutes_per_face: 0 })
    const counted = restorationMinutes({ zones: reg, setup_minutes_per_face: 0 })
    expect(counted).toBeLessThan(all / 2)
  })

  it('reaching the glass costs time', () => {
    const z = [{ id: 'A01', severity: 'L2', lite_id: 'L1', face: 'out' }]
    const ground = restorationMinutes({ zones: z, access: 'ground', setup_minutes_per_face: 0 })
    const lift = restorationMinutes({ zones: z, access: 'lift', setup_minutes_per_face: 0 })
    expect(lift).toBeCloseTo(ground * ACCESS_PROFILES.lift.factor, 1)
  })
})

describe('cleaning minutes', () => {
  it('construction residue is far slower than a maintenance clean', () => {
    const base = { panes: 100, faces: 2, minutes_per_pane_face: 3.5 }
    const maint = cleaningMinutes({ ...base, condition: 'maintenance' })
    const post = cleaningMinutes({ ...base, condition: 'post_construction' })
    expect(post).toBeCloseTo(maint * CONDITION_PROFILES.post_construction.factor, 0)
    expect(post).toBeGreaterThan(maint * 2)
  })

  it('inside and out is twice one side', () => {
    const one = cleaningMinutes({ panes: 50, faces: 1 })
    const two = cleaningMinutes({ panes: 50, faces: 2 })
    expect(two).toBeCloseTo(one * 2, 1)
  })

  it('tracks and screens are billed, because they are the forgotten half', () => {
    const bare = cleaningMinutes({ panes: 40 })
    const withExtras = cleaningMinutes({ panes: 40, tracks: 40, screens: 40 })
    expect(withExtras).toBeGreaterThan(bare)
  })

  it('a condition multiplier does not apply to tracks and screens', () => {
    // A dirty track is a dirty track whatever is on the glass.
    const a = cleaningMinutes({ panes: 0, tracks: 10, condition: 'maintenance' })
    const b = cleaningMinutes({ panes: 0, tracks: 10, condition: 'post_construction' })
    expect(a).toBe(b)
  })
})

describe('days, because you buy a tech by the day', () => {
  it('rounds part of a day up to a whole one', () => {
    expect(techDays(10, { productive_minutes_per_day: 390 }).billable).toBe(1)
    expect(techDays(391, { productive_minutes_per_day: 390 }).billable).toBe(2)
  })

  it('exactly one day is one day, not two', () => {
    expect(techDays(390, { productive_minutes_per_day: 390 }).billable).toBe(1)
  })

  it('no work is no days', () => {
    expect(techDays(0).billable).toBe(0)
  })

  it('keeps the exact figure alongside the billable one', () => {
    const d = techDays(585, { productive_minutes_per_day: 390 })
    expect(d.exact).toBeCloseTo(1.5, 2)
    expect(d.billable).toBe(2)
  })
})

describe('what a tech day costs', () => {
  it('an explicit day rate wins, because that is what a sub quotes', () => {
    expect(techDayCost({ tech_day_rate: 900, tech_hourly_rate: 32.5 })).toBe(900)
  })

  it('falls back to the hourly rate times the hours you PAY for', () => {
    expect(techDayCost({ tech_hourly_rate: 32.5, paid_hours_per_day: 8 })).toBe(260)
    expect(techDayCost({ tech_hourly_rate: 30, paid_hours_per_day: 8 })).toBe(240)
    expect(techDayCost({ tech_hourly_rate: 35, paid_hours_per_day: 8 })).toBe(280)
  })

  it('pays for the whole day even though only part of it reaches the glass', () => {
    // 390 productive minutes is 6.5 hours of glass work inside an 8-hour day.
    // Costing the day at 6.5 hours would under-price every bid by ~19%.
    expect(techDayCost({ tech_hourly_rate: 32.5 })).toBe(260)
    expect(techDayCost({ tech_hourly_rate: 32.5 })).toBeGreaterThan(32.5 * 6.5)
  })

  it('no rate at all is zero, not NaN', () => {
    expect(techDayCost({})).toBe(0)
  })
})

describe('three tiers', () => {
  it('the middle tier IS the bid, not a markup on it', () => {
    const t = threeTiers(19400)
    expect(t.expected).toBe(19400)
    expect(t.favourable).toBeLessThan(t.expected)
    expect(t.difficult).toBeGreaterThan(t.expected)
  })

  it('reproduces the AGR spread closely enough to recognise', () => {
    const t = threeTiers(19400)
    expect(t.favourable).toBeGreaterThan(14000)
    expect(t.favourable).toBeLessThan(16500)
    expect(t.difficult).toBeGreaterThan(25000)
    expect(t.difficult).toBeLessThan(28000)
  })

  it("takes a company's own spread", () => {
    const t = threeTiers(1000, { favourable: 0.9, expected: 1, difficult: 1.1 })
    expect(t.favourable).toBe(900)
    expect(t.difficult).toBe(1100)
  })
})

describe('the work is worth more than it costs, and the bid must be able to say so', () => {
  it('reports the bid as a share of replacement, both ends', () => {
    const v = valueCheck({ bid: 19400, replacement_low: 45000, replacement_high: 110000, direct_cost: 3771 })
    // AGR put this at 17-43% of replacement. The arithmetic agrees.
    expect(v.share_of_replacement_low).toBeCloseTo(0.176, 2)
    expect(v.share_of_replacement_high).toBeCloseTo(0.431, 2)
    expect(v.below_typical_band).toBe(false)
  })

  it('flags a cost-plus bid that has fallen under what the trade sells at', () => {
    // Four tech days at 30-35/hr costs about a thousand dollars. Cost plus
    // 35% prices the same work AGR charged 8,250 for at about 1,400.
    const v = valueCheck({ bid: 6807, replacement_low: 45000, replacement_high: 110000, direct_cost: 3771 })
    expect(v.below_typical_band).toBe(true)
    expect(v.gross_margin).toBe(3036)
  })

  it('says nothing when nobody supplied a replacement figure', () => {
    const v = valueCheck({ bid: 1000, direct_cost: 500 })
    expect(v.below_typical_band).toBe(null)
    expect(v.share_of_replacement_low).toBe(null)
    expect(v.gross_margin).toBe(500)
  })

  it('the band is the one the trade actually quotes', () => {
    expect(TYPICAL_SHARE_OF_REPLACEMENT.low).toBe(0.17)
    expect(TYPICAL_SHARE_OF_REPLACEMENT.high).toBe(0.43)
  })
})

describe('calibration learns, but is not stampeded by one job', () => {
  it('does nothing until there are enough finished jobs', () => {
    const r = computeCalibrationFactor([{ estimated_minutes: 100, actual_minutes: 200 }])
    expect(r.applied).toBe(false)
    expect(r.factor).toBe(1)
  })

  it("uses the company's measured ratio once there are", () => {
    const h = [
      { estimated_minutes: 100, actual_minutes: 120 },
      { estimated_minutes: 100, actual_minutes: 120 },
      { estimated_minutes: 100, actual_minutes: 120 },
    ]
    const r = computeCalibrationFactor(h)
    expect(r.applied).toBe(true)
    expect(r.factor).toBeCloseTo(1.2, 2)
  })

  it('clamps a catastrophe so it cannot triple every future bid', () => {
    const h = [
      { estimated_minutes: 10, actual_minutes: 1000 },
      { estimated_minutes: 10, actual_minutes: 1000 },
      { estimated_minutes: 10, actual_minutes: 1000 },
    ]
    expect(computeCalibrationFactor(h).factor).toBe(2)
  })
})

describe('a whole Walter bid', () => {
  const pricing = { crew_rate_per_hour: 55, tech_day_rate: 1200, sub_markup: 0.35, assessment_fee: 1450, mobilization: 0 }

  it('the quote is worth the sum of its lines', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      restoration: { zones: ugrRegister() },
      pricing,
    })
    expect(r.expected).toBe(quoteTotalFromLines(r.lines))
    expect(r.tiers.expected).toBe(r.expected)
  })

  it('every line multiplies out — quantity times price is the line total', () => {
    const r = walterEstimate({ cleaning: { panes: 100 }, restoration: { zones: ugrRegister() }, pricing })
    for (const l of r.lines) {
      expect(l.line_total).toBeCloseTo(Math.round(l.quantity * l.price * 100) / 100, 2)
    }
  })

  it("prices residue removal as our crew's hours, not a subbed package", () => {
    // The whole margin case: AGR billed $4,950 for a specialist to scrape
    // glass. That is post-construction window cleaning, which our own crew
    // already does, so it must land on the cleaning side at crew rate.
    const r = walterEstimate({ cleaning: { panes: 220, faces: 2, condition: 'post_construction' }, pricing })
    expect(r.cleaning.work_type).toBe('residue')
    const line = r.lines.find((l) => l.work_type === 'residue')
    expect(line.unit_of_measure).toBe('HR')
    expect(line.price).toBe(pricing.crew_rate_per_hour)
    expect(r.restoration).toBe(null)
  })

  it('marks up the sub, and says what the sub costs underneath', () => {
    const r = walterEstimate({ restoration: { zones: ugrRegister() }, pricing })
    expect(r.restoration.sub_cost).toBe(r.restoration.days.billable * pricing.tech_day_rate)
    expect(r.restoration.amount).toBeCloseTo(r.restoration.sub_cost * 1.35, 2)
  })

  it('reports what it did not count, so the bid can say so', () => {
    const reg = [...ugrRegister(), { id: 'X1', severity: 'L2', not_restorable_reason: 'coated_surface' }]
    const r = walterEstimate({ restoration: { zones: reg }, pricing })
    expect(r.restoration.zones_counted).toBe(23)
    expect(r.restoration.excluded).toBeGreaterThan(0)
  })

  it('bills optical finishing as its own line, not folded into resurfacing', () => {
    const r = walterEstimate({ restoration: { zones: ugrRegister() }, pricing })
    const resurface = r.lines.find((l) => l.work_type === 'resurface')
    const finish = r.lines.find((l) => l.work_type === 'optical_finish')
    expect(finish).toBeTruthy()
    expect(finish.line_total).toBeGreaterThan(0)
    // The two lines add back to the restoration total exactly.
    expect(round(resurface.line_total + finish.line_total)).toBe(round(r.restoration.amount))
    // And finishing is the smaller pass, the way the trade prices it.
    expect(finish.line_total).toBeLessThan(resurface.line_total)
  })

  it('passes a lift through as its own line', () => {
    const r = walterEstimate({ restoration: { zones: ugrRegister(), access: 'lift' }, pricing })
    expect(r.lines.some((l) => l.work_type === 'access')).toBe(true)
  })

  it('does not invent an access line when nobody leaves the ground', () => {
    const r = walterEstimate({ cleaning: { panes: 10, access: 'ground' }, pricing })
    expect(r.lines.some((l) => l.work_type === 'access')).toBe(false)
  })

  it('says which numbers it used', () => {
    const r = walterEstimate({ cleaning: { panes: 10 }, pricing })
    expect(r.pricing_used.crew_rate_per_hour).toBe(55)
    expect(r.pricing_used.productive_minutes_per_day).toBe(390)
  })

  it('an empty ask is a zero bid, not a crash', () => {
    const r = walterEstimate({ pricing: { assessment_fee: 0 } })
    expect(r.expected).toBe(0)
    expect(r.lines).toEqual([])
  })
})

const round = (n) => Math.round(n * 100) / 100

// Bryce chose value-based pricing against replacement cost on 2026-10-22.
describe('value pricing: the job is worth what not replacing the glass is worth', () => {
  const zones = () => {
    const z = []
    for (let i = 1; i <= 23; i++) z.push({ id: `A${i}`, severity: i <= 14 ? 'L1' : 'L2', face: i % 2 ? 'out' : 'in', lite_id: `L${i}` })
    return z
  }
  const pricing = {
    crew_rate_per_hour: 55, crew_cost_per_hour: 38,
    tech_hourly_rate: 32.5, paid_hours_per_day: 8,
    assessment_fee: 1450, mobilization: 0,
  }

  it('prices at a share of mid-replacement, which is AGR to the dollar', () => {
    // $45k-$110k replacement, midpoint $77,500, 25% = $19,375. AGR: $19,400.
    expect(valuePrice({ replacement_low: 45000, replacement_high: 110000 })).toBe(19375)
  })

  it('one price read against each end of the range IS the 17-43% claim', () => {
    const bid = valuePrice({ replacement_low: 45000, replacement_high: 110000 })
    expect(round(bid / 110000 * 100) / 100).toBeCloseTo(0.176, 2)
    expect(round(bid / 45000 * 100) / 100).toBeCloseTo(0.431, 2)
  })

  it('takes one figure when a company knows its replacement cost exactly', () => {
    expect(valuePrice({ replacement_low: 80000, replacement_high: 80000 })).toBe(20000)
  })

  it('bids the value, not the cost, and says so', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      restoration: { zones: zones() },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    expect(r.pricing_basis).toBe('value')
    expect(r.expected).toBeCloseTo(19375, 0)
    // The cost-plus number is still reported, so the gap is visible.
    expect(r.cost_plus_total).toBeLessThan(r.expected / 2)
  })

  it('NEVER bids under cost, however cheap the glass is to replace', () => {
    // Cheap glass, extensive damage: value says $1,250, cost says more.
    const r = walterEstimate({
      restoration: { zones: zones() },
      pricing, replacement_low: 5000, replacement_high: 5000,
    })
    // The invariant that matters is not which label it wears, it is that
    // the bid never goes out under what the work costs us.
    expect(r.expected).toBeGreaterThan(r.direct_cost)
    expect(r.expected).toBeGreaterThanOrEqual(r.cost_floor)
    expect(r.pricing_basis).not.toBe('value')
  })

  it('falls back to cost-plus when nobody said what replacement costs', () => {
    const r = walterEstimate({ restoration: { zones: zones() }, pricing })
    expect(r.pricing_basis).toBe('cost_plus')
    expect(r.expected).toBe(r.cost_plus_total)
  })

  it('leaves a cleaning-only bid on cost-plus — there is no glazier to beat', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2 },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    expect(r.pricing_basis).toBe('cost_plus')
  })

  it('a company can put restoration back on cost-plus', () => {
    const r = walterEstimate({
      restoration: { zones: zones() },
      pricing: { ...pricing, pricing_model: 'cost_plus' },
      replacement_low: 45000, replacement_high: 110000,
    })
    expect(r.pricing_basis).toBe('cost_plus')
  })

  it('the lines still add to the bid, and still multiply out', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      restoration: { zones: zones(), access: 'lift' },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    expect(quoteTotalFromLines(r.lines)).toBe(r.expected)
    for (const l of r.lines) {
      expect(l.line_total).toBeCloseTo(round(l.quantity * l.price), 2)
    }
  })

  it('leaves cleaning at the rate a customer can shop, and the fee flat', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      restoration: { zones: zones() },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    const clean = r.lines.find((l) => l.work_type === 'residue')
    const fee = r.lines.find((l) => l.work_type === 'assessment')
    // The first cut scaled these too and produced ./hr window cleaning
    // and a ,127 assessment fee. Both are numbers a customer checks.
    expect(clean.price).toBe(pricing.crew_rate_per_hour)
    expect(fee.line_total).toBe(pricing.assessment_fee)
  })

  it('puts the premium on the restoration, where the value is', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      restoration: { zones: zones() },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    const resurface = r.lines.find((l) => l.work_type === 'resurface')
    expect(resurface.line_total).toBeGreaterThan(r.restoration.amount)
  })

  it('does not mark up the lift inside a labour line', () => {
    const cost = { ...pricing }
    const a = walterEstimate({ restoration: { zones: zones(), access: 'lift' }, pricing: cost, replacement_low: 45000, replacement_high: 110000 })
    const lift = a.lines.find((l) => l.work_type === 'access')
    expect(lift.price).toBe(ACCESS_PROFILES.lift.equipment_day)
  })

  it('keeps the biggest package the biggest after scaling', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      restoration: { zones: zones() },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    const resurface = r.lines.find((l) => l.work_type === 'resurface')
    const finish = r.lines.find((l) => l.work_type === 'optical_finish')
    expect(resurface.line_total).toBeGreaterThan(finish.line_total)
  })
})

// Raised by the Walter session: one "excluded" number put 54 of 68 on screen
// and read like a fault, when 45 of them were duplicate photographs.
describe('the register tells its three kinds apart', () => {
  const reg = [
    { id: 'A01', severity: 'L1' },
    { id: 'A02', severity: 'L2' },
    { id: 'A03', severity: 'L0' },
    { id: 'A04', severity: 'L2', not_restorable_reason: 'coated_surface' },
    { id: 'A05', severity: 'L2', not_restorable_reason: 'factory_defect' },
    { id: 'd1', severity: 'L1', duplicate_of: 'A01' },
    { id: 'd2', severity: 'L1', duplicate_of: 'A01' },
    { id: 'd3', severity: 'L2', duplicate_of: 'A02' },
  ]

  it('counts rows, marks, duplicates, work and exclusions separately', () => {
    const c = registerCounts(reg)
    expect(c.rows).toBe(8)
    expect(c.duplicates).toBe(3)
    expect(c.excluded).toBe(2)
    expect(c.marks).toBe(3)        // A01, A02, A03 — A04/A05 cannot be touched
    expect(c.to_resurface).toBe(2) // A01, A02
    expect(c.to_clean).toBe(1)     // A03 is an L0
  })

  it('says WHY a mark is excluded, by reason', () => {
    expect(registerCounts(reg).excluded_reasons).toEqual({ coated_surface: 1, factory_defect: 1 })
  })

  it('a duplicate is not an exclusion — that is the whole point', () => {
    const c = registerCounts(reg)
    expect(c.duplicates).not.toBe(c.excluded)
    expect(c.rows - c.duplicates - c.excluded).toBe(c.marks)
  })

  it('rides along on a bid', () => {
    const r = walterEstimate({ restoration: { zones: reg }, pricing: { tech_hourly_rate: 32.5, assessment_fee: 0 } })
    expect(r.restoration.register.marks).toBe(3)
    expect(r.restoration.register.duplicates).toBe(3)
  })

  it('an empty register is zeros, not a crash', () => {
    expect(registerCounts([]).rows).toBe(0)
    expect(registerCounts(null).marks).toBe(0)
  })
})

// Found in a browser by the Walter session: a cleaning-only visit reported
// "4.9% of replacement" and raised the under-the-band flag — a bid told off
// for not being expensive enough to replace a window.
describe('replacement is the alternative to RESTORING glass, not to cleaning it', () => {
  const pricing = { crew_rate_per_hour: 55, crew_cost_per_hour: 38, tech_hourly_rate: 32.5, assessment_fee: 0 }

  it('a cleaning-only bid gets no value comparison at all', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    expect(r.value).toBeUndefined()
    expect(r.pricing_basis).toBe('cost_plus')
  })

  it('and still costs what it costs', () => {
    const r = walterEstimate({ cleaning: { panes: 220, faces: 2 }, pricing, replacement_low: 45000, replacement_high: 110000 })
    expect(r.expected).toBe(r.cost_plus_total)
    expect(r.expected).toBeGreaterThan(0)
  })

  it('the same visit WITH restoration does get the comparison', () => {
    const r = walterEstimate({
      cleaning: { panes: 220, faces: 2, condition: 'post_construction' },
      restoration: { zones: [{ id: 'A01', severity: 'L2', lite_id: 'L1', face: 'out' }] },
      pricing, replacement_low: 45000, replacement_high: 110000,
    })
    expect(r.value).toBeTruthy()
    expect(r.value.below_typical_band).toBe(false)
  })
})

// Both raised by the Walter session after building the screens.
describe('the register names what a person actually counts', () => {
  const reg = [
    { id: 'A01', severity: 'L1' },
    { id: 'A02', severity: 'L2' },
    { id: 'A03', severity: 'L0' },
    { id: 'A20', severity: 'L2', not_restorable_reason: 'coated_surface' },
    { id: 'A20-b', severity: 'L2', not_restorable_reason: 'coated_surface', duplicate_of: 'A20' },
    { id: 'A20-c', severity: 'L2', not_restorable_reason: 'coated_surface', duplicate_of: 'A20' },
    { id: 'd1', severity: 'L1', duplicate_of: 'A01' },
  ]

  it('distinct_marks is what is on the wall; marks is what gets worked', () => {
    const c = registerCounts(reg)
    expect(c.rows).toBe(7)
    expect(c.distinct_marks).toBe(4)  // A01, A02, A03, A20
    expect(c.marks).toBe(3)           // A20 cannot be touched
    expect(c.duplicates).toBe(3)
  })

  it('every screen can stop deriving it by hand', () => {
    const c = registerCounts(reg)
    expect(c.distinct_marks).toBe(c.rows - c.duplicates)
  })

  it('an excluded mark photographed three times is ONE exclusion', () => {
    // This printed A20, A20-b and A20-c under a count of five on a real
    // screen. A duplicate is not an exclusion; it inherits a reason.
    const ex = excludedZones(reg)
    expect(ex.length).toBe(1)
    expect(ex[0].id).toBe('A20')
  })

  it('the excluded list and the excluded count agree', () => {
    const c = registerCounts(reg)
    expect(excludedZones(reg).length).toBe(c.excluded)
  })

  it('a bid reports both numbers', () => {
    const r = walterEstimate({ restoration: { zones: reg }, pricing: { tech_hourly_rate: 32.5, assessment_fee: 0 } })
    expect(r.restoration.register.distinct_marks).toBe(4)
    expect(r.restoration.excluded).toBe(1)
  })
})
