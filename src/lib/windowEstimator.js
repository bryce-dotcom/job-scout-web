// Walter The Window Wizard — the glass estimating engine.
//
// Every number in a Walter bid comes from here. The AI layer reads building
// photos and proposes QUANTITIES — how many panes, how many damage zones, how
// bad each one looks. It never computes a price. Same rule as Don's dig
// engine and Arnie's config engine: the model proposes, deterministic code
// disposes. An LLM that multiplies is an LLM that will eventually multiply
// wrong, silently, on a $26,500 bid.
//
// ── Two verticals, one engine ────────────────────────────────────────────
//
// Walter sells window CLEANING and glass RESTORATION. They look like separate
// trades and they are not: both are "reach some glass, spend minutes on each
// unit of it, bill the hours". Cleaning counts panes, restoration counts
// damage zones; after that the arithmetic is identical. So, in digEstimator's
// words, the verticals are toggles over this engine, not forks of it.
//
// That is not a tidiness argument, it is the business case. AGR's UGR Eden
// bid priced "removal of construction residue" at $4,950 as its own package,
// subbed to a glass specialist. Removing stucco, paint, labels and adhesive
// from glass IS post-construction window cleaning — the thing HHH Building
// Services already does with its own crew. Modelling it as a separate trade
// would have hidden that, and the margin with it. Here it is one work type on
// the cleaning side with a `post_construction` condition, which is what it
// actually is.
//
// ── What the seed numbers are ────────────────────────────────────────────
//
// Starting points, not gospel, exactly like Don's SOIL_PROFILES. Minutes per
// pane and per zone vary by building, crew and glass. Every one of them is
// overridable per company, and once a company has finished jobs with logged
// hours, computeCalibrationFactor replaces them with its own measured number.
// Nothing here is HHH's or AGR's price: this ships to every tenant.

import { intakeLineRows } from './estimateIntake'

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000
const num = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

// ─────────────────────────────────────────────────────────────────────────
// Reaching the glass
// ─────────────────────────────────────────────────────────────────────────
// Applies to BOTH verticals — a scratch 40 feet up costs the same to polish
// as one at waist height, and takes a lift either way. `equipment_day` is the
// rental that gets passed through; `factor` multiplies working minutes.

export const ACCESS_PROFILES = {
  ground:    { label: 'Ground level',        factor: 1.00, equipment_day: 0,   needs_equipment: false },
  pole:      { label: 'Water-fed pole',      factor: 1.15, equipment_day: 0,   needs_equipment: false },
  ladder:    { label: 'Ladder',              factor: 1.45, equipment_day: 0,   needs_equipment: false },
  lift:      { label: 'Boom / scissor lift', factor: 1.70, equipment_day: 450, needs_equipment: true },
  scaffold:  { label: 'Scaffold',            factor: 1.80, equipment_day: 650, needs_equipment: true },
  rope:      { label: 'Rope descent',        factor: 2.10, equipment_day: 0,   needs_equipment: false },
}
export const DEFAULT_ACCESS = 'ground'

export function accessProfile(access, overrides) {
  const base = ACCESS_PROFILES[access] || ACCESS_PROFILES[DEFAULT_ACCESS]
  return { ...base, ...(overrides || {}) }
}

// ─────────────────────────────────────────────────────────────────────────
// Cleaning: what is on the glass
// ─────────────────────────────────────────────────────────────────────────
// The single biggest driver of a cleaning bid, and the one most often got
// wrong — a first clean after construction is not a maintenance clean with a
// bigger number on it. Stucco, mortar, paint overspray, label adhesive and
// weld spatter are scraped, not wiped.

export const CONDITION_PROFILES = {
  maintenance:       { label: 'Maintenance / recurring',   factor: 1.00 },
  first_clean:       { label: 'First clean (dirty)',       factor: 1.60 },
  post_construction: { label: 'Post-construction residue', factor: 2.80 },
  neglected:         { label: 'Neglected / hard water',    factor: 3.40 },
}
export const DEFAULT_CONDITION = 'maintenance'

