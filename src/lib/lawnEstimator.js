// Lawn estimator — turns a property + pricing rules into a per-visit price,
// predicted duration, and an annual program total.
//
// Pricing rules come from the lawn_pricing table (one row per company).
// Effort factor (per property) multiplies labor-driven items — this is the
// "learning loop" output: jobs that take 18% longer than expected price 18%
// higher next time.

export const DEFAULT_PRICING = {
  mow_per_sqft: 0.012,
  mow_minimum: 45,
  mow_minutes_per_1000sqft: 8.0,
  edging_per_lin_ft: 0.10,
  edging_default_lin_ft: 200,
  fert_per_1000sqft: 12,
  weed_per_1000sqft: 8,
  grub_per_1000sqft: 14,
  iron_per_1000sqft: 6,
  lime_per_1000sqft: 5,
  pre_emergent_per_1000sqft: 10,
  aeration_per_1000sqft: 18,
  aeration_minimum: 90,
  overseed_per_1000sqft: 22,
  cleanup_per_hour: 75,
  travel_per_visit: 0,
  tax_rate: 0,
  margin_multiplier: 1.0,
}

// Per-1000-sqft helpers
const per1k = (sqft, rate) => Math.round((sqft / 1000) * rate * 100) / 100

// One mow visit — used for "what does each mow cost" + drives the weekly program total.
export function estimateMow({ turf_sqft, edging_lin_ft, pricing, effort_factor = 1 }) {
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) }
  const e = effort_factor || 1

  const mowRaw = (turf_sqft || 0) * Number(p.mow_per_sqft) * e
  const mowCharge = Math.max(mowRaw, Number(p.mow_minimum))
  const edgeLF = edging_lin_ft != null ? Number(edging_lin_ft) : Number(p.edging_default_lin_ft)
  const edgeCharge = edgeLF * Number(p.edging_per_lin_ft)
  const travel = Number(p.travel_per_visit) || 0
  const subtotal = mowCharge + edgeCharge + travel
  const total = subtotal * Number(p.margin_multiplier || 1)
  const tax = total * Number(p.tax_rate || 0)

  const predictedMinutes = Math.round(((turf_sqft || 0) / 1000) * Number(p.mow_minutes_per_1000sqft) * e)

  return {
    line_items: [
      { label: 'Mow', detail: `${(turf_sqft || 0).toLocaleString()} sqft @ $${Number(p.mow_per_sqft).toFixed(4)}/sqft`, total: round2(mowCharge) },
      ...(edgeCharge > 0 ? [{ label: 'Edging', detail: `${edgeLF} lf @ $${Number(p.edging_per_lin_ft).toFixed(2)}/lf`, total: round2(edgeCharge) }] : []),
      ...(travel > 0 ? [{ label: 'Travel / minimum', total: round2(travel) }] : []),
    ],
    subtotal: round2(subtotal),
    total: round2(total),
    tax: round2(tax),
    grand_total: round2(total + tax),
    predicted_minutes: predictedMinutes,
  }
}

// Treatment round (per 1k sqft category)
export function estimateTreatment({ type, turf_sqft, pricing, effort_factor = 1 }) {
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) }
  const map = {
    'fert': p.fert_per_1000sqft,
    'weed-control': p.weed_per_1000sqft,
    'grub-control': p.grub_per_1000sqft,
    'iron': p.iron_per_1000sqft,
    'lime': p.lime_per_1000sqft,
    'pre-emergent': p.pre_emergent_per_1000sqft,
    'aeration': p.aeration_per_1000sqft,
    'overseed': p.overseed_per_1000sqft,
  }
  const rate = map[type]
  if (rate == null) return null
  const raw = per1k(turf_sqft || 0, Number(rate)) * (effort_factor || 1)
  let total = raw
  if (type === 'aeration') total = Math.max(total, Number(p.aeration_minimum))
  total = total * Number(p.margin_multiplier || 1)
  return {
    label: type,
    detail: `${(turf_sqft || 0).toLocaleString()} sqft @ $${Number(rate).toFixed(2)}/1k sqft`,
    total: round2(total),
  }
}

// A whole season program — one mow per "frequency" + a default 6-round treatment plan.
// Returns per-visit, per-mow-visit, treatment lines, and annual total.
export function estimateProgram({ property, pricing, effort_factor }) {
  const turf = property?.turf_size_sqft || 0
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) }
  const ef = effort_factor != null ? effort_factor : (property?.effort_factor || 1)

  const mow = estimateMow({ turf_sqft: turf, pricing: p, effort_factor: ef })

  // Mows per season — derive from frequency + service window
  const startM = property?.service_start_month || 4
  const endM   = property?.service_end_month   || 10
  const months = Math.max(0, endM - startM + 1)
  const weeks  = months * 4.33
  const freq   = (property?.mow_frequency || 'Weekly').toLowerCase()
  let mowsPerSeason = 0
  if (freq.includes('bi')) mowsPerSeason = Math.round(weeks / 2)
  else if (freq.includes('10')) mowsPerSeason = Math.round((months * 30) / 10)
  else if (freq.includes('month')) mowsPerSeason = months
  else if (freq.includes('on call')) mowsPerSeason = 0
  else mowsPerSeason = Math.round(weeks)

  // Standard 6-round treatment program
  const program = ['pre-emergent', 'fert', 'weed-control', 'fert', 'grub-control', 'fert']
  const treatments = program.map((t, i) => {
    const r = estimateTreatment({ type: t, turf_sqft: turf, pricing: p, effort_factor: ef })
    return r ? { ...r, round: i + 1 } : null
  }).filter(Boolean)

  const mowsTotal = round2(mow.grand_total * mowsPerSeason)
  const treatmentsTotal = round2(treatments.reduce((s, x) => s + (x.total || 0), 0))
  const annual = round2(mowsTotal + treatmentsTotal)

  return {
    per_visit: mow,
    mows_per_season: mowsPerSeason,
    mows_total: mowsTotal,
    treatments,
    treatments_total: treatmentsTotal,
    annual_program_total: annual,
    effort_factor: ef,
  }
}

// Learning loop — given recent visits with predicted vs actual durations,
// compute a smoothed effort factor for this property.
// Capped to [0.6, 1.6] so a couple of bad outliers can't blow up the price.
export function computeEffortFactor(visits) {
  const samples = (visits || [])
    .filter(v => v.predicted_duration_minutes && v.duration_minutes && v.predicted_duration_minutes > 0)
    .slice(0, 20) // most recent 20

  if (samples.length < 3) {
    return { factor: 1.0, sample_n: samples.length, confidence: 'low' }
  }
  const ratios = samples.map(v => v.duration_minutes / v.predicted_duration_minutes)
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length
  const clamped = Math.max(0.6, Math.min(1.6, avg))
  return {
    factor: round3(clamped),
    sample_n: samples.length,
    confidence: samples.length >= 6 ? 'high' : 'medium',
    raw_avg: round3(avg),
  }
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }
function round3(n) { return Math.round((Number(n) || 0) * 1000) / 1000 }
