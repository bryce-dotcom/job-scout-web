// The ground-truth loop.
//
// Don's seed production rates are industry starting points — decent, generic,
// and wrong for any particular company. This is what replaces them: compare
// what a takeoff said a work type would take against what it actually took,
// and let the difference reprice the next bid.
//
// The one rule that makes it honest: only MACHINE hours calibrate production
// rates. A time-clock shift includes travel, fuelling, lunch and waiting on
// trucks. Feeding shift hours into a production factor inflates it
// systematically and every future bid drifts up for a reason nobody can see.
// Shift hours still surface on the variance report — that is how you discover
// a job ate two days of standing around — they just don't touch the factor.

import { computeCalibrationFactor, MIN_CALIBRATION_SAMPLES, WORK_TYPES } from './digEstimator'

const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0)
const round2 = (n) => Math.round(num(n) * 100) / 100
const round3 = (n) => Math.round(num(n) * 1000) / 1000

export const MACHINE = 'machine'
export const SHIFT = 'shift'

// An actual counts toward the factor only if it is machine time, is flagged
// to count, and has hours on it at all.
export function countsTowardCalibration(actual) {
  if (!actual) return false
  if (num(actual.actual_hours) <= 0) return false
  if (actual.hours_kind === SHIFT) return actual.counts_toward_calibration === true
  return actual.counts_toward_calibration !== false
}

// ── One takeoff: estimated vs actual, per work type ──────────────────────
// bidItems come from estimateDig (they carry machine_hours and loads);
// actuals are dig_actuals rows for the same takeoff.

export function summarizeTakeoff({ bidItems = [], actuals = [] }) {
  const byType = {}

  const bucket = (wt) => {
    if (!byType[wt]) {
      byType[wt] = {
        work_type: wt,
        label: WORK_TYPES[wt]?.label || wt,
        estimated_hours: 0, actual_hours: 0,
        estimated_loads: 0, actual_loads: 0,
        shift_hours: 0,
        counted_samples: 0,
      }
    }
    return byType[wt]
  }

  bidItems.forEach((b) => {
    const t = bucket(b.work_type)
    t.estimated_hours += num(b.machine_hours)
    t.estimated_loads += num(b.loads)
  })

  actuals.forEach((a) => {
    // An actual logged against a work type nobody estimated still shows up —
    // that is a real finding ("we hauled all day and it was not in the bid"),
    // not a row to drop on the floor.
    const t = bucket(a.work_type || 'unassigned')
    if (a.hours_kind === SHIFT) {
      t.shift_hours += num(a.actual_hours)
      if (a.counts_toward_calibration === true) {
        t.actual_hours += num(a.actual_hours)
        t.counted_samples += 1
      }
    } else {
      t.actual_hours += num(a.actual_hours)
      if (countsTowardCalibration(a)) t.counted_samples += 1
    }
    t.actual_loads += num(a.actual_loads)
  })

  const rows = Object.values(byType).map((t) => {
    const est = round2(t.estimated_hours)
    const act = round2(t.actual_hours)
    const hasBoth = est > 0 && act > 0
    return {
      ...t,
      estimated_hours: est,
      actual_hours: act,
      shift_hours: round2(t.shift_hours),
      estimated_loads: Math.round(t.estimated_loads),
      actual_loads: Math.round(t.actual_loads),
      hours_variance: hasBoth ? round3(act / est) : null,
      hours_delta: hasBoth ? round2(act - est) : null,
      loads_delta: t.estimated_loads > 0 && t.actual_loads > 0
        ? Math.round(t.actual_loads - t.estimated_loads)
        : null,
      // 'over' means it took longer than bid — the direction that costs money.
      status: !hasBoth ? 'incomplete' : act > est * 1.05 ? 'over' : act < est * 0.95 ? 'under' : 'on',
    }
  })

  const totals = rows.reduce(
    (acc, r) => ({
      estimated_hours: round2(acc.estimated_hours + r.estimated_hours),
      actual_hours: round2(acc.actual_hours + r.actual_hours),
      shift_hours: round2(acc.shift_hours + r.shift_hours),
      estimated_loads: acc.estimated_loads + r.estimated_loads,
      actual_loads: acc.actual_loads + r.actual_loads,
    }),
    { estimated_hours: 0, actual_hours: 0, shift_hours: 0, estimated_loads: 0, actual_loads: 0 }
  )
  totals.hours_variance =
    totals.estimated_hours > 0 && totals.actual_hours > 0
      ? round3(totals.actual_hours / totals.estimated_hours)
      : null

  return { rows: rows.sort((a, b) => b.estimated_hours - a.estimated_hours), totals }
}

// ── Across takeoffs: build the samples the factor is computed from ───────
// One sample per (takeoff, work_type) where both an estimate and countable
// machine hours exist. Per-takeoff rather than per-day, because a day's hours
// belong to a job, not to a line.

export function buildSamples(summaries) {
  const byType = {}
  ;(summaries || []).forEach(({ takeoff_id, summary }) => {
    ;(summary?.rows || []).forEach((r) => {
      if (r.work_type === 'unassigned') return
      if (!(r.estimated_hours > 0 && r.actual_hours > 0)) return
      if (!byType[r.work_type]) byType[r.work_type] = []
      byType[r.work_type].push({
        takeoff_id,
        estimated_hours: r.estimated_hours,
        actual_hours: r.actual_hours,
      })
    })
  })
  return byType
}

// ── The factors ──────────────────────────────────────────────────────────

export function computeFactors(samplesByType) {
  const out = {}
  Object.entries(samplesByType || {}).forEach(([workType, history]) => {
    const r = computeCalibrationFactor(history)
    out[workType] = {
      work_type: workType,
      label: WORK_TYPES[workType]?.label || workType,
      factor: r.factor,
      raw_factor: r.raw ?? r.factor,
      sample_n: r.sample_n,
      applied: r.applied,
      needed: Math.max(0, MIN_CALIBRATION_SAMPLES - r.sample_n),
      clamped: r.raw != null && Math.abs(r.raw - r.factor) > 0.001,
    }
  })
  return out
}

// Rows for dig_calibration. Only factors that actually apply get written —
// a row saying "factor 1, not enough samples" is noise the engine would have
// to filter anyway.
export function toCalibrationRows(factors, companyId) {
  return Object.values(factors || {})
    .filter((f) => f.applied)
    .map((f) => ({
      company_id: companyId,
      work_type: f.work_type,
      soil_class: null,
      factor: f.factor,
      raw_factor: f.raw_factor,
      sample_n: f.sample_n,
      last_computed_at: new Date().toISOString(),
    }))
}

// Plain-English explanation. A factor nobody understands is a factor nobody
// trusts, and an estimator who doesn't trust it turns it off.
export function explainFactor(f) {
  if (!f) return null
  if (!f.applied) {
    return `${f.sample_n} job${f.sample_n === 1 ? '' : 's'} logged — ${f.needed} more before this starts affecting bids.`
  }
  const pct = Math.round(Math.abs(f.factor - 1) * 100)
  if (pct < 1) return `Across ${f.sample_n} jobs your ${f.label.toLowerCase()} lands about where Don estimates it. No adjustment.`
  const dir = f.factor > 1 ? 'longer' : 'quicker'
  const effect = f.factor > 1 ? 'prices higher' : 'prices lower'
  return `Across ${f.sample_n} jobs your ${f.label.toLowerCase()} runs ${pct}% ${dir} than estimated, so Don now ${effect} for it.`
    + (f.clamped ? ' (Capped — one job was far enough out that it would have skewed everything.)' : '')
}