// ─────────────────────────────────────────────────────────────────────────
// Restoration: how bad the mark is
// ─────────────────────────────────────────────────────────────────────────
// AGR's severity ladder, because it is a good one and the industry reads it.
//
// L0 is the one that earns its keep. "Probably residue — try cleaning first"
// is a restoration item that should never be restored: it belongs on the
// cleaning side at a fraction of the price. An engine that silently resurfaces
// every L0 overcharges the customer and burns tech days on work a rag would
// have done. So L0 carries zero restoration minutes by design, and
// splitBySeverity routes it to cleaning instead.

export const SEVERITY_PROFILES = {
  L0: { label: 'L0 — probably residue',          minutes_per_zone: 0,  restorable: false, route: 'cleaning' },
  L1: { label: 'L1 — light abrasion',            minutes_per_zone: 22, restorable: true,  route: 'restoration' },
  L2: { label: 'L2 — deep, or close to an edge', minutes_per_zone: 55, restorable: true,  route: 'restoration' },
}

// Edge work is slower and riskier: polishing tempered glass near its edge can
// weaken the pane, so it is done carefully or not at all. A multiplier, not a
// severity of its own, because an edge mark can be light or deep.
export const EDGE_FACTOR = 1.45

// Not every mark can be fixed. A coating on the room side (i89, Neat) cannot
// be abraded without destroying it, and a defect that came from the factory is
// a warranty claim, not a restoration line.
export const NOT_RESTORABLE = ['coated_surface', 'factory_defect', 'through_crack']

// ─────────────────────────────────────────────────────────────────────────
// Counting what is actually there
// ─────────────────────────────────────────────────────────────────────────
// The rule that keeps a bid honest, and the one a photo-reading AI will break
// first. AGR's register logged 68 marks across 23 photo groups — because the
// same scratch was photographed from several angles. Those are 23 zones to
// restore, not 68. Bidding 68 would have roughly tripled the tech days.
//
// A zone is counted when it is restorable and is not a duplicate of another
// zone. `duplicate_of` carries the id of the zone it repeats.

export function countableZones(items) {
  const list = Array.isArray(items) ? items : []
  const seen = new Set()
  const out = []
  for (const z of list) {
    if (z?.duplicate_of) continue
    if (z?.not_restorable_reason) continue
    const id = z?.id ?? z?.code
    if (id != null) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    out.push(z)
  }
  return out
}

