import { describe, it, expect } from 'vitest'
import {
  SOIL_PROFILES, soilProfile,
  bankToLoose, bankToCompacted, looseToBank, compactedToBank, volumeStates,
  prismVolume, trenchVolume, footingVolume, basinVolume, netSpoil,
  effectiveTruckCapacity, haulLoads, haulCycle, looseDensityTonPerLcy,
  machineHours, computeCalibrationFactor, MIN_CALIBRATION_SAMPLES,
  quantifyItem, priceItem, estimateDig, toQuoteLines, quoteTotalFromLines, verticalsForWorkTypes,
  WORK_TYPES, EQUIPMENT,
} from './digEstimator'

const clay = SOIL_PROFILES.clay
const earth = SOIL_PROFILES.common_earth

// ═══════════════════════════════════════════════════════════════════════
// The dirt changes size three times, and only one of those is the bid
// ═══════════════════════════════════════════════════════════════════════

describe('bank, loose and compacted are three different numbers', () => {
  it('swells when you dig it', () => {
    expect(bankToLoose(1000, clay)).toBe(1350)
    expect(bankToLoose(1000, earth)).toBe(1250)
  })

  it('shrinks when you compact it', () => {
    expect(bankToCompacted(1000, clay)).toBe(850)
  })

  it('round-trips loose back to bank', () => {
    expect(looseToBank(bankToLoose(1000, clay), clay)).toBeCloseTo(1000, 0)
  })

  it('reports all three states at once so nothing gets used unlabelled', () => {
    const v = volumeStates(1000, clay)
    expect(v).toEqual({ bcy: 1000, lcy: 1350, ccy: 850 })
  })

  it('never lets a caller mistake fill for excavation: 900 CCY of fill needs more than 900 from the pit', () => {
    const needed = compactedToBank(900, clay)
    expect(needed).toBeGreaterThan(900)
    expect(needed).toBeCloseTo(1058.82, 1)
  })
})

