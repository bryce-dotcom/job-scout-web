// Don The Dirt Digger — the excavation estimating engine.
//
// Every number in an excavation bid comes from here. The AI layer reads plans
// and handwriting and proposes QUANTITIES; it never computes a price. Same
// rule as Arnie's config engine: the model proposes, deterministic code
// disposes. An LLM that multiplies is an LLM that will eventually multiply
// wrong, silently, on a $180k bid.
//
// The three things that kill dirt bids, all handled here:
//   1. Volume state — you haul LOOSE yards and get paid for BANK yards.
//      1,000 BCY of stiff clay is 1,350 LCY on the road. Miss it and you
//      under-count trucks by 25%.
//   2. Trench sloping — OSHA requires a protective system below 5 ft. Sloped
//      1.5:1, a 10 ft deep trench holds 4.75x the dirt of a vertical one.
//   3. Truck capacity binds on WEIGHT before volume. A 14 CY tri-axle hauling
//      wet clay at a 16-ton limit is a 10 CY truck.
//
// Vertical-blind by design (see DON_EXCAVATOR_PLAN.md §2.5): a trench, a
// footing over-dig and a building pad are the same prism math with different
// defaults. Verticals are toggles over this engine, not forks of it.

const CF_PER_CY = 27

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000
const num = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

// ─────────────────────────────────────────────────────────────────────────
// Soil
// ─────────────────────────────────────────────────────────────────────────
// Seed values only. They are industry starting points, not gospel — swell
// varies with moisture, and every pit is different. The calibration loop
// (dig_calibration) replaces these with the company's measured numbers once
// there are enough logged jobs, exactly like Zach's effort_factor.
//
// osha_type / max_slope_ratio are the OSHA 1926 Subpart P allowable slopes:
//   Type A 0.75:1 (53°), Type B 1:1 (45°), Type C 1.5:1 (34°).
// bank_density_pcy is pounds per BANK cubic yard.

export const SOIL_PROFILES = {
  topsoil:      { label: 'Topsoil',              swell: 0.30, shrink: 0.10, osha_type: 'C', max_slope_ratio: 1.5,  bank_density_pcy: 2400, difficulty: 0.9 },
  common_earth: { label: 'Common earth / loam',  swell: 0.25, shrink: 0.10, osha_type: 'B', max_slope_ratio: 1.0,  bank_density_pcy: 2800, difficulty: 1.0 },
  sand:         { label: 'Sand',                 swell: 0.12, shrink: 0.08, osha_type: 'C', max_slope_ratio: 1.5,  bank_density_pcy: 2900, difficulty: 0.9 },
  sandy_clay:   { label: 'Sandy clay',           swell: 0.25, shrink: 0.12, osha_type: 'B', max_slope_ratio: 1.0,  bank_density_pcy: 2900, difficulty: 1.05 },
  clay:         { label: 'Clay (stiff)',         swell: 0.35, shrink: 0.15, osha_type: 'B', max_slope_ratio: 1.0,  bank_density_pcy: 3100, difficulty: 1.25 },
  gravel:       { label: 'Gravel / cobble',      swell: 0.15, shrink: 0.08, osha_type: 'C', max_slope_ratio: 1.5,  bank_density_pcy: 3200, difficulty: 1.15 },
  weathered_rock: { label: 'Weathered / rippable rock', swell: 0.40, shrink: 0.05, osha_type: 'A', max_slope_ratio: 0.75, bank_density_pcy: 3600, difficulty: 1.8 },
  rock:         { label: 'Rock (blasted)',       swell: 0.55, shrink: 0.02, osha_type: 'A', max_slope_ratio: 0.75, bank_density_pcy: 4100, difficulty: 2.5 },
}

export const DEFAULT_SOIL = 'common_earth'

export function soilProfile(soilClass, overrides) {
  const base = SOIL_PROFILES[soilClass] || SOIL_PROFILES[DEFAULT_SOIL]
  const custom = overrides?.[soilClass]
  return custom ? { ...base, ...custom } : base
}

