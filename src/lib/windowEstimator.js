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
  // A duplicate_of is plain text naming another row's code, with no foreign
  // key behind it. A person typing a register will eventually point one at a
  // code that is not there, and dropping the row on that basis DELETES a mark
  // somebody stood on a ladder to log — silently, from the price.
  //
  // So a reference is only honoured when the thing it names exists. A dangling
  // one is treated as not-a-duplicate and the mark is counted; validateRegister
  // is what tells the person their reference is broken. Counting a mark that
  // may be a repeat is a visible argument about a price; losing one is not an
  // argument at all, because nobody can see it happen.
  const codes = new Set(list.map((z) => z?.id ?? z?.code).filter((c) => c != null).map(String))
  const seen = new Set()
  const out = []
  for (const z of list) {
    if (z?.duplicate_of != null && z.duplicate_of !== '' && codes.has(String(z.duplicate_of))) continue
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

export const SEVERITIES = Object.keys(SEVERITY_PROFILES)

/**
 * What is wrong with a register somebody typed.
 *
 * The seed script got every reference right because it generated them. An
 * editor hands that job to a person on a ladder with a phone, and every one of
 * these faults removes a mark from the PRICE without removing it from the
 * screen:
 *
 *   dangling     duplicate_of names a code that is not in the register
 *   self         a mark marked as a duplicate of itself
 *   cycle        A repeats B and B repeats A, so neither is ever counted
 *   duplicate    two marks sharing one code, so one is dropped as a repeat
 *   severity     a severity the engine does not price
 *   reason       a not_restorable_reason nothing recognises
 *
 * Returns problems rather than throwing: a half-finished register is the
 * normal state of an editor, and refusing to price it while somebody types
 * would make the running total useless.
 */
export function validateRegister(items) {
  const list = Array.isArray(items) ? items : []
  const problems = []
  const codeOf = (z) => (z?.id ?? z?.code)
  const codes = new Map()
  for (const z of list) {
    const c = codeOf(z)
    if (c == null || c === '') { problems.push({ code: null, kind: 'missing_code', message: 'A mark with no code cannot be referred to.' }); continue }
    const key = String(c)
    if (codes.has(key)) problems.push({ code: key, kind: 'duplicate_code', message: `Two marks share the code ${key}; one will be dropped as a repeat.` })
    else codes.set(key, z)
  }
  for (const z of list) {
    const c = codeOf(z)
    const key = c == null ? null : String(c)
    const dup = z?.duplicate_of
    if (dup != null && dup !== '') {
      const d = String(dup)
      if (key != null && d === key) problems.push({ code: key, kind: 'self_duplicate', message: `${key} is marked as a repeat of itself.` })
      else if (!codes.has(d)) problems.push({ code: key, kind: 'dangling_duplicate', message: `${key} repeats ${d}, which is not in the register.` })
    }
    if (z?.severity != null && !SEVERITY_PROFILES[z.severity]) {
      problems.push({ code: key, kind: 'unknown_severity', message: `${key} has severity "${z.severity}" — expected one of ${SEVERITIES.join(', ')}.` })
    }
    if (z?.not_restorable_reason && !NOT_RESTORABLE.includes(z.not_restorable_reason)) {
      problems.push({ code: key, kind: 'unknown_reason', message: `${key} cannot be restored for reason "${z.not_restorable_reason}", which nothing recognises.` })
    }
  }
  // Cycles: follow each chain and see whether it comes back to where it began.
  for (const [key] of codes) {
    const path = new Set([key])
    let at = key
    for (;;) {
      const next = codes.get(at)?.duplicate_of
      if (next == null || next === '') break
      const n = String(next)
      if (!codes.has(n)) break
      if (path.has(n)) {
        if (n === key) problems.push({ code: key, kind: 'duplicate_cycle', message: `${key} and ${at} repeat each other, so neither is ever counted.` })
        break
      }
      path.add(n)
      at = n
    }
  }
  return { ok: problems.length === 0, problems }
}

/** The next free code in a register — A01, A02, … — so an editor can label a new mark. */
export function nextZoneCode(items, prefix = 'A') {
  const taken = new Set((Array.isArray(items) ? items : []).map((z) => String(z?.code ?? z?.id ?? '')))
  for (let n = 1; n < 1000; n++) {
    const c = `${prefix}${String(n).padStart(2, '0')}`
    if (!taken.has(c)) return c
  }
  return `${prefix}${Date.now()}`
}

/** A new mark, defaulted the way the trade logs one: light abrasion, not an edge. */
export function newZone(items, overrides = {}) {
  return {
    code: nextZoneCode(items),
    location: '',
    lite_id: '',
    face: 'out',
    severity: 'L1',
    edge: false,
    duplicate_of: null,
    not_restorable_reason: null,
    ...overrides,
  }
}

/**
 * What the register adds up to, told apart.
 *
 * "54 of 68 not counted" reads like a fault. Forty-five of those are the same
 * scratches photographed twice, which is the register working. The three
 * reasons a row does not become billable work are completely different things
 * and a bid has to say which is which:
 *
 *   rows            every line in the register, duplicates and all
 *   distinct_marks  how many real marks were logged, however often
 *                   photographed — the number a person counts on the wall
 *   marks           of those, the ones that will be WORKED
 *   duplicates      the same mark photographed again
 *   to_resurface    marks the tech works
 *   to_clean        L0s that go to the cleaning crew instead
 *   excluded        distinct marks nobody may touch, with the reasons
 *
 * distinct_marks and marks differ by the exclusions, and both are wanted:
 * "23 marks logged, 18 of them restorable" is the sentence a bid needs.
 * `marks` kept its original meaning rather than being redefined underneath
 * the screens already reading it.
 *
 * Raised by the Walter session after it put the single number on screen and
 * saw how it read.
 */
export function registerCounts(zones) {
  const list = Array.isArray(zones) ? zones : []
  const duplicates = list.filter((z) => z?.duplicate_of).length
  const blocked = list.filter((z) => !z?.duplicate_of && z?.not_restorable_reason)
  const marks = countableZones(list)
  const split = splitBySeverity(list)
  const reasons = {}
  for (const z of blocked) {
    const r = String(z.not_restorable_reason)
    reasons[r] = (reasons[r] || 0) + 1
  }
  return {
    rows: list.length,
    distinct_marks: list.length - duplicates,
    marks: marks.length,
    duplicates,
    to_resurface: split.restoration.length,
    to_clean: split.cleaning.length,
    excluded: blocked.length,
    excluded_reasons: reasons,
  }
}

/**
 * Marks that will NOT be restored, with why — a bid has to say so out loud.
 *
 * Distinct marks only. A duplicate is not an exclusion, and it inherits its
 * parent's reason, so returning duplicates here printed thirteen codes under
 * a count of five — A20, A20-b and A20-c for one excluded mark photographed
 * three times. The Walter session hit that on screen and filtered it there;
 * this moves the rule to the one place, before it reaches a customer.
 *
 * And an L0 is NOT an exclusion. "Probably residue, try cleaning first" is
 * work somebody does, by a crew with a cloth instead of a tech with a pad —
 * registerCounts reports it as to_clean. Listing it here told a customer we
 * would not touch a mark we were about to wipe off, and made this disagree
 * with the count beside it.
 */
export function excludedZones(items) {
  return (Array.isArray(items) ? items : []).filter(
    (z) => !z?.duplicate_of && z?.not_restorable_reason,
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

/**
 * What a tech day costs, from whichever figure the company actually has.
 *
 * An explicit day rate wins, because that is what a sub quotes. Otherwise it
 * comes from an hourly rate, and the hours you PAY for are not the hours of
 * glass work you get: you buy an 8-hour day and about 6.5 hours of it reaches
 * the glass, the rest being setup, moves, breaks and the weather.
 * productive_minutes_per_day governs how much work fits in a day;
 * paid_hours_per_day governs what the day costs. Conflating them is how a bid
 * ends up 20% light.
 */
export function techDayCost({ tech_day_rate, tech_hourly_rate, paid_hours_per_day = 8 }) {
  if (num(tech_day_rate) > 0) return round2(num(tech_day_rate))
  return round2(num(tech_hourly_rate) * Math.max(0, num(paid_hours_per_day, 8)))
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

/**
 * Work whose QUANTITY is genuinely unknown until somebody is on site.
 *
 * This is the whole of the tier range. A pane count is not uncertain — a
 * person counted the panes, and bidding 78% to 137% of a number you counted
 * is not a range, it is a shrug. What nobody knows is how much damage is
 * under the construction residue, which is exactly what AGR said: "not known
 * until someone stands there with a test patch."
 */
export const UNCERTAIN_WORK = new Set(['resurface', 'optical_finish', 'restoration'])

/**
 * A quantity at a tier. Whole units, because a damage zone is a damage zone.
 *
 * Rounded AWAY from the expected case at each end — down for favourable, up
 * for difficult — so the range never quietly narrows itself. A tier that
 * rounds toward the middle is a tier pretending to be more certain than it is.
 */
export function tierQuantity(qty, factor) {
  const q = num(qty)
  const f = num(factor, 1)
  if (f === 1) return q
  // Settle the float before rounding. 100 * 1.1 is 110.00000000000001 in
  // JavaScript, and Math.ceil of that is 111 — a tier one unit too high on
  // every round number, which is the kind of wrongness nobody queries because
  // it is only ever off by one.
  const n = Math.round(q * f * 1e6) / 1e6
  return f < 1 ? Math.max(0, Math.floor(n)) : Math.ceil(n)
}

// ─────────────────────────────────────────────────────────────────────────
// What the work is worth, as against what it costs
// ─────────────────────────────────────────────────────────────────────────
// Restoration is not a cost-plus trade and a cost-plus engine will quietly
// give the job away. The customer's alternative is REPLACING the glass, and
// AGR sold the UGR Eden job on exactly that: $19,400 against $45,000–$110,000
// of replacement, which they put at "17–43% of replacement cost".
//
// The arithmetic that makes the point: at $30–35/hr a tech, four days of
// resurfacing costs about $1,000. Cost plus 35% prices that work at about
// $1,400. AGR charged $8,250 for it. The labour is the floor, not the price.
//
// So this does not set a price — a person does — it just refuses to let the
// comparison stay invisible. Give it a replacement range and every bid can
// show where it sits against the alternative, and against its own cost.

export const TYPICAL_SHARE_OF_REPLACEMENT = { low: 0.17, high: 0.43 }

// The share of replacement a restoration bid is priced at. AGR's UGR Eden bid
// was $19,400 against $45,000–$110,000, so 25% of the midpoint — and their
// "17–43% of replacement cost" is that same one price read against each end of
// the range, not three different prices.
export const DEFAULT_TARGET_SHARE = 0.25

/**
 * What the job is worth, before asking what it costs.
 *
 * Replacement is a range because nobody prices 23 panes of LoE³-366 to the
 * dollar before they have to. The midpoint is the anchor; a company that knows
 * its replacement number exactly passes the same figure for both ends.
 */
export function valuePrice({ replacement_low, replacement_high, target_share = DEFAULT_TARGET_SHARE }) {
  const lo = num(replacement_low)
  const hi = num(replacement_high)
  if (lo <= 0 && hi <= 0) return 0
  const mid = lo > 0 && hi > 0 ? (lo + hi) / 2 : Math.max(lo, hi)
  return round2(mid * num(target_share, DEFAULT_TARGET_SHARE))
}

/**
 * Which number wins: what the work is worth, or what it costs plus a margin.
 *
 * Value-based pricing is the right model for this trade and it is also the one
 * that can quietly bid UNDER cost — a building with cheap glass and 40 marks
 * on it is a lot of tech days against a small replacement figure. So the cost
 * floor is not optional, and the result says which bound decided the price, so
 * a person can see when value pricing stopped applying.
 */
export function resolveBid({ value, cost, min_margin_over_cost = 0.35 }) {
  const floor = round2(num(cost) * (1 + num(min_margin_over_cost)))
  const v = num(value)
  if (v <= 0) return { amount: floor, basis: 'cost_plus', floor }
  if (v < floor) return { amount: floor, basis: 'cost_floor', floor }
  return { amount: round2(v), basis: 'value', floor }
}

// Which lines carry the value premium. The restoration work, and only that:
// it is the specialist pass being priced against replacing the glass.
export const VALUE_BEARING = new Set(['resurface', 'optical_finish'])

/**
 * Spread a target total across the lines that carry the value.
 *
 * Value pricing sets ONE number; a customer reads a list. Scaling every line
 * to reach it produces a bid nobody would sign — the first cut of this put
 * window cleaning at $156 an hour and turned a $1,450 assessment fee into
 * $4,127. Both are numbers a customer can check against the market, and both
 * were wrong.
 *
 * So the premium lands where the value is. Cleaning stays at the company's
 * billed hourly rate, because a customer can and will compare it to another
 * window cleaner. A fixed assessment fee stays fixed. Equipment stays at cost,
 * since marking up a lift inside a labour line hides it. What absorbs the
 * difference is the resurfacing and finishing — the work whose alternative is
 * a glazier and $45,000.
 *
 * That is also exactly how AGR's own estimate reads: residue at a cleaning
 * rate, a flat assessment, travel at cost, and the money in the two
 * restoration packages.
 *
 * The last scaled line absorbs the rounding so the lines add to the target
 * exactly, the same arrangement digEstimator uses for mobilization.
 */
export function scaleLinesTo(lines, target, { bearing = VALUE_BEARING } = {}) {
  const rows = (lines || []).map((l) => ({ ...l }))
  const labour = rows.filter((l) => bearing.has(l.work_type))
  const fixed = round2(rows.filter((l) => !bearing.has(l.work_type)).reduce((s, l) => s + num(l.line_total), 0))
  const want = round2(num(target) - fixed)
  const have = round2(labour.reduce((s, l) => s + num(l.line_total), 0))
  // Nothing to scale, or the fixed lines already exceed the target — leave the
  // bid alone rather than inventing a negative line.
  if (!(labour.length && have > 0 && want > 0)) return rows
  const k = want / have
  let running = 0
  labour.forEach((l, i) => {
    const isLast = i === labour.length - 1
    const total = isLast ? round2(want - running) : round2(num(l.line_total) * k)
    running = round2(running + total)
    l.line_total = total
    // The invariant a customer can check with a calculator: quantity times
    // unit price is the line total, on every line.
    l.price = num(l.quantity) > 0 ? round2(total / num(l.quantity)) : total
    if (num(l.quantity) > 0) l.line_total = round2(l.price * num(l.quantity))
  })
  // Re-settle any cent the per-line rounding moved, on the last labour line.
  const got = round2(labour.reduce((s, l) => s + num(l.line_total), 0))
  const drift = round2(want - got)
  if (drift !== 0 && labour.length) {
    const last = labour[labour.length - 1]
    last.line_total = round2(num(last.line_total) + drift)
    last.price = num(last.quantity) > 0 ? round2(last.line_total / num(last.quantity)) : last.line_total
    last.line_total = num(last.quantity) > 0 ? round2(last.price * num(last.quantity)) : last.line_total
  }
  return rows
}

export function valueCheck({ bid, replacement_low, replacement_high, direct_cost }) {
  const b = num(bid)
  const lo = num(replacement_low)
  const hi = num(replacement_high)
  const out = {
    bid: round2(b),
    direct_cost: round2(num(direct_cost)),
    gross_margin: round2(b - num(direct_cost)),
    gross_margin_pct: b > 0 ? round3((b - num(direct_cost)) / b) : null,
    replacement_low: round2(lo),
    replacement_high: round2(hi),
    share_of_replacement_low: hi > 0 ? round3(b / hi) : null,
    share_of_replacement_high: lo > 0 ? round3(b / lo) : null,
  }
  // Only a flag, never an adjustment. A bid under the band the trade normally
  // sells at is worth a second look before it goes out.
  out.below_typical_band =
    lo > 0 && b > 0 ? b / lo < TYPICAL_SHARE_OF_REPLACEMENT.low : null
  return out
}

export function threeTiers(lines, { spread, uncertain = UNCERTAIN_WORK } = {}) {
  const s = { ...DEFAULT_TIER_SPREAD, ...(spread || {}) }
  const rows = Array.isArray(lines) ? lines : []
  const varies = rows.some((l) => uncertain.has(l?.work_type) && num(l?.quantity) > 0)

  const at = (factor) => {
    let total = 0
    let units = 0
    for (const l of rows) {
      const scaled = uncertain.has(l?.work_type)
      const q = scaled ? tierQuantity(l?.quantity, factor) : num(l?.quantity)
      // The LARGEST uncertain quantity, not their sum. Resurfacing and
      // finishing are two passes over the SAME zones, so adding them reports
      // 28 zones on a register of 14 — a number the customer can count and
      // find wrong. Lines sharing a unit are not additive.
      if (scaled) units = Math.max(units, q)
      total = round2(total + round2(q * num(l?.price)))
    }
    return { total, units }
  }

  const fav = at(num(s.favourable, 1))
  const exp = at(1)
  const dif = at(num(s.difficult, 1))

  return {
    favourable: fav.total,
    expected: exp.total,
    difficult: dif.total,
    // What actually differs between the three, so a bid can say "23 zones,
    // 18 if it goes well, 32 if it does not" instead of three bare numbers
    // the customer has to take on faith.
    quantities: { favourable: fav.units, expected: exp.units, difficult: dif.units },
    // False when nothing in the bid is uncertain — a counted pane count has no
    // range, and three identical numbers would be a worse lie than one.
    varies,
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
  replacement_low = 0,
  replacement_high = 0,
}) {
  const p = {
    crew_rate_per_hour: 55,
    // A glass restoration tech, as a wage. Bryce priced the trade at $30–35
    // an hour on 2026-10-22; the earlier $1,200/day seed was a guess and it
    // was four times too high. A SUB quotes days instead — set tech_day_rate
    // and it wins over this.
    tech_hourly_rate: 32.5,
    paid_hours_per_day: 8,
    tech_day_rate: 0,
    sub_markup: 0.35,
    assessment_fee: 450,
    mobilization: 0,
    productive_minutes_per_day: 390,
    // Finishing against resurfacing. AGR's own split was $1,850 to $8,250.
    optical_finish_share: 0.22,
    // Restoration is priced against what replacing the glass would cost, not
    // against our labour — 'cost_plus' puts it back on labour for a company
    // that wants that. min_margin_over_cost is the floor either way: no bid
    // goes out under cost, however cheap the glass turns out to be.
    pricing_model: 'value',
    target_share_of_replacement: DEFAULT_TARGET_SHARE,
    min_margin_over_cost: 0.35,
    crew_cost_per_hour: 38,
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
    const dayCost = techDayCost(p)
    const subCost = round2(days.billable * dayCost)
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
      register: registerCounts(restoration.zones),
      day_cost: dayCost,
      sub_cost: subCost,
      amount,
    }
    // Priced PER ZONE, not as a lump.
    //
    // A lump-sum line has no quantity to vary, and the tiers vary quantity —
    // so a one-unit line scaled 0.78 and 1.37 collapses to zero zones and
    // doubles to two, which is not a range, it is an accident. The zone count
    // is the unit a person can check and the unit the tier moves. It is also
    // the shape a price-book product wants: quantity stays the zone count and
    // the price becomes the product's per-zone rate.
    const zones = split.restoration.length
    if (days.billable > 0 && zones > 0) {
      const perZone = round2(resurfaceAmount / zones)
      out.lines.push({
        work_type: 'resurface',
        item_name: WORK_TYPES.resurface.label,
        description: `${zones} marked zone(s)`,
        quantity: zones,
        price: perZone,
        line_total: round2(perZone * zones),
        unit_of_measure: 'ZONE',
        kind: 'labor',
      })
      if (finishAmount > 0) {
        const finishPerZone = round2(finishAmount / zones)
        out.lines.push({
          work_type: 'optical_finish',
          item_name: WORK_TYPES.optical_finish.label,
          description: 'Final polish and quality check, then walkthrough',
          quantity: zones,
          price: finishPerZone,
          line_total: round2(finishPerZone * zones),
          unit_of_measure: 'ZONE',
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

  // What it costs us, so the margin is never a mystery: the sub at his rate,
  // and our own crew at what they actually cost rather than what they bill.
  const crewCost = out.cleaning
    ? round2(out.cleaning.hours * num(p.crew_cost_per_hour, p.crew_rate_per_hour))
    : 0
  out.direct_cost = round2(crewCost + (out.restoration?.sub_cost || 0))
  out.cost_plus_total = quoteTotalFromLines(out.lines)

  // ── What the bid is actually worth ───────────────────────────────────
  // Restoration is priced against the customer's alternative — replacing the
  // glass — not against our labour. Four tech days at $32.50/hr costs about
  // a thousand dollars; AGR charged $8,250 for that work and sold the job at
  // 25% of mid-replacement. Cost-plus on this trade gives the job away.
  //
  // Cleaning alone stays cost-plus: a window cleaner's alternative is another
  // window cleaner, not a glazier, and there is no replacement cost to price
  // against. Value pricing applies when there is restoration AND somebody has
  // said what the glass would cost to replace.
  const wantsValue = (p.pricing_model || 'value') === 'value' && !!out.restoration
  const value = wantsValue ? valuePrice({ replacement_low, replacement_high, target_share: p.target_share_of_replacement }) : 0
  let target = null
  if (value > 0) {
    const resolved = resolveBid({ value, cost: out.direct_cost, min_margin_over_cost: p.min_margin_over_cost })
    out.pricing_basis = resolved.basis
    out.cost_floor = resolved.floor
    out.lines = scaleLinesTo(out.lines, resolved.amount)
    target = resolved.amount
  } else {
    out.pricing_basis = 'cost_plus'
    out.cost_floor = round2(out.direct_cost * (1 + num(p.min_margin_over_cost)))
  }

  out.expected = quoteTotalFromLines(out.lines)
  // The fixed lines — a flat assessment, equipment at cost — can on a small
  // job already add up to more than the value target. Nothing is scaled down
  // to meet it (that would mean billing a fee at less than the fee), so the
  // lines win, and the basis says so rather than claiming a price the bid
  // does not have.
  // A DOLLAR of tolerance, not a cent. Pricing a line per zone rather than as
  // a lump means round2 on the unit price, and the line total then lands a
  // couple of cents off the target — which is the documented cost of letting a
  // customer check quantity times price with a calculator. The case this guard
  // is actually for, fixed lines already exceeding the value target, misses by
  // hundreds. A cent of tolerance mistook the former for the latter and
  // reported a value-priced bid as cost-plus.
  if (target != null && out.expected > round2(target) + 1) {
    out.pricing_basis = 'cost_plus'
  }
  // Tiers vary the TAKEOFF, not the price. Bryce, 2026-10-23.
  out.tiers = threeTiers(out.lines, { spread: tier_spread })
  // Only where there is restoration to compare. Replacing the glass is the
  // alternative to RESTORING it; it was never the alternative to cleaning it,
  // so on a cleaning-only visit the comparison is meaningless and the
  // under-the-band flag is noise. A cleaning-only demo record reported "4.9%
  // of replacement" and raised the flag, which is a bid being told off for not
  // being expensive enough to replace a window.
  //
  // Same gate the pricing already uses, for the same reason. Not computed at
  // all rather than computed and ignored: a figure that exists gets rendered
  // eventually.
  if (out.restoration && (num(replacement_low) > 0 || num(replacement_high) > 0)) {
    out.value = valueCheck({
      bid: out.expected,
      replacement_low,
      replacement_high,
      direct_cost: out.direct_cost,
    })
  }
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