describe('the truck-count error that eats the profit', () => {
  // 1,000 BCY of stiff clay is 1,350 LCY on the road. Counting trucks off
  // bank yards under-counts by 25% before weight limits even come into it.
  it('hauls loose yards, not bank yards', () => {
    const bank = 1000
    const naive = Math.ceil(bank / 15)          // what a spreadsheet does
    const real = haulLoads({ lcy: bankToLoose(bank, clay), truck: 'tri_axle', soil: clay })
    expect(naive).toBe(67)
    expect(real.loads).toBeGreaterThan(naive)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Trench sloping — the single biggest quantity error in the trade
// ═══════════════════════════════════════════════════════════════════════

describe('a trench is a different size depending on how you hold it up', () => {
  const base = { length_ft: 100, width_ft: 4, depth_ft: 10 }

  it('a shored trench is length x width x depth', () => {
    const t = trenchVolume({ ...base, protection: 'shored', soil: clay })
    expect(t.bcy).toBeCloseTo(148.15, 1)
    expect(t.top_width_ft).toBe(4)
  })

  it('sloping the walls at 1.5:1 nearly quintuples the dirt', () => {
    const t = trenchVolume({ ...base, protection: 'sloped', soil: SOIL_PROFILES.sand })
    expect(t.top_width_ft).toBe(34)      // 4 + 2*(1.5*10)
    expect(t.avg_width_ft).toBe(19)
    expect(t.bcy).toBeCloseTo(703.7, 1)
  })

  it('quantifies the trap: 4.75x, which is the whole margin on a small job', () => {
    const shored = trenchVolume({ ...base, protection: 'shored', soil: SOIL_PROFILES.sand })
    const sloped = trenchVolume({ ...base, protection: 'sloped', soil: SOIL_PROFILES.sand })
    expect(sloped.bcy / shored.bcy).toBeCloseTo(4.75, 1)
  })

  it('uses the soil class allowable slope when none is given', () => {
    // Type B clay lays back 1:1, Type C sand 1.5:1 — same trench, different dirt.
    const inClay = trenchVolume({ ...base, protection: 'sloped', soil: clay })
    const inSand = trenchVolume({ ...base, protection: 'sloped', soil: SOIL_PROFILES.sand })
    expect(inClay.slope_ratio).toBe(1.0)
    expect(inSand.slope_ratio).toBe(1.5)
    expect(inSand.bcy).toBeGreaterThan(inClay.bcy)
  })

  it('an explicit slope ratio overrides the soil default', () => {
    const t = trenchVolume({ ...base, protection: 'sloped', soil: clay, slope_ratio: 2 })
    expect(t.top_width_ft).toBe(44)
  })
})

describe('OSHA limits are flagged, not silently priced around', () => {
  it('warns when a 5ft+ trench is priced with no protective system', () => {
    const t = trenchVolume({ length_ft: 50, width_ft: 3, depth_ft: 8, protection: 'none', soil: earth })
    expect(t.warnings.join(' ')).toMatch(/protective system/i)
  })

  it('does not warn on a shallow unprotected trench', () => {
    const t = trenchVolume({ length_ft: 50, width_ft: 3, depth_ft: 3, protection: 'none', soil: earth })
    expect(t.warnings).toHaveLength(0)
  })

  it('escalates past 20 ft to an engineered design', () => {
    const t = trenchVolume({ length_ft: 50, width_ft: 4, depth_ft: 22, protection: 'shored', soil: earth })
    expect(t.warnings.join(' ')).toMatch(/professional engineer/i)
  })

  it('returns zero rather than NaN on an empty trench', () => {
    expect(trenchVolume({ length_ft: 0, width_ft: 4, depth_ft: 10, soil: clay }).bcy).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Trucks bind on weight before volume
// ═══════════════════════════════════════════════════════════════════════

describe('a 15 CY truck is not always a 15 CY truck', () => {
  it('wet clay fills the weight limit before the box', () => {
    const cap = effectiveTruckCapacity({ truck: 'tri_axle', soil: clay })
    expect(cap.bound_by).toBe('weight')
    expect(cap.effective_cy).toBeLessThan(cap.volumetric_cy)
    expect(cap.effective_cy).toBeCloseTo(13.9, 0)
  })

  it('light topsoil fills the box first', () => {
    const cap = effectiveTruckCapacity({ truck: 'tri_axle', soil: SOIL_PROFILES.topsoil })
    expect(cap.bound_by).toBe('volume')
    expect(cap.effective_cy).toBe(15)
  })

  it('blasted rock is dramatically weight-bound', () => {
    const cap = effectiveTruckCapacity({ truck: 'tri_axle', soil: SOIL_PROFILES.rock })
    expect(cap.bound_by).toBe('weight')
    expect(cap.effective_cy).toBeLessThan(13)
  })

  it('loose density falls below bank density because the material swelled', () => {
    expect(looseDensityTonPerLcy(clay)).toBeLessThan(clay.bank_density_pcy / 2000)
  })

  it('counts whole loads — you cannot send 0.3 of a truck', () => {
    const h = haulLoads({ lcy: 100, truck: 'tandem', soil: earth })
    expect(Number.isInteger(h.loads)).toBe(true)
    expect(h.loads).toBe(Math.ceil(100 / h.effective_cy))
  })
})

describe('haul cycles size the fleet', () => {
  it('a longer haul needs more trucks to keep the hoe digging', () => {
    const near = haulCycle({ round_trip_miles: 4, avg_speed_mph: 30 })
    const far = haulCycle({ round_trip_miles: 30, avg_speed_mph: 30 })
    expect(far.trucks_to_sustain).toBeGreaterThan(near.trucks_to_sustain)
  })

  it('includes load, dump and queue time, not just driving', () => {
    const c = haulCycle({ round_trip_miles: 0, load_minutes: 5, dump_minutes: 3, queue_minutes: 2 })
    expect(c.cycle_minutes).toBe(10)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Geometry
// ═══════════════════════════════════════════════════════════════════════

describe('geometry converts to cubic yards', () => {
  it('a pad is area times depth over 27', () => {
    expect(prismVolume({ area_sf: 10800, depth_ft: 1 })).toBe(400)
  })

  it('a footing carries working room on both sides', () => {
    const tight = footingVolume({ perimeter_ft: 200, width_ft: 2, depth_ft: 4, overdig_each_side_ft: 0 })
    const real = footingVolume({ perimeter_ft: 200, width_ft: 2, depth_ft: 4, overdig_each_side_ft: 2 })
    expect(tight).toBeCloseTo(59.26, 1)
    expect(real).toBeCloseTo(177.78, 1)   // 3x — a form needs somewhere to stand
  })

  it('a basin averages the end areas', () => {
    expect(basinVolume({ top_area_sf: 10000, bottom_area_sf: 4000, depth_ft: 8 })).toBeCloseTo(2074.07, 1)
  })
})

describe('net spoil is what actually leaves the site', () => {
  it('reuses native for backfill before hauling anything off', () => {
    const r = netSpoil({ excavated_bcy: 1000, backfill_ccy: 400, soil: earth })
    expect(r.reused_bcy).toBeCloseTo(444.44, 1)
    expect(r.spoil_bcy).toBeCloseTo(555.56, 1)
    expect(r.import_bcy).toBe(0)
  })

  it('pipe and bedding displace native, so MORE dirt leaves than the difference suggests', () => {
    const without = netSpoil({ excavated_bcy: 500, backfill_ccy: 400, soil: earth })
    const withPipe = netSpoil({ excavated_bcy: 500, backfill_ccy: 400, displaced_cy: 60, soil: earth })
    expect(withPipe.spoil_bcy - without.spoil_bcy).toBe(60)
  })

  it('flags an import when the hole cannot fill itself', () => {
    const r = netSpoil({ excavated_bcy: 100, backfill_ccy: 900, soil: earth })
    expect(r.import_bcy).toBeGreaterThan(0)
    expect(r.spoil_bcy).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Production and calibration
// ═══════════════════════════════════════════════════════════════════════

describe('machine hours come from production rates, not vibes', () => {
  it('bigger iron moves the same dirt in fewer hours', () => {
    const mini = machineHours({ volume_bcy: 1000, equipment: 'mini_ex', activity: 'mass', soil: earth })
    const big = machineHours({ volume_bcy: 1000, equipment: 'ex_320', activity: 'mass', soil: earth })
    expect(big.hours).toBeLessThan(mini.hours)
  })

  it('hard dirt takes longer', () => {
    const easy = machineHours({ volume_bcy: 1000, equipment: 'ex_320', soil: earth })
    const hard = machineHours({ volume_bcy: 1000, equipment: 'ex_320', soil: SOIL_PROFILES.rock })
    expect(hard.hours).toBeGreaterThan(easy.hours * 2)
  })

  it('the 50-minute hour is applied, so nobody bids 60 minutes of digging per hour', () => {
    const r = machineHours({ volume_bcy: 1000, equipment: 'ex_320', activity: 'mass', soil: earth })
    expect(r.effective_rate_bcy_hr).toBeLessThan(EQUIPMENT.ex_320.mass)
  })

  it('a dozer cannot dig a trench', () => {
    expect(machineHours({ volume_bcy: 500, equipment: 'dozer_d6', activity: 'trench', soil: earth }).hours).toBe(0)
  })

  it('calibration scales the hours', () => {
    const base = machineHours({ volume_bcy: 1000, equipment: 'ex_160', soil: earth })
    const cal = machineHours({ volume_bcy: 1000, equipment: 'ex_160', soil: earth, calibration_factor: 1.2 })
    expect(cal.hours).toBeCloseTo(base.hours * 1.2, 1)
  })
})

describe('the ground-truth loop', () => {
  const overran = [
    { estimated_hours: 40, actual_hours: 50 },
    { estimated_hours: 20, actual_hours: 24 },
    { estimated_hours: 10, actual_hours: 13 },
  ]

  it('waits for enough samples before repricing the book', () => {
    const r = computeCalibrationFactor(overran.slice(0, 2))
    expect(r.applied).toBe(false)
    expect(r.factor).toBe(1)
    expect(MIN_CALIBRATION_SAMPLES).toBe(3)
  })

  it('learns that this crew runs over, and by how much', () => {
    const r = computeCalibrationFactor(overran)
    expect(r.applied).toBe(true)
    expect(r.sample_n).toBe(3)
    expect(r.factor).toBeCloseTo(1.24, 1)
  })

  it('learns the happy direction too', () => {
    const r = computeCalibrationFactor([
      { estimated_hours: 40, actual_hours: 30 },
      { estimated_hours: 20, actual_hours: 16 },
      { estimated_hours: 10, actual_hours: 7 },
    ])
    expect(r.factor).toBeLessThan(1)
  })

  it('clamps a catastrophe so one job stuck in the mud cannot triple every future bid', () => {
    const r = computeCalibrationFactor([
      { estimated_hours: 10, actual_hours: 400 },
      { estimated_hours: 10, actual_hours: 12 },
      { estimated_hours: 10, actual_hours: 11 },
    ])
    expect(r.factor).toBeLessThanOrEqual(2)
    expect(r.raw).toBeGreaterThan(2)
  })

  it('ignores rows with no logged actual', () => {
    const r = computeCalibrationFactor([
      { estimated_hours: 40, actual_hours: null },
      { estimated_hours: 20, actual_hours: 24 },
    ])
    expect(r.sample_n).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Takeoff items
// ═══════════════════════════════════════════════════════════════════════

describe('quantifying a takeoff item', () => {
  const ctx = { default_soil: 'clay', default_truck: 'tri_axle', default_equipment: 'ex_320' }

  it('turns a trench run into volumes, loads and hours in one pass', () => {
    const q = quantifyItem(
      { work_type: 'trench', length_ft: 240, width_ft: 3, depth_ft: 8, protection: 'sloped' },
      ctx
    )
    expect(q.volume_bcy).toBeGreaterThan(0)
    expect(q.volume_lcy).toBeGreaterThan(q.volume_bcy)
    expect(q.loads).toBeGreaterThan(0)
    expect(q.machine_hours).toBeGreaterThan(0)
    expect(q.geometry.top_width_ft).toBe(19)   // 3 + 2*(1*8), clay is Type B
  })

  it('carries provenance through untouched — every number can be traced back', () => {
    const q = quantifyItem(
      {
        work_type: 'mass_ex', area_sf: 20000, depth_ft: 2,
        source: 'plan', source_ref: 'C-301 grading table row 4', confidence: 0.82,
      },
      ctx
    )
    expect(q.source).toBe('plan')
    expect(q.source_ref).toBe('C-301 grading table row 4')
    expect(q.confidence).toBe(0.82)
  })

  it('defaults provenance to manual when a human typed it', () => {
    expect(quantifyItem({ work_type: 'mass_ex', area_sf: 100, depth_ft: 1 }, ctx).source).toBe('manual')
  })

  it('honours a per-item soil class over the site default', () => {
    const inRock = quantifyItem({ work_type: 'mass_ex', area_sf: 10000, depth_ft: 3, soil_class: 'rock' }, ctx)
    const inClay = quantifyItem({ work_type: 'mass_ex', area_sf: 10000, depth_ft: 3 }, ctx)
    expect(inRock.volume_lcy).toBeGreaterThan(inClay.volume_lcy)
    expect(inRock.machine_hours).toBeGreaterThan(inClay.machine_hours)
  })

  it('applies the learned calibration factor for that work type', () => {
    const plain = quantifyItem({ work_type: 'mass_ex', area_sf: 10000, depth_ft: 3 }, ctx)
    const cal = quantifyItem(
      { work_type: 'mass_ex', area_sf: 10000, depth_ft: 3 },
      { ...ctx, calibration: { mass_ex: { factor: 1.3 } } }
    )
    expect(cal.machine_hours).toBeCloseTo(plain.machine_hours * 1.3, 1)
  })
})

describe('stated quantities beat derived ones', () => {
  // Regression: a field note reading "40 ton base for drive" produced a
  // road_base item with tons=40 and no geometry. The engine recomputed
  // tonnage from a volume nobody had entered, got zero, and the line priced
  // at $0 — a real quantity silently worth nothing.
  const ctx = { default_soil: 'clay', default_truck: 'tri_axle' }
  const book = [{ work_type: 'road_base', label: 'Road base', uom: 'TON', unit_price: 34, cost: 25, kind: 'materials' }]

  it('keeps a tonnage that came off a delivery ticket', () => {
    const q = quantifyItem({ work_type: 'road_base', tons: 40 }, ctx)
    expect(q.tons).toBe(40)
    expect(q.tons_stated).toBe(true)
  })

  it('prices that line instead of zeroing it', () => {
    const p = priceItem(quantifyItem({ work_type: 'road_base', tons: 40 }, ctx), book)
    expect(p.quantity).toBe(40)
    expect(p.extension).toBe(1360)
  })

  it('keeps a load count somebody actually counted', () => {
    const q = quantifyItem({ work_type: 'haul_off', loads: 14 }, ctx)
    expect(q.loads).toBe(14)
    expect(q.loads_stated).toBe(true)
  })

  it('still derives tons and loads when nothing was stated', () => {
    const q = quantifyItem({ work_type: 'haul_off', volume_bcy: 1000, soil_class: 'clay' }, ctx)
    expect(q.loads_stated).toBe(false)
    expect(q.loads).toBeGreaterThan(90)
    expect(q.tons).toBeGreaterThan(0)
  })

  it('lets a stated count win even when geometry could derive one', () => {
    const derived = quantifyItem({ work_type: 'haul_off', volume_bcy: 1000, soil_class: 'clay' }, ctx)
    const stated = quantifyItem({ work_type: 'haul_off', volume_bcy: 1000, soil_class: 'clay', loads: 60 }, ctx)
    expect(derived.loads).not.toBe(60)
    expect(stated.loads).toBe(60)
  })
})

describe('verticals are toggles over one engine', () => {
  it('offers only the work types for the verticals a company turned on', () => {
    const trenchOnly = verticalsForWorkTypes({ trenching: true, sitework: false, foundation: false })
    expect(trenchOnly.every((w) => w.vertical === 'trenching')).toBe(true)
    expect(trenchOnly.map((w) => w.key)).toContain('trench')
    expect(trenchOnly.map((w) => w.key)).not.toContain('mass_ex')
  })

  it('offers everything when nothing is toggled off', () => {
    expect(verticalsForWorkTypes({}).length).toBe(Object.keys(WORK_TYPES).length)
  })

  it('shares the geometry across verticals — a footing and a trench are the same math', () => {
    expect(WORK_TYPES.leach_field.geometry).toBe('trench')
    expect(WORK_TYPES.trench.geometry).toBe('trench')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Pricing and the bid
// ═══════════════════════════════════════════════════════════════════════

const PRICE_BOOK = [
  { code: 'EX-100', work_type: 'mass_ex', label: 'Mass excavation', uom: 'CY', unit_price: 9.5, cost: 6.2, kind: 'labor' },
  { code: 'TR-100', work_type: 'trench', label: 'Trench 8ft', uom: 'LF', unit_price: 34, cost: 21, kind: 'labor', min_charge: 1500 },
  { code: 'HL-100', work_type: 'haul_off', label: 'Haul off', uom: 'LOAD', unit_price: 285, cost: 210, kind: 'labor' },
  { code: 'IM-100', work_type: 'import_fill', label: 'Import structural fill', uom: 'TON', unit_price: 26, cost: 19, kind: 'materials' },
]

describe('pricing a bid item', () => {
  it('bills LF work on linear feet, not cubic yards', () => {
    const q = quantifyItem({ work_type: 'trench', length_ft: 240, width_ft: 3, depth_ft: 8 }, { default_soil: 'clay' })
    const p = priceItem(q, PRICE_BOOK)
    expect(p.uom).toBe('LF')
    expect(p.quantity).toBe(240)
    expect(p.extension).toBe(round2ish(240 * 34))
  })

  it('bills CY work on bank yards', () => {
    const q = quantifyItem({ work_type: 'mass_ex', area_sf: 27000, depth_ft: 1 }, { default_soil: 'common_earth' })
    const p = priceItem(q, PRICE_BOOK)
    expect(p.quantity).toBe(1000)
    expect(p.extension).toBe(9500)
  })

  it('bills haul-off per load', () => {
    const q = quantifyItem({ work_type: 'haul_off', volume_bcy: 1000 }, { default_soil: 'clay', default_truck: 'tri_axle' })
    const p = priceItem(q, PRICE_BOOK)
    expect(p.uom).toBe('LOAD')
    expect(p.quantity).toBe(q.loads)
    expect(p.quantity).toBeGreaterThan(90)   // 1350 LCY, weight-bound trucks
  })

  it('applies a minimum charge without pretending the quantity changed', () => {
    const q = quantifyItem({ work_type: 'trench', length_ft: 10, width_ft: 3, depth_ft: 4 }, { default_soil: 'clay' })
    const p = priceItem(q, PRICE_BOOK)
    expect(p.quantity).toBe(10)
    expect(p.extension).toBe(1500)
    expect(p.min_charge_applied).toBe(true)
  })

  it('surfaces an unpriced item loudly instead of quietly pricing it at zero', () => {
    const q = quantifyItem({ work_type: 'basin', top_area_sf: 8000, bottom_area_sf: 3000, depth_ft: 6 }, {})
    const p = priceItem(q, PRICE_BOOK)
    expect(p.unpriced).toBe(true)
    expect(p.quantity).toBeGreaterThan(0)          // the quantity still shows
    expect(p.warnings.join(' ')).toMatch(/price-book/i)
  })

  it('tags material vs labor, because the invoice split depends on it', () => {
    const imported = priceItem(quantifyItem({ work_type: 'import_fill', volume_bcy: 500 }, {}), PRICE_BOOK)
    const dug = priceItem(quantifyItem({ work_type: 'mass_ex', area_sf: 27000, depth_ft: 1 }, {}), PRICE_BOOK)
    expect(imported.kind).toBe('materials')
    expect(dug.kind).toBe('labor')
  })

  it('carries cost and margin per line', () => {
    const p = priceItem(quantifyItem({ work_type: 'mass_ex', area_sf: 27000, depth_ft: 1 }, {}), PRICE_BOOK)
    expect(p.cost).toBe(6200)
    expect(p.margin).toBe(3300)
  })
})

describe('the whole bid', () => {
  const items = [
    { work_type: 'mass_ex', area_sf: 27000, depth_ft: 1, soil_class: 'common_earth', source: 'plan', source_ref: 'C-301', confidence: 0.9 },
    { work_type: 'trench', length_ft: 240, width_ft: 3, depth_ft: 8, protection: 'sloped', soil_class: 'clay', source: 'plan', source_ref: 'C-401 pipe schedule', confidence: 0.88 },
    { work_type: 'haul_off', volume_bcy: 600, soil_class: 'clay', source: 'manual' },
  ]
  const result = estimateDig({ items, priceBook: PRICE_BOOK, settings: { mobilization: 2400, overhead_percent: 0.1, profit_percent: 0.12 } })

  it('rolls up in the order the trade expects: subtotal, mob, overhead, profit, tax', () => {
    const r = result.rollup
    expect(r.subtotal).toBeGreaterThan(0)
    expect(r.mobilization).toBe(2400)
    expect(r.overhead).toBeCloseTo((r.subtotal + 2400) * 0.1, 1)
    expect(r.profit).toBeCloseTo((r.subtotal + 2400 + r.overhead) * 0.12, 1)
    expect(r.total).toBeCloseTo(r.subtotal + r.mobilization + r.overhead + r.profit, 1)
  })

  it('reports margin against real cost, not against the price', () => {
    expect(result.rollup.margin).toBe(round2ish(result.rollup.total - result.rollup.direct_cost))
    expect(result.rollup.margin_percent).toBeGreaterThan(0)
  })

  it('totals volumes and loads across every item', () => {
    expect(result.volumes.bcy).toBeGreaterThan(0)
    expect(result.volumes.lcy).toBeGreaterThan(result.volumes.bcy)
    expect(result.loads).toBeGreaterThan(0)
    expect(result.machine_hours).toBeGreaterThan(0)
  })

  it('writes the exclusions page itself', () => {
    const text = result.assumptions.join(' ')
    expect(text).toMatch(/rock/i)
    expect(text).toMatch(/OSHA/i)
    expect(text).toMatch(/mobilization/i)
  })

  it('says so when the haul was weight-limited', () => {
    expect(result.assumptions.join(' ')).toMatch(/weight-limited/i)
  })

  it('is ready to send when every line is priced and confident', () => {
    expect(result.unpriced_count).toBe(0)
    expect(result.ready_to_send).toBe(true)
  })
})

describe('a bid that is not ready to send', () => {
  it('blocks on an unpriced line', () => {
    const r = estimateDig({
      items: [{ work_type: 'basin', top_area_sf: 8000, bottom_area_sf: 3000, depth_ft: 6 }],
      priceBook: PRICE_BOOK,
    })
    expect(r.unpriced_count).toBe(1)
    expect(r.ready_to_send).toBe(false)
  })

  it('blocks on an unconfirmed low-confidence AI guess', () => {
    const r = estimateDig({
      items: [{ work_type: 'mass_ex', area_sf: 27000, depth_ft: 1, source: 'ai_photo', confidence: 0.4 }],
      priceBook: PRICE_BOOK,
    })
    expect(r.low_confidence_count).toBe(1)
    expect(r.ready_to_send).toBe(false)
  })

  it('unblocks once a human confirms the guess', () => {
    const r = estimateDig({
      items: [{ work_type: 'mass_ex', area_sf: 27000, depth_ft: 1, source: 'ai_photo', confidence: 0.4, confirmed_by: 7 }],
      priceBook: PRICE_BOOK,
    })
    expect(r.low_confidence_count).toBe(0)
    expect(r.ready_to_send).toBe(true)
  })

  it('surfaces the OSHA warning up at the bid level, not buried on the item', () => {
    const r = estimateDig({
      items: [{ work_type: 'trench', length_ft: 100, width_ft: 3, depth_ft: 9, protection: 'none' }],
      priceBook: PRICE_BOOK,
    })
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings[0].warning).toMatch(/protective system/i)
  })

  it('survives an empty takeoff without dividing by zero', () => {
    const r = estimateDig({ items: [], priceBook: PRICE_BOOK })
    expect(r.rollup.total).toBe(0)
    expect(r.rollup.margin_percent).toBe(0)
    expect(r.volumes).toEqual({ bcy: 0, lcy: 0, ccy: 0 })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Handoff to the existing money path
// ═══════════════════════════════════════════════════════════════════════

describe('quote_lines handoff', () => {
  const result = estimateDig({
    items: [
      { work_type: 'mass_ex', area_sf: 27000, depth_ft: 1, soil_class: 'common_earth' },
      { work_type: 'import_fill', volume_bcy: 400, soil_class: 'gravel' },
    ],
    priceBook: PRICE_BOOK,
  })
  const lines = toQuoteLines(result, { companyId: 3, quoteId: 999 })

  it('writes one line per bid item, tenant-scoped', () => {
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.company_id === 3 && l.quote_id === 999)).toBe(true)
  })

  it('sets the fields the invoice machinery reads', () => {
    expect(lines[0].unit_of_measure).toBe('CY')
    expect(lines[0].kind).toBe('labor')
    expect(lines[1].kind).toBe('materials')
    expect(lines.every((l) => l.in_utility_scope === false)).toBe(true)
  })

  it('extends quantity x price into line_total, so the quote adds up', () => {
    lines.forEach((l) => expect(l.line_total).toBeCloseTo(l.quantity * l.price, 1))
  })

  it('puts the volume story in the description where the customer can read it', () => {
    expect(lines[0].description).toMatch(/BCY/)
    expect(lines[0].description).toMatch(/LCY/)
  })

  it('keeps sort order stable', () => {
    expect(lines.map((l) => l.sort_order)).toEqual([0, 1])
  })
})

function round2ish(n) {
  return Math.round(n * 100) / 100
}

// ═══════════════════════════════════════════════════════════════════════
// The markup has to survive the handoff
// ═══════════════════════════════════════════════════════════════════════

describe('overhead and profit ride inside the unit prices', () => {
  // Regression: the estimate page totals a quote by summing its lines. Sending
  // bare cost lines made a $140,076 bid arrive as a $115,765 customer
  // document — the markup evaporated silently between the two screens.
  const marked = estimateDig({
    items: [
      { work_type: 'mass_ex', area_sf: 27000, depth_ft: 1, soil_class: 'common_earth' },
      { work_type: 'trench', length_ft: 240, width_ft: 3, depth_ft: 8, soil_class: 'clay' },
    ],
    priceBook: PRICE_BOOK,
    settings: { overhead_percent: 0.1, profit_percent: 0.12, mobilization: 2400 },
  })
  const lines = toQuoteLines(marked, { companyId: 3, quoteId: 1 })
  const sum = round2ish(lines.reduce((s, l) => s + l.line_total, 0))

  it('makes the lines add up to the bid exactly when mobilization can absorb the rounding', () => {
    expect(sum).toBe(round2ish(marked.rollup.total - marked.rollup.tax))
  })

  it('never breaks the one thing a customer can check: qty x price = line total', () => {
    lines.forEach((l) => expect(l.line_total).toBe(round2ish(l.quantity * l.price)))
  })

  it('prices each line above its bare cost extension', () => {
    expect(lines[0].price).toBeGreaterThan(marked.bidItems[0].unit_price)
  })

  it('turns mobilization into a line of its own, like a real bid form', () => {
    const mob = lines.find((l) => l.item_name === 'Mobilization')
    expect(mob).toBeTruthy()
    expect(mob.quantity).toBe(1)
    expect(mob.line_total).toBeGreaterThan(0)
  })

  it('never shows the customer an overhead or profit line', () => {
    const names = lines.map((l) => l.item_name.toLowerCase()).join(' ')
    expect(names).not.toMatch(/overhead|profit|markup/)
  })

  it('keeps the description honest — the quoted price, not the bare one', () => {
    expect(lines[0].description).toContain(`@ $${lines[0].price}/`)
  })

  it('reports the total from the lines, so header and body cannot disagree', () => {
    expect(quoteTotalFromLines(lines)).toBe(sum)
  })

  it('reconciles even when the split leaves rounding crumbs', () => {
    const odd = estimateDig({
      items: [
        { work_type: 'mass_ex', area_sf: 9137, depth_ft: 1.3, soil_class: 'clay' },
        { work_type: 'haul_off', volume_bcy: 733, soil_class: 'clay' },
      ],
      priceBook: PRICE_BOOK,
      settings: { overhead_percent: 0.115, profit_percent: 0.075, mobilization: 1375 },
    })
    const l = toQuoteLines(odd, { companyId: 3, quoteId: 2 })
    const s = round2ish(l.reduce((a, x) => a + x.line_total, 0))
    expect(s).toBe(round2ish(odd.rollup.total - odd.rollup.tax))
    l.forEach((x) => expect(x.line_total).toBe(round2ish(x.quantity * x.price)))
  })

  it('with no mobilization line, stays within a rounding step and still reads true', () => {
    const noMob = estimateDig({
      items: [{ work_type: 'import_fill', tons: 620, soil_class: 'gravel' }],
      priceBook: PRICE_BOOK,
      settings: { overhead_percent: 0.1, profit_percent: 0.1, mobilization: 0 },
    })
    const l = toQuoteLines(noMob, { companyId: 3, quoteId: 4 })
    l.forEach((x) => expect(x.line_total).toBe(round2ish(x.quantity * x.price)))
    // within one cent of unit price times the quantity
    expect(Math.abs(quoteTotalFromLines(l) - (noMob.rollup.total - noMob.rollup.tax))).toBeLessThanOrEqual(0.01 * 620)
  })

  it('returns nothing for an empty bid rather than a lone mobilization line', () => {
    expect(toQuoteLines(estimateDig({ items: [], priceBook: PRICE_BOOK, settings: { mobilization: 500 } }), { companyId: 3, quoteId: 3 })).toHaveLength(0)
  })
})