// ─────────────────────────────────────────────────────────────────────────
// Volume state conversion — bank / loose / compacted
// ─────────────────────────────────────────────────────────────────────────
// BCY  in-place, undisturbed        ← what you excavate, what plans show
// LCY  after digging, swelled       ← what you HAUL (truck counts live here)
// CCY  after placement + compaction ← what you FILL

export function bankToLoose(bcy, soil) {
  return round2(num(bcy) * (1 + num(soil?.swell)))
}

export function bankToCompacted(bcy, soil) {
  return round2(num(bcy) * (1 - num(soil?.shrink)))
}

export function looseToBank(lcy, soil) {
  const swell = num(soil?.swell)
  return round2(num(lcy) / (1 + swell))
}

// The import question: "the pad calls for 900 CCY of fill — how much do I buy?"
// Answer is never 900. Compacted fill shrinks, so you haul more than you place.
export function compactedToBank(ccy, soil) {
  const shrink = num(soil?.shrink)
  if (shrink >= 1) return 0
  return round2(num(ccy) / (1 - shrink))
}

// Full picture for one bank volume.
export function volumeStates(bcy, soil) {
  const bank = round2(bcy)
  return {
    bcy: bank,
    lcy: bankToLoose(bank, soil),
    ccy: bankToCompacted(bank, soil),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Geometry → bank volume
// ─────────────────────────────────────────────────────────────────────────

// Flat prism: pads, strip-and-stockpile, over-excavation, mass ex where the
// depth is already averaged.
export function prismVolume({ area_sf, depth_ft }) {
  return round2((num(area_sf) * num(depth_ft)) / CF_PER_CY)
}

// Trench. `protection` decides whether the walls stand up or lie down:
//   'shored' / 'box'  → vertical walls, volume = L*W*D
//   'sloped'          → walls laid back at the soil's allowable ratio
//   'none'            → vertical, but illegal at depth; we flag it
//
// The sloped case is average-end-area: the trench is a trapezoid in section,
// bottom_width at the invert widening by slope_ratio*depth on EACH side.
export function trenchVolume({ length_ft, width_ft, depth_ft, protection = 'sloped', soil, slope_ratio }) {
  const L = num(length_ft)
  const W = num(width_ft)
  const D = num(depth_ft)
  if (L <= 0 || W <= 0 || D <= 0) {
    return { bcy: 0, top_width_ft: W, avg_width_ft: W, warnings: [] }
  }

  const warnings = []
  const vertical = protection === 'shored' || protection === 'box' || protection === 'none'
  const ratio = vertical ? 0 : num(slope_ratio, num(soil?.max_slope_ratio, 1))

  const topWidth = W + 2 * ratio * D
  const avgWidth = (W + topWidth) / 2
  const bcy = round2((L * avgWidth * D) / CF_PER_CY)

  // OSHA 1926.652: protective system required at 5 ft; engineered design at 20 ft.
  if (D >= 5 && protection === 'none') {
    warnings.push('OSHA requires a protective system for trenches 5 ft or deeper — priced with vertical walls and no shoring.')
  }
  if (D >= 20) {
    warnings.push('Trenches 20 ft or deeper require a protective system designed by a registered professional engineer.')
  }

  return {
    bcy,
    top_width_ft: round2(topWidth),
    avg_width_ft: round2(avgWidth),
    slope_ratio: ratio,
    warnings,
  }
}

// Footings / foundations / basements — perimeter run with working room on
// each side so a person and a form can fit.
export function footingVolume({ perimeter_ft, width_ft, depth_ft, overdig_each_side_ft = 2 }) {
  const w = num(width_ft) + 2 * num(overdig_each_side_ft)
  return round2((num(perimeter_ft) * w * num(depth_ft)) / CF_PER_CY)
}

// Pond / basin / detention — average-end-area between a top and bottom area.
export function basinVolume({ top_area_sf, bottom_area_sf, depth_ft }) {
  const avg = (num(top_area_sf) + num(bottom_area_sf)) / 2
  return round2((avg * num(depth_ft)) / CF_PER_CY)
}

// Net spoil: what actually leaves the site. Pipe, bedding and structures
// displace native soil, so the haul-off is MORE than "excavation minus
// backfill" looks at first glance. All arguments in bank CY except
// displaced_cy which is a physical in-place volume.
export function netSpoil({ excavated_bcy, backfill_ccy = 0, displaced_cy = 0, soil }) {
  const excavated = num(excavated_bcy)
  // Backfill placed compacted consumes this much bank material.
  const backfillAsBank = compactedToBank(num(backfill_ccy), soil)
  const reusable = Math.max(0, Math.min(excavated, backfillAsBank))
  const spoilBank = Math.max(0, excavated - reusable + num(displaced_cy))
  const importBank = Math.max(0, backfillAsBank - excavated)
  return {
    spoil_bcy: round2(spoilBank),
    spoil_lcy: bankToLoose(spoilBank, soil),
    import_bcy: round2(importBank),
    reused_bcy: round2(reusable),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Trucking
// ─────────────────────────────────────────────────────────────────────────

export const TRUCK_TYPES = {
  tandem:    { label: 'Tandem dump',     volumetric_cy: 11, payload_tons: 12 },
  tri_axle:  { label: 'Tri-axle dump',   volumetric_cy: 15, payload_tons: 16 },
  quad:      { label: 'Quad-axle dump',  volumetric_cy: 19, payload_tons: 20 },
  end_dump:  { label: 'Semi end dump',   volumetric_cy: 24, payload_tons: 25 },
  belly_dump:{ label: 'Belly dump',      volumetric_cy: 24, payload_tons: 25 },
}

// Loose density: bank material spread out over a bigger volume.
export function looseDensityTonPerLcy(soil) {
  const bankPcy = num(soil?.bank_density_pcy, 2800)
  const swell = num(soil?.swell)
  return round3(bankPcy / (1 + swell) / 2000)
}

// The capacity that actually applies — volume or weight, whichever binds
// first. This is where volume-only math under-counts loads by ~30% on wet
// clay and quietly eats the job's profit.
export function effectiveTruckCapacity({ truck, soil }) {
  const t = typeof truck === 'string' ? TRUCK_TYPES[truck] : truck
  const spec = t || TRUCK_TYPES.tri_axle
  const byVolume = num(spec.volumetric_cy)
  const density = looseDensityTonPerLcy(soil)
  const byWeight = density > 0 ? num(spec.payload_tons) / density : byVolume
  const effective = Math.min(byVolume, byWeight)
  return {
    label: spec.label,
    volumetric_cy: round2(byVolume),
    weight_limited_cy: round2(byWeight),
    effective_cy: round2(effective),
    bound_by: byWeight < byVolume ? 'weight' : 'volume',
    loose_density_ton_per_lcy: density,
  }
}

export function haulLoads({ lcy, truck, soil }) {
  const cap = effectiveTruckCapacity({ truck, soil })
  const loads = cap.effective_cy > 0 ? Math.ceil(num(lcy) / cap.effective_cy) : 0
  return { ...cap, lcy: round2(lcy), loads, tons: round2(num(lcy) * cap.loose_density_ton_per_lcy) }
}

// Round trip in minutes, and how many trucks it takes to keep the hoe loading
// without ever waiting on an empty.
export function haulCycle({ round_trip_miles, avg_speed_mph = 30, load_minutes = 5, dump_minutes = 3, queue_minutes = 2 }) {
  const travel = num(avg_speed_mph) > 0 ? (num(round_trip_miles) / num(avg_speed_mph)) * 60 : 0
  const cycle = travel + num(load_minutes) + num(dump_minutes) + num(queue_minutes)
  const trucksNeeded = num(load_minutes) > 0 ? Math.ceil(cycle / num(load_minutes)) : 1
  return { cycle_minutes: round2(cycle), travel_minutes: round2(travel), trucks_to_sustain: trucksNeeded }
}

// ─────────────────────────────────────────────────────────────────────────
// Production → machine hours
// ─────────────────────────────────────────────────────────────────────────
// Seed rates in BCY/hr under decent conditions. Like the soil table these are
// starting points; dig_calibration overwrites them per company per work type
// once actuals exist.

export const EQUIPMENT = {
  mini_ex:   { label: 'Mini excavator (3-5t)', trench: 20,  mass: 15,  hourly_rate: 95 },
  ex_160:    { label: '160-class excavator',   trench: 45,  mass: 75,  hourly_rate: 165 },
  ex_320:    { label: '320-class excavator',   trench: 70,  mass: 105, hourly_rate: 205 },
  dozer_d6:  { label: 'D6 dozer',              trench: 0,   mass: 190, hourly_rate: 195 },
  skid_steer:{ label: 'Skid steer',            trench: 12,  mass: 45,  hourly_rate: 85 },
  backhoe:   { label: 'Backhoe',               trench: 25,  mass: 30,  hourly_rate: 110 },
}

// The 50-minute hour is the standard planning assumption: nobody digs 60
// minutes out of 60. The rest stack on top of it.
export const EFFICIENCY = {
  base_50_minute_hour: 0.83,
  congested_site: 0.75,
  new_operator: 0.85,
  long_haul_penalty: 0.9,
}

export function machineHours({
  volume_bcy,
  equipment,
  activity = 'mass',
  soil,
  efficiency = EFFICIENCY.base_50_minute_hour,
  operator_factor = 1,
  site_factor = 1,
  calibration_factor = 1,
}) {
  const eq = typeof equipment === 'string' ? EQUIPMENT[equipment] : equipment
  const spec = eq || EQUIPMENT.ex_160
  const baseRate = num(spec[activity], num(spec.mass))
  if (baseRate <= 0) return { hours: 0, effective_rate_bcy_hr: 0, equipment: spec.label }

  const difficulty = num(soil?.difficulty, 1) || 1
  // Difficulty divides: harder dirt means fewer yards per hour.
  const effectiveRate = (baseRate * num(efficiency, 1) * num(operator_factor, 1) * num(site_factor, 1)) / difficulty
  const hours = effectiveRate > 0 ? (num(volume_bcy) / effectiveRate) * num(calibration_factor, 1) : 0

  return {
    equipment: spec.label,
    hours: round2(hours),
    effective_rate_bcy_hr: round2(effectiveRate),
    hourly_rate: num(spec.hourly_rate),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Calibration — the ground-truth loop
// ─────────────────────────────────────────────────────────────────────────
// Estimated 42 hours, job logged 51 → factor 1.21, and the next bid on that
// soil class prices accordingly. Needs 3 samples before it applies, same
// threshold Zach's mow learning loop uses, because two bad weather days
// should not reprice the whole book.

export const MIN_CALIBRATION_SAMPLES = 3

export function computeCalibrationFactor(history, { minSamples = MIN_CALIBRATION_SAMPLES, clamp = 2.0 } = {}) {
  const usable = (history || []).filter(
    (h) => num(h.estimated_hours) > 0 && num(h.actual_hours) > 0
  )
  if (usable.length < minSamples) {
    return { factor: 1, sample_n: usable.length, applied: false }
  }
  const totalEst = usable.reduce((s, h) => s + num(h.estimated_hours), 0)
  const totalAct = usable.reduce((s, h) => s + num(h.actual_hours), 0)
  const raw = totalEst > 0 ? totalAct / totalEst : 1
  // Clamp so one catastrophic job (broke down, hit rock, sat in mud for a
  // week) cannot triple every future bid.
  const factor = Math.min(clamp, Math.max(1 / clamp, raw))
  return { factor: round3(factor), sample_n: usable.length, applied: true, raw: round3(raw) }
}

// ─────────────────────────────────────────────────────────────────────────
// One takeoff item → quantities
// ─────────────────────────────────────────────────────────────────────────
// A takeoff item is the atomic unit: a stretch of trench, a pad, a footing
// run, a haul-off, an import. This resolves its geometry into bank/loose/
// compacted volumes, loads and machine hours, and carries the provenance
// through untouched — source, source_ref and confidence never get computed
// away, because "where did this number come from" is the whole trust story.

export const WORK_TYPES = {
  strip_topsoil:  { label: 'Strip topsoil',        geometry: 'prism',   vertical: 'sitework',   activity: 'mass',   uom: 'CY' },
  mass_ex:        { label: 'Mass excavation',      geometry: 'prism',   vertical: 'sitework',   activity: 'mass',   uom: 'CY' },
  overex:         { label: 'Over-excavate unsuitable', geometry: 'prism', vertical: 'sitework', activity: 'mass',   uom: 'CY' },
  fine_grade:     { label: 'Fine grade',           geometry: 'area',    vertical: 'sitework',   activity: 'mass',   uom: 'SF' },
  trench:         { label: 'Trench',               geometry: 'trench',  vertical: 'trenching',  activity: 'trench', uom: 'LF' },
  bedding:        { label: 'Pipe bedding',         geometry: 'prism',   vertical: 'trenching',  activity: 'trench', uom: 'CY' },
  footing:        { label: 'Footing excavation',   geometry: 'footing', vertical: 'foundation', activity: 'trench', uom: 'CY' },
  basement:       { label: 'Basement / cellar',    geometry: 'prism',   vertical: 'foundation', activity: 'mass',   uom: 'CY' },
  septic_tank:    { label: 'Septic tank excavation', geometry: 'prism', vertical: 'foundation', activity: 'mass',   uom: 'EA' },
  leach_field:    { label: 'Leach field',          geometry: 'trench',  vertical: 'foundation', activity: 'trench', uom: 'LF' },
  basin:          { label: 'Pond / detention basin', geometry: 'basin', vertical: 'sitework',   activity: 'mass',   uom: 'CY' },
  backfill:       { label: 'Backfill + compact',   geometry: 'prism',   vertical: 'trenching',  activity: 'mass',   uom: 'CY' },
  haul_off:       { label: 'Haul off',             geometry: 'volume',  vertical: 'sitework',   activity: 'mass',   uom: 'LOAD' },
  import_fill:    { label: 'Import structural fill', geometry: 'volume', vertical: 'sitework',  activity: 'mass',   uom: 'TON' },
  road_base:      { label: 'Road base / gravel',   geometry: 'prism',   vertical: 'sitework',   activity: 'mass',   uom: 'TON' },
}

export function verticalsForWorkTypes(enabled) {
  const on = Object.entries(enabled || {}).filter(([, v]) => v).map(([k]) => k)
  return Object.entries(WORK_TYPES)
    .filter(([, wt]) => on.length === 0 || on.includes(wt.vertical))
    .map(([key, wt]) => ({ key, ...wt }))
}

export function quantifyItem(item, ctx = {}) {
  const soil = soilProfile(item.soil_class || ctx.default_soil || DEFAULT_SOIL, ctx.soil_overrides)
  const spec = WORK_TYPES[item.work_type] || WORK_TYPES.mass_ex
  const warnings = []
  let bcy = 0
  let geometry = {}

  switch (spec.geometry) {
    case 'trench': {
      const t = trenchVolume({
        length_ft: item.length_ft,
        width_ft: item.width_ft,
        depth_ft: item.depth_ft,
        protection: item.protection || 'sloped',
        soil,
        slope_ratio: item.slope_ratio,
      })
      bcy = t.bcy
      geometry = { top_width_ft: t.top_width_ft, avg_width_ft: t.avg_width_ft, slope_ratio: t.slope_ratio }
      warnings.push(...t.warnings)
      break
    }
    case 'footing':
      bcy = footingVolume({
        perimeter_ft: item.perimeter_ft || item.length_ft,
        width_ft: item.width_ft,
        depth_ft: item.depth_ft,
        overdig_each_side_ft: item.overdig_each_side_ft ?? ctx.default_overdig_ft ?? 2,
      })
      break
    case 'basin':
      bcy = basinVolume({ top_area_sf: item.top_area_sf, bottom_area_sf: item.bottom_area_sf, depth_ft: item.depth_ft })
      break
    case 'area':
      bcy = 0 // priced by SF, no excavation volume
      break
    case 'volume':
      bcy = num(item.volume_bcy)
      break
    case 'prism':
    default:
      bcy = prismVolume({ area_sf: item.area_sf, depth_ft: item.depth_ft })
      break
  }

  const states = volumeStates(bcy, soil)
  const truck = item.truck || ctx.default_truck || 'tri_axle'
  const haul = spec.uom === 'SF' ? null : haulLoads({ lcy: states.lcy, truck, soil })

  // Stated beats derived. A delivery ticket says 40 tons of base and a note
  // says 14 loads to the pit; those are measured facts, and recomputing them
  // from a volume nobody entered gives zero. Before this, "40 ton base for
  // drive" read off a field note priced at $0 — the quantity was there, the
  // engine just never looked at it.
  const statedTons = num(item.tons)
  const statedLoads = num(item.loads)

  const calFactor = ctx.calibration?.[item.work_type]?.factor ?? ctx.calibration?.[soil.label]?.factor ?? 1
  const equipment = item.equipment || ctx.default_equipment || 'ex_160'
  const hours = machineHours({
    volume_bcy: states.bcy,
    equipment,
    activity: spec.activity,
    soil,
    efficiency: ctx.efficiency ?? EFFICIENCY.base_50_minute_hour,
    operator_factor: ctx.operator_factor ?? 1,
    site_factor: ctx.site_factor ?? 1,
    calibration_factor: calFactor,
  })

  return {
    ...item,
    work_type: item.work_type,
    label: item.label || spec.label,
    uom: item.uom || spec.uom,
    soil_class: item.soil_class || ctx.default_soil || DEFAULT_SOIL,
    soil_label: soil.label,
    geometry,
    volume_bcy: states.bcy,
    volume_lcy: states.lcy,
    volume_ccy: states.ccy,
    loads: statedLoads > 0 ? statedLoads : (haul?.loads ?? 0),
    tons: statedTons > 0 ? statedTons : (haul?.tons ?? 0),
    loads_stated: statedLoads > 0,
    tons_stated: statedTons > 0,
    truck_bound_by: haul?.bound_by ?? null,
    truck_effective_cy: haul?.effective_cy ?? null,
    machine_hours: hours.hours,
    equipment_label: hours.equipment,
    calibration_factor: calFactor,
    warnings,
    // Provenance rides through untouched.
    source: item.source || 'manual',
    source_ref: item.source_ref || null,
    confidence: item.confidence ?? null,
    confirmed_by: item.confirmed_by ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Pricing → bid items
// ─────────────────────────────────────────────────────────────────────────
// Unit-price first. Excavation is bid per unit with quantity allowances
// because the dirt lies; lump sum is a rollup of the schedule, never the
// other way round.

// How a price-book row bills: by the quantity in that unit, or by the hour.
function billableQuantity(item, rate) {
  const uom = (rate?.uom || item.uom || 'CY').toUpperCase()
  switch (uom) {
    case 'CY':   return item.volume_bcy
    case 'LCY':  return item.volume_lcy
    case 'CCY':  return item.volume_ccy
    case 'LF':   return num(item.length_ft || item.perimeter_ft)
    case 'SF':   return num(item.area_sf)
    case 'TON':  return item.tons
    case 'LOAD': return item.loads
    case 'HR':   return item.machine_hours
    case 'DAY':  return Math.ceil(num(item.machine_hours) / num(rate?.hours_per_day, 8))
    case 'EA':   return num(item.count, 1)
    default:     return item.volume_bcy
  }
}

export function priceItem(quantified, priceBook = [], ctx = {}) {
  const rate =
    priceBook.find((r) => r.code && r.code === quantified.rate_code) ||
    priceBook.find((r) => r.work_type === quantified.work_type) ||
    null

  const qty = round2(billableQuantity(quantified, rate))

  if (!rate) {
    // No price-book row: still surface the quantity so the bid is auditable
    // and the gap is obvious, rather than silently pricing it at zero.
    return {
      ...quantified,
      rate_code: null,
      unit_price: 0,
      quantity: qty,
      extension: 0,
      kind: 'labor',
      unpriced: true,
      warnings: [...(quantified.warnings || []), 'No price-book item matched — set a unit price for this work type.'],
    }
  }

  const unitPrice = num(rate.unit_price)
  const extension = round2(qty * unitPrice)
  const cost = round2(qty * num(rate.cost))
  const minCharge = num(rate.min_charge)
  const charged = minCharge > 0 ? Math.max(extension, minCharge) : extension

  return {
    ...quantified,
    rate_code: rate.code || null,
    label: rate.label || quantified.label,
    uom: (rate.uom || quantified.uom || 'CY').toUpperCase(),
    unit_price: round2(unitPrice),
    quantity: qty,
    extension: round2(charged),
    min_charge_applied: minCharge > 0 && charged > extension,
    cost,
    margin: round2(charged - cost),
    // kind feeds resolveMatLabSplit downstream — get it wrong and the
    // in-scope/out-of-scope invoice view breaks. Material for anything
    // bought by the ton, labor for anything done by a machine.
    kind: rate.kind || (['TON', 'EA'].includes((rate.uom || '').toUpperCase()) ? 'materials' : 'labor'),
    unpriced: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// The whole bid
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_BID_SETTINGS = {
  overhead_percent: 0.10,
  profit_percent: 0.10,
  mobilization: 0,
  tax_rate: 0,
  confidence_threshold: 0.7,
}

export function estimateDig({ items = [], priceBook = [], settings = {}, ctx = {} } = {}) {
  const s = { ...DEFAULT_BID_SETTINGS, ...(settings || {}) }

  const quantified = items.map((it) => quantifyItem(it, ctx))
  const bidItems = quantified.map((q) => priceItem(q, priceBook, ctx))

  const directCost = round2(bidItems.reduce((sum, b) => sum + num(b.cost), 0))
  const subtotal = round2(bidItems.reduce((sum, b) => sum + num(b.extension), 0))
  const mobilization = round2(num(s.mobilization))
  const preMarkup = round2(subtotal + mobilization)
  const overhead = round2(preMarkup * num(s.overhead_percent))
  const profit = round2((preMarkup + overhead) * num(s.profit_percent))
  const preTax = round2(preMarkup + overhead + profit)
  const tax = round2(preTax * num(s.tax_rate))
  const total = round2(preTax + tax)

  const volumes = quantified.reduce(
    (acc, q) => ({
      bcy: round2(acc.bcy + num(q.volume_bcy)),
      lcy: round2(acc.lcy + num(q.volume_lcy)),
      ccy: round2(acc.ccy + num(q.volume_ccy)),
    }),
    { bcy: 0, lcy: 0, ccy: 0 }
  )
  const loads = quantified.reduce((sum, q) => sum + num(q.loads), 0)
  const machine_hours = round2(quantified.reduce((sum, q) => sum + num(q.machine_hours), 0))

  // Everything the bid is standing on. This becomes the qualifications and
  // exclusions page of the proposal, which is how excavators keep a surprise
  // from becoming their problem.
  const assumptions = []
  const soilsUsed = [...new Set(quantified.map((q) => q.soil_label))]
  if (soilsUsed.length) assumptions.push(`Priced for ${soilsUsed.join(', ')}. Rock, unsuitable soils and groundwater are excluded and billed at the unit prices listed.`)
  const sloped = quantified.filter((q) => q.geometry?.slope_ratio > 0)
  if (sloped.length) assumptions.push(`Trench walls priced sloped per OSHA allowable ratios. Pricing with a trench box instead would reduce excavated volume.`)
  const truckBound = quantified.find((q) => q.truck_bound_by === 'weight')
  if (truckBound) assumptions.push(`Haul quantities are weight-limited at ${truckBound.truck_effective_cy} CY per load, not truck box volume.`)
  if (mobilization > 0) assumptions.push(`Includes one mobilization. Additional moves billed separately.`)

  const unpriced = bidItems.filter((b) => b.unpriced)
  const lowConfidence = quantified.filter(
    (q) => q.confidence != null && q.confidence < num(s.confidence_threshold) && !q.confirmed_by
  )
  const warnings = quantified.flatMap((q) => (q.warnings || []).map((w) => ({ item: q.label, warning: w })))

  return {
    bidItems,
    rollup: {
      direct_cost: directCost,
      subtotal,
      mobilization,
      overhead,
      profit,
      tax,
      total,
      margin: round2(total - directCost),
      margin_percent: total > 0 ? round3((total - directCost) / total) : 0,
    },
    volumes,
    loads,
    machine_hours,
    assumptions,
    warnings,
    unpriced_count: unpriced.length,
    low_confidence_count: lowConfidence.length,
    // A bid with unconfirmed AI guesses in it is not ready to send. The UI
    // gates the send button on this, it is not merely advisory.
    ready_to_send: unpriced.length === 0 && lowConfidence.length === 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Quote handoff
// ─────────────────────────────────────────────────────────────────────────
// Shapes bid items into quote_lines rows. Mirrors Zach's EstimateModal so
// excavation bids land in the same pipeline as everything else. Nothing here
// invents a second money path — the existing invoice machinery takes over
// from quote_lines onward.

// Overhead and profit have to ride INSIDE the unit prices, not sit beside
// them. Two reasons, and both are load-bearing:
//
//   1. The estimate page totals a quote by summing its lines. Send bare cost
//      lines and the customer document reads $115,765 for a bid Don computed
//      at $140,076 — the markup silently evaporates between the takeoff and
//      the thing you hand over.
//   2. No contractor shows a customer "your overhead: $11,577". A bid is
//      $12.35 a yard. The breakdown is Don's business, and it stays on the
//      takeoff screen where it belongs.
//
// Mobilization becomes its own line, because it is one on a real bid form.
// The last line absorbs the rounding crumbs so the lines sum to the bid
// exactly rather than nearly.
export function toQuoteLines(result, { companyId, quoteId }) {
  const items = result?.bidItems || []
  if (!items.length) return []

  const r = result.rollup || {}
  const subtotal = num(r.subtotal)
  const mobilization = num(r.mobilization)
  const preMarkup = subtotal + mobilization
  // What the lines must add up to: everything except tax, which the estimate
  // page applies itself.
  const target = round2(num(r.total) - num(r.tax))
  const markup = preMarkup > 0 ? target / preMarkup : 1

  const rows = items.map((b, i) => {
    const price = round2(num(b.unit_price) * markup)
    const qty = num(b.quantity)
    return {
      company_id: companyId,
      quote_id: quoteId,
      item_name: b.label,
      description: [
        `${qty} ${b.uom} @ $${price}/${b.uom}`,
        b.volume_bcy ? `${b.volume_bcy} BCY / ${b.volume_lcy} LCY${b.loads ? ` · ${b.loads} loads` : ''}` : null,
        b.soil_label,
        b.geometry?.slope_ratio > 0 ? `sloped ${b.geometry.slope_ratio}:1` : null,
      ].filter(Boolean).join(' · '),
      quantity: qty,
      price,
      line_total: round2(qty * price),
      unit_of_measure: b.uom,
      kind: b.kind,
      in_utility_scope: false,
      sort_order: i,
    }
  })

  if (mobilization > 0) {
    const price = round2(mobilization * markup)
    rows.push({
      company_id: companyId,
      quote_id: quoteId,
      item_name: 'Mobilization',
      description: 'Equipment delivery and return, one move',
      quantity: 1,
      price,
      line_total: price,
      unit_of_measure: 'EA',
      kind: 'labor',
      in_utility_scope: false,
      sort_order: rows.length,
    })
  }

  // The invariant a customer can check with a calculator: quantity times unit
  // price equals the line total, on every line. That is never fudged.
  //
  // Which means exact reconciliation to the internal total is not always
  // reachable — a 2-decimal unit price against 620 tons moves in $6.20 steps.
  // Real bid forms live with that. Where there IS a mobilization line it takes
  // the difference, because its quantity is 1 and the arithmetic stays honest;
  // otherwise the quote is worth what its lines say, and the caller reads the
  // total back off them rather than assuming.
  const mob = mobilization > 0 ? rows[rows.length - 1] : null
  if (mob) {
    const others = round2(rows.slice(0, -1).reduce((s, x) => s + x.line_total, 0))
    const owed = round2(target - others)
    if (owed > 0) {
      mob.price = owed
      mob.line_total = owed
    }
  }

  return rows
}

// What the quote is actually worth: the sum of the lines a customer will read,
// not the internal figure they were derived from. Push this to
// quotes.quote_amount so the header and the line items cannot disagree.
export function quoteTotalFromLines(lines) {
  return round2((lines || []).reduce((s, l) => s + num(l.line_total), 0))
}
