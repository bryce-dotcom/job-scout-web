// Chris Christmas Lighting — the rule for pricing a roofline.
//
// Antonino Lawn Care asked for it: "Can we get a mode for Christmas lights
// where we can take a picture or use maps to show them their house and what
// would look like with lights." Lawn crews have the customers, the trucks and
// an empty December, so this is the winter half of Zach's year.
//
// The shape of the job: a roofline is a LINE, not an area. You buy it by the
// foot, and what changes the number is how much of the house they want lit —
// most people do the whole thing, plenty only do the street side.
//
// Two decisions this file exists to hold.
//
// ONE. Coverage is a filter over traced runs, never a multiplier.
//
// The tempting shortcut is "front is about 40% of the perimeter". That is a
// guess dressed as arithmetic, and it is the same mistake as the lamp
// multiplier that turned a $20,549.90 takeoff into $67,198.60 — a number
// nobody traced, applied to a quantity nobody checked. Here every run is
// tagged with the face it sits on as it is drawn, and a coverage choice simply
// includes or excludes whole runs. Change the toggle and the feet change
// because different REAL segments are counted.
//
// TWO. The scale comes from the map, not from the user.
//
// A Web Mercator tile has an exact ground resolution at a given zoom and
// latitude. So a roofline traced on a map tile converts to feet with no
// calibration step and no chance of a mis-tapped reference line. lib/measure
// makes you calibrate because it works on a photographed plan sheet, where
// nothing is known; here everything is.

/** Which faces each coverage choice includes. Order is the display order. */
export const COVERAGE = {
  front: { label: 'Front only', faces: ['front'], hint: 'Street-facing runs only' },
  half: { label: 'Half house', faces: ['front', 'side'], hint: 'Front and both sides' },
  full: { label: 'Full house', faces: ['front', 'side', 'back'], hint: 'All the way round' },
}

export const COVERAGE_KEYS = ['front', 'half', 'full']

/** The faces a run can sit on. Anything else is treated as a side. */
export const FACES = ['front', 'side', 'back']

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/** A run's face, defaulting to 'side' so an untagged run is never free. */
export function faceOf(run) {
  const f = String(run?.face ?? '').trim().toLowerCase()
  return FACES.includes(f) ? f : 'side'
}

/**
 * Exact ground scale for a Web Mercator tile — feet per pixel.
 *
 * 156543.03392 m/px is the resolution at zoom 0 on the equator; it shrinks by
 * 2^zoom and by the cosine of the latitude. This is why no calibration step
 * exists: at zoom 20 in Utah a pixel is 0.37 ft and we know that for certain.
 */
export function feetPerPixel(lat, zoom) {
  const z = num(zoom)
  const la = num(lat)
  if (!Number.isFinite(z) || z <= 0 || Math.abs(la) > 85) return null
  const metres = (156543.03392 * Math.cos((la * Math.PI) / 180)) / 2 ** z
  return metres / 0.3048
}

/** Pixels per foot — the same fact the other way up, for drawing. */
export function pixelsPerFoot(lat, zoom) {
  const fpp = feetPerPixel(lat, zoom)
  return fpp && fpp > 0 ? 1 / fpp : null
}

/** Length of a traced polyline in feet. Points are {x,y} in tile pixels. */
export function runLengthFt(points, feetPerPx) {
  const fpp = num(feetPerPx)
  if (!Array.isArray(points) || points.length < 2 || fpp <= 0) return 0
  let px = 0
  for (let i = 1; i < points.length; i++) {
    const dx = num(points[i].x) - num(points[i - 1].x)
    const dy = num(points[i].y) - num(points[i - 1].y)
    px += Math.hypot(dx, dy)
  }
  return Math.round(px * fpp * 10) / 10
}

/** The runs a coverage choice includes. */
export function runsForCoverage(runs = [], coverage = 'full') {
  const faces = COVERAGE[coverage]?.faces || COVERAGE.full.faces
  return (runs || []).filter((r) => faces.includes(faceOf(r)))
}

/** Lit feet for a coverage choice — the sum of the runs it includes. */
export function coverageFeet(runs = [], coverage = 'full') {
  const total = runsForCoverage(runs, coverage).reduce((a, r) => a + num(r?.length_ft), 0)
  return Math.round(total * 10) / 10
}

