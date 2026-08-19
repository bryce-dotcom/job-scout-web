// Measuring off a drawing — pure geometry, no DOM.
//
// A plan sheet is a photograph of a scaled drawing. Nothing in the image knows
// how big anything is, so the whole system rests on one calibration: the user
// taps two ends of a known dimension and says how long it really is. Every
// measurement after that is that ratio applied to pixels.
//
// Why two-point calibration rather than reading the printed scale: "1 inch =
// 20 feet" is only meaningful at the sheet's true print size. A photo taken
// from a truck seat at an angle, or a PDF page rasterised at whatever DPI,
// has no reliable relationship to inches. The scale BAR printed on the sheet
// survives all of that, because it scales with the drawing. So we ask the user
// to tap the scale bar — or any dimensioned line — and we trust that.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0)

// Everything internally is feet.
export const UNITS = {
  ft: { label: 'feet', toFeet: 1 },
  in: { label: 'inches', toFeet: 1 / 12 },
  yd: { label: 'yards', toFeet: 3 },
  m: { label: 'metres', toFeet: 3.280839895 },
}

export function toFeet(value, unit = 'ft') {
  const u = UNITS[unit] || UNITS.ft
  return num(value) * u.toFeet
}

// ── Raw pixel geometry ───────────────────────────────────────────────────

export function distancePx(a, b) {
  if (!a || !b) return 0
  return Math.hypot(num(b.x) - num(a.x), num(b.y) - num(a.y))
}

export function polylineLengthPx(points) {
  if (!Array.isArray(points) || points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) total += distancePx(points[i - 1], points[i])
  return total
}

// Shoelace. Returns absolute area so winding direction doesn't matter — a
// user tracing clockwise should not get a negative pad.
export function polygonAreaPx(points) {
  if (!Array.isArray(points) || points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += num(a.x) * num(b.y) - num(b.x) * num(a.y)
  }
  return Math.abs(sum) / 2
}

export function polygonPerimeterPx(points) {
  if (!Array.isArray(points) || points.length < 3) return 0
  return polylineLengthPx([...points, points[0]])
}

// ── Self-intersection ────────────────────────────────────────────────────
// A crossed polygon still produces a number from the shoelace formula — a
// wrong one, quietly. On a zoomed-out plan sheet a crossing of a few pixels
// is invisible, so the geometry has to notice what the eye can't.

function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (num(c.y) - num(a.y)) * (num(b.x) - num(a.x)) - (num(b.y) - num(a.y)) * (num(c.x) - num(a.x))
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

export function isSelfIntersecting(points) {
  if (!Array.isArray(points) || points.length < 4) return false
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a1 = points[i]
    const a2 = points[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent segments — they legitimately share an endpoint.
      if (j === i) continue
      if ((j + 1) % n === i) continue
      if (j === (i + 1) % n) continue
      if (segmentsCross(a1, a2, points[j], points[(j + 1) % n])) return true
    }
  }
  return false
}

// ── Calibration ──────────────────────────────────────────────────────────

export function calibrate({ p1, p2, realLength, unit = 'ft' }) {
  const px = distancePx(p1, p2)
  const feet = toFeet(realLength, unit)
  if (px <= 0 || feet <= 0) {
    return { px_per_ft: null, valid: false, reason: 'Tap two points and enter the real distance between them.' }
  }
  const pxPerFt = px / feet
  return {
    px_per_ft: pxPerFt,
    px,
    feet: round2(feet),
    valid: true,
    // A calibration line only a few pixels long multiplies its own tapping
    // error into every measurement that follows. On a 2000px sheet, 40px is
    // about 2% of the width — below that, one sloppy tap moves everything.
    warning: px < 40
      ? 'That calibration line is very short — a pixel of tapping error becomes a big error at scale. Tap a longer known distance if you can.'
      : null,
  }
}

// ── Measurement ──────────────────────────────────────────────────────────

export function measure({ points, mode = 'line', px_per_ft }) {
  const ppf = num(px_per_ft)
  const base = { mode, points_count: Array.isArray(points) ? points.length : 0, warnings: [] }

  if (ppf <= 0) {
    return { ...base, valid: false, reason: 'Not calibrated yet — tap a known distance first.' }
  }

  if (mode === 'line') {
    if (!points || points.length < 2) {
      return { ...base, valid: false, reason: 'Tap at least two points along the run.' }
    }
    const px = polylineLengthPx(points)
    return { ...base, valid: true, length_ft: round2(px / ppf), length_px: round2(px) }
  }

  // area
  if (!points || points.length < 3) {
    return { ...base, valid: false, reason: 'Tap at least three points around the area.' }
  }
  const areaPx = polygonAreaPx(points)
  const perimPx = polygonPerimeterPx(points)
  const warnings = []
  if (isSelfIntersecting(points)) {
    warnings.push('This outline crosses itself, so the area is wrong. Undo back past the crossing and go round the edge in one direction.')
  }
  return {
    ...base,
    valid: true,
    area_sf: round2(areaPx / (ppf * ppf)),
    perimeter_ft: round2(perimPx / ppf),
    area_px: round2(areaPx),
    warnings,
  }
}

// What a measurement can become. A traced line is a trench or a run of silt
// fence; a traced area is a pad, a strip or a grade. The missing dimension is
// always depth, which no drawing view can show you.
export const MEASURE_TARGETS = {
  line: [
    { work_type: 'trench', label: 'Trench', needs: ['width_ft', 'depth_ft'] },
    { work_type: 'leach_field', label: 'Leach field', needs: ['width_ft', 'depth_ft'] },
    { work_type: 'fine_grade', label: 'Silt fence / linear item', needs: [] },
  ],
  area: [
    { work_type: 'mass_ex', label: 'Mass excavation', needs: ['depth_ft'] },
    { work_type: 'strip_topsoil', label: 'Strip topsoil', needs: ['depth_ft'] },
    { work_type: 'basement', label: 'Basement / cellar', needs: ['depth_ft'] },
    { work_type: 'overex', label: 'Over-excavate', needs: ['depth_ft'] },
    { work_type: 'fine_grade', label: 'Fine grade', needs: [] },
    { work_type: 'road_base', label: 'Road base area', needs: ['depth_ft'] },
  ],
}

// Turn a finished measurement into the item shape digEstimator expects.
export function toTakeoffItem({ measurement, work_type, extras = {}, source_ref }) {
  if (!measurement?.valid) return null
  const item = {
    work_type,
    source: 'measured',
    source_ref: source_ref || null,
    // A traced measurement is the user's own work, not a guess by us — it
    // does not need confirming before the bid can go out.
    confidence: 1,
    ...extras,
  }
  if (measurement.mode === 'line') {
    item.length_ft = measurement.length_ft
  } else {
    item.area_sf = measurement.area_sf
    item.perimeter_ft = measurement.perimeter_ft
  }
  return item
}