/** Marks that will NOT be restored, with why — a bid has to say so out loud. */
export function excludedZones(items) {
  return (Array.isArray(items) ? items : []).filter(
    (z) => z?.duplicate_of || z?.not_restorable_reason || SEVERITY_PROFILES[z?.severity]?.restorable === false,
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Minutes
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cleaning minutes for a run of panes.
 *
 * `faces` is how many sides get cleaned: 2 for inside and out, 1 when only the
 * exterior is in scope. Tracks, frames and screens are separate line items and
 * separate minutes — they are the most commonly forgotten part of a bid.
 */
export function cleaningMinutes({
  panes,
  faces = 2,
  condition = DEFAULT_CONDITION,
  access = DEFAULT_ACCESS,
  minutes_per_pane_face = 3.5,
  tracks = 0,
  minutes_per_track = 2.5,
  screens = 0,
  minutes_per_screen = 2.0,
  effort_factor = 1,
}) {
  const cond = CONDITION_PROFILES[condition] || CONDITION_PROFILES[DEFAULT_CONDITION]
  const acc = accessProfile(access)
  const glass = num(panes) * Math.max(0, num(faces, 2)) * num(minutes_per_pane_face)
  const extras = num(tracks) * num(minutes_per_track) + num(screens) * num(minutes_per_screen)
  // Access and condition multiply the glass work. Tracks and screens are
  // reached the same way, so access applies to them too; condition does not —
  // a dirty track is a dirty track whatever is on the glass.
  const minutes = (glass * cond.factor + extras) * acc.factor * (num(effort_factor, 1) || 1)
  return round2(minutes)
}

/**
 * Restoration minutes for a damage register.
 *
 * Setup is per FACE, not per zone: a tech sets up on the inside of a pane
 * once and works every mark on that face. Counting setup per zone is how a
 * 23-zone job turns into a fictional 5 extra days.
 */
export function restorationMinutes({
  zones,
  access = DEFAULT_ACCESS,
  severity_profiles = SEVERITY_PROFILES,
  edge_factor = EDGE_FACTOR,
  setup_minutes_per_face = 18,
  effort_factor = 1,
}) {
  const counted = countableZones(zones)
  const acc = accessProfile(access)
  let work = 0
  const faces = new Set()
  for (const z of counted) {
    const prof = severity_profiles[z?.severity] || severity_profiles.L1
    let m = num(prof?.minutes_per_zone)
    if (z?.edge) m *= num(edge_factor, 1) || 1
    // A marked zone bigger than the default assumption scales with its area.
    if (num(z?.zone_scale) > 0) m *= num(z.zone_scale)
    work += m
    const faceKey = `${z?.lite_id ?? z?.location ?? ''}|${z?.face ?? ''}`
    faces.add(faceKey)
  }
  const setup = faces.size * num(setup_minutes_per_face)
  const minutes = (work + setup) * acc.factor * (num(effort_factor, 1) || 1)
  return round2(minutes)
}

/** L0 marks are cleaning work, not restoration. Split them before pricing. */
export function splitBySeverity(zones) {
  const counted = countableZones(zones)
  const cleaning = counted.filter((z) => SEVERITY_PROFILES[z?.severity]?.route === 'cleaning')
  const restoration = counted.filter((z) => SEVERITY_PROFILES[z?.severity]?.route !== 'cleaning')
  return { cleaning, restoration }
}

// ─────────────────────────────────────────────────────────────────────────
// Days, and the sub
// ─────────────────────────────────────────────────────────────────────────
// Restoration is normally subbed to a glass tech. You buy their DAYS, not
// their minutes: nobody bills half a mobilisation. So minutes round up to
// whole working days before any rate is applied, which is also why a bid
// moves in steps rather than smoothly.

export function techDays(minutes, { productive_minutes_per_day = 390 } = {}) {
  const per = Math.max(1, num(productive_minutes_per_day, 390))
  const exact = num(minutes) / per
  return { exact: round3(exact), billable: Math.max(exact > 0 ? 1 : 0, Math.ceil(exact - 0.001)) }
}

export function crewHours(minutes) {
  return round2(num(minutes) / 60)
}

// ─────────────────────────────────────────────────────────────────────────
// Three tiers
// ─────────────────────────────────────────────────────────────────────────
// Glass bids are quoted as a range and said to be a range, because what is
// under the residue is not known until someone stands there with a test patch.
// AGR put it plainly: favourable / expected / difficult, "not a per-scratch,
// per-pane or per-square-foot price".
//
// The tiers are a spread around the EXPECTED number, never a markup on top of
// it: the middle tier is the bid, and the quote amount is set from it.

export const DEFAULT_TIER_SPREAD = { favourable: 0.78, expected: 1.00, difficult: 1.37 }

export function threeTiers(expected, spread = DEFAULT_TIER_SPREAD) {
  const s = { ...DEFAULT_TIER_SPREAD, ...(spread || {}) }
  return {
    favourable: round2(num(expected) * num(s.favourable, 1)),
    expected: round2(num(expected)),
    difficult: round2(num(expected) * num(s.difficult, 1)),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Learning from finished jobs
// ─────────────────────────────────────────────────────────────────────────
// Same shape as Don's calibration and Zach's effort_factor: once there are
// enough finished jobs with logged hours, the company's own measured ratio
// replaces the seed minutes. Clamped, so one job where the glass turned out to
// be coated and nothing could be polished does not triple every future bid.

export const MIN_CALIBRATION_SAMPLES = 3

export function computeCalibrationFactor(history, { minSamples = MIN_CALIBRATION_SAMPLES, clamp = 2.0 } = {}) {
  const usable = (history || []).filter(
    (h) => num(h.estimated_minutes) > 0 && num(h.actual_minutes) > 0,
  )
  if (usable.length < minSamples) return { factor: 1, sample_n: usable.length, applied: false }
  const totalEst = usable.reduce((s, h) => s + num(h.estimated_minutes), 0)
  const totalAct = usable.reduce((s, h) => s + num(h.actual_minutes), 0)
  const raw = totalEst > 0 ? totalAct / totalEst : 1
  const factor = Math.min(clamp, Math.max(1 / clamp, raw))
  return { factor: round3(factor), sample_n: usable.length, applied: true, raw: round3(raw) }
}

// ─────────────────────────────────────────────────────────────────────────
// The bid
// ─────────────────────────────────────────────────────────────────────────

export const WORK_TYPES = {
  assessment:     { label: 'Glass assessment and test areas', vertical: 'both',        uom: 'EA',  kind: 'labor' },
  clean:          { label: 'Window cleaning',                 vertical: 'cleaning',    uom: 'HR',  kind: 'labor' },
  residue:        { label: 'Construction residue removal',    vertical: 'cleaning',    uom: 'HR',  kind: 'labor' },
  resurface:      { label: 'Scratch resurfacing',             vertical: 'restoration', uom: 'DAY', kind: 'labor' },
  optical_finish: { label: 'Optical finishing and QC',        vertical: 'restoration', uom: 'DAY', kind: 'labor' },
  mobilization:   { label: 'Mobilization',                    vertical: 'both',        uom: 'EA',  kind: 'labor' },
  access:         { label: 'Lift / scaffold',                 vertical: 'both',        uom: 'DAY', kind: 'material' },
}

/**
 * One Walter bid.
 *
 * `pricing` is the company's, never ours. Everything it omits falls back to a
 * documented seed above, and the result says which numbers it used so a person
 * can see what drove the price.
 */
export function walterEstimate({
  cleaning = null,
  restoration = null,
  pricing = {},
  effort_factor = 1,
  tier_spread,
}) {
  const p = {
    crew_rate_per_hour: 55,
    tech_day_rate: 1200,
    sub_markup: 0.35,
    assessment_fee: 450,
    mobilization: 0,
    productive_minutes_per_day: 390,
    // Finishing against resurfacing. AGR's own split was $1,850 to $8,250.
    optical_finish_share: 0.22,
    ...pricing,
  }

  const out = { lines: [], cleaning: null, restoration: null, pricing_used: p }

  if (cleaning) {
    const minutes = cleaningMinutes({ ...cleaning, effort_factor })
    const hours = crewHours(minutes)
    const amount = round2(hours * num(p.crew_rate_per_hour))
    const workType = cleaning.condition === 'post_construction' ? 'residue' : 'clean'
    out.cleaning = { minutes, hours, amount, work_type: workType }
    out.lines.push({
      work_type: workType,
      item_name: WORK_TYPES[workType].label,
      description: cleaning.description || null,
      quantity: hours,
      price: round2(num(p.crew_rate_per_hour)),
      line_total: amount,
      unit_of_measure: 'HR',
      kind: 'labor',
    })
  }

  if (restoration) {
    const split = splitBySeverity(restoration.zones)
    const resurfaceMinutes = restorationMinutes({ ...restoration, zones: split.restoration, effort_factor })
    // Resurfacing a mark and bringing the pane back to optical clarity are two
    // different passes, and a bid that omits the second one is short by the
    // whole finishing package — AGR priced it at $1,850 against $8,250 of
    // resurfacing. It is the same tech on the same trip, so it does NOT buy
    // its own days; it adds minutes, and the money is split across two lines
    // so the bid reads the way the trade reads it.
    const finishMinutes = round2(resurfaceMinutes * num(p.optical_finish_share))
    const minutes = round2(resurfaceMinutes + finishMinutes)
    const days = techDays(minutes, { productive_minutes_per_day: p.productive_minutes_per_day })
    const subCost = round2(days.billable * num(p.tech_day_rate))
    const amount = round2(subCost * (1 + num(p.sub_markup)))
    // Proportional, with finishing taking the remainder so the two lines add
    // back to the total exactly rather than drifting by a rounded cent.
    const resurfaceAmount = minutes > 0 ? round2(amount * (resurfaceMinutes / minutes)) : 0
    const finishAmount = round2(amount - resurfaceAmount)
    out.restoration = {
      minutes,
      resurface_minutes: resurfaceMinutes,
      finish_minutes: finishMinutes,
      days,
      zones_counted: split.restoration.length,
      zones_to_clean: split.cleaning.length,
      excluded: excludedZones(restoration.zones).length,
      sub_cost: subCost,
      amount,
    }
    if (days.billable > 0) {
      out.lines.push({
        work_type: 'resurface',
        item_name: WORK_TYPES.resurface.label,
        description: `${split.restoration.length} marked zone(s)`,
        quantity: 1,
        price: resurfaceAmount,
        line_total: resurfaceAmount,
        unit_of_measure: 'EA',
        kind: 'labor',
      })
      if (finishAmount > 0) {
        out.lines.push({
          work_type: 'optical_finish',
          item_name: WORK_TYPES.optical_finish.label,
          description: 'Final polish and quality check, then walkthrough',
          quantity: 1,
          price: finishAmount,
          line_total: finishAmount,
          unit_of_measure: 'EA',
          kind: 'labor',
        })
      }
    }
  }

  const access = cleaning?.access || restoration?.access || DEFAULT_ACCESS
  const acc = accessProfile(access)
  if (acc.needs_equipment) {
    const days = Math.max(1, out.restoration?.days?.billable || Math.ceil(crewHours(out.cleaning?.minutes || 0) / 8) || 1)
    const total = round2(days * num(acc.equipment_day))
    out.lines.push({
      work_type: 'access',
      item_name: `${WORK_TYPES.access.label} — ${acc.label}`,
      description: 'Passed through at cost plus markup',
      quantity: days,
      price: round2(num(acc.equipment_day)),
      line_total: total,
      unit_of_measure: 'DAY',
      kind: 'material',
    })
  }

  if (num(p.assessment_fee) > 0) {
    out.lines.push({
      work_type: 'assessment',
      item_name: WORK_TYPES.assessment.label,
      description: 'Credited against the work if booked',
      quantity: 1,
      price: round2(num(p.assessment_fee)),
      line_total: round2(num(p.assessment_fee)),
      unit_of_measure: 'EA',
      kind: 'labor',
    })
  }

  if (num(p.mobilization) > 0) {
    out.lines.push({
      work_type: 'mobilization',
      item_name: WORK_TYPES.mobilization.label,
      description: 'Travel and setup, one move',
      quantity: 1,
      price: round2(num(p.mobilization)),
      line_total: round2(num(p.mobilization)),
      unit_of_measure: 'EA',
      kind: 'labor',
    })
  }

  out.expected = quoteTotalFromLines(out.lines)
  out.tiers = threeTiers(out.expected, tier_spread)
  return out
}

/** The quote is worth the sum of the lines a customer will read. */
export function quoteTotalFromLines(lines) {
  return round2((lines || []).reduce((s, l) => s + num(l.line_total), 0))
}

export function toIntakeLines(result) {
  return (result?.lines || []).map((l) => ({
    item_name: l.item_name,
    description: l.description,
    quantity: l.quantity,
    price: l.price,
    line_total: l.line_total,
    unit_of_measure: l.unit_of_measure,
    kind: l.kind,
    in_utility_scope: false,
  }))
}

/**
 * Walter's bid as quote_lines rows.
 *
 * Through _shared/estimateIntake, like Lenard, Zach and Don — not a fourth
 * hand-rolled copy of the same write. That rule has already been written three
 * times in this repo and the copies drifted before anyone noticed.
 */
export function toQuoteLines(result, { companyId, quoteId }) {
  return intakeLineRows({ company_id: companyId, lines: toIntakeLines(result) }, quoteId)
}