/** Every coverage choice with its feet, so the toggles can show real numbers. */
export function coverageOptions(runs = []) {
  return COVERAGE_KEYS.map((key) => ({
    key,
    ...COVERAGE[key],
    feet: coverageFeet(runs, key),
    runs: runsForCoverage(runs, key).length,
  }))
}

/**
 * What it costs.
 *
 * One rate per foot covering install, materials and takedown, because that is
 * how this trade quotes and how the customer thinks. A minimum charge exists
 * because a 40ft porch still costs a truck roll.
 */
export function lightsPrice({ feet, perFootRate, minimumCharge = 0 } = {}) {
  const ft = Math.max(0, num(feet))
  const rate = Math.max(0, num(perFootRate))
  const min = Math.max(0, num(minimumCharge))
  const line = Math.round(ft * rate * 100) / 100
  const total = Math.max(line, min)
  return {
    feet: ft,
    rate,
    line_total: line,
    minimum_applied: total > line,
    total: Math.round(total * 100) / 100,
  }
}

/** Why this cannot be quoted yet, as a sentence — or null. */
export function quoteProblem({ runs = [], coverage = 'full', perFootRate } = {}) {
  if (!runs.length) return 'Trace the roofline first — tap along each run you would hang lights on.'
  const ft = coverageFeet(runs, coverage)
  if (ft <= 0) {
    const label = (COVERAGE[coverage]?.label || 'This coverage').toLowerCase()
    return `Nothing is tagged for ${label}. Tag at least one run, or choose a wider coverage.`
  }
  if (num(perFootRate) <= 0) return 'Set a price per foot in Settings before quoting.'
  return null
}

/**
 * The estimate lines. Goes through _shared/estimateIntake like every other
 * agent that produces a bid — there is one writer of quotes and quote_lines
 * and this is not a second one.
 */
export function lightsIntakeLines({ runs = [], coverage = 'full', perFootRate, minimumCharge = 0, address } = {}) {
  const ft = coverageFeet(runs, coverage)
  const priced = lightsPrice({ feet: ft, perFootRate, minimumCharge })
  const cov = COVERAGE[coverage] || COVERAGE.full
  const faces = runsForCoverage(runs, coverage)
    .reduce((acc, r) => { const f = faceOf(r); acc[f] = Math.round(((acc[f] || 0) + num(r.length_ft)) * 10) / 10; return acc }, {})
  const breakdown = FACES.filter((f) => faces[f]).map((f) => `${faces[f]} ft ${f}`).join(', ')

  const lines = [{
    item_name: `Christmas lights — ${cov.label.toLowerCase()}`,
    description: `${ft} ft of roofline${breakdown ? ` (${breakdown})` : ''}${address ? ` at ${address}` : ''}. Installed, maintained for the season and taken down.`,
    quantity: ft,
    price: priced.rate,
    unit_of_measure: 'ft',
    kind: 'service',
    notes: 'Measured from aerial imagery and confirmed on site.',
  }]

  // A minimum is its own line rather than a silently inflated per-foot rate —
  // a customer who can read the maths is a customer who trusts the number.
  if (priced.minimum_applied) {
    lines.push({
      item_name: 'Minimum install charge',
      description: `Brings a ${ft} ft job up to the minimum callout.`,
      quantity: 1,
      price: Math.round((priced.total - priced.line_total) * 100) / 100,
      unit_of_measure: 'ea',
      kind: 'service',
    })
  }
  return lines
}

// Bulb colours the customer can see drawn. Antonino asked for "options of
// different colors" in the same breath as the picture. Colour changes the
// picture and the estimate wording, never the price per foot — a tenant who
// charges more for multicolour sets that in their own rate, not here.
// chris-render holds the matching prompt wording under the same keys; an
// unknown key draws warm white rather than failing.
export const BULB_COLORS = [
  { key: 'warm_white', label: 'Warm white', swatch: ['#ffd27a'] },
  { key: 'cool_white', label: 'Cool white', swatch: ['#e8f1ff'] },
  { key: 'multicolor', label: 'Multicolor', swatch: ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b'] },
  { key: 'red_green', label: 'Red & green', swatch: ['#ef4444', '#22c55e'] },
  { key: 'red_white', label: 'Red & white', swatch: ['#ef4444', '#f5f5f5'] },
  { key: 'blue', label: 'Blue', swatch: ['#3b82f6'] },
]

/** The label for a colour key; unknown → warm white, same as the render. */
export function bulbLabel(key) {
  return (BULB_COLORS.find((c) => c.key === key) || BULB_COLORS[0]).label
}
