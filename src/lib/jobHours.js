// One answer to "how many hours went into this job".
//
// There were three, and they disagreed:
//
//   time_clock        real punches. What the bonus calc reads, and the only
//                     thing it reads.
//   time_log          75 legacy rows. Invisible to bonuses — yet for 43 of
//                     them there is no punch at all, so they are the ONLY
//                     record that the work happened.
//   jobs.time_tracked denormalised, and written by nothing in the codebase.
//                     On 175 W Warehouse it reads 697.27 against 1,249.30
//                     hours of real punches.
//
// Alayda saw both halves of this. On Peter & Robin Berger the same 8.84-hour
// shift exists as a punch AND as a legacy row, and JobDetail concatenated the
// two stores — so the job read 17.68 while the bonus read 8.84. On 175 W
// Warehouse she said there should be no bonus at all, and she was right: the
// job is 441 hours OVER its allotment once the real punches are counted.
//
// This merges the two real stores into time_clock's own shape, so everything
// downstream — computeJobBonusRows, timeClockToJobHours, the crew split — is
// untouched and its tests still hold. The fix is what goes IN, not the maths.
//
// time_log is NOT dropped. Deleting it would erase the only record of 43 jobs'
// hours.

/** Two records describe the same work if they sit on the same job for the same
 *  person and the hours agree. Legacy rows carry a date that was rewritten
 *  during import (Berger's punch is 26 May; its legacy twin says 3 Aug), so
 *  the date cannot be part of the test. */
const DUP_EPSILON = 0.02

// time_log is not clean per-person data. Verified in the table:
//   job 12798 on 2026-04-21 carries 55.52h against FIVE employees — a job
//     total copied onto each crew member, not five 55-hour days
//   17 rows exceed 16 hours; one is -3
//   only 45 of 75 rows look like a plausible person-shift
// So a legacy row has to earn its place before it can affect anything.
const MAX_LEGACY_SHIFT_HOURS = 16

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Hours a legacy row represents, tolerating the shapes seen in the table. */
export function legacyRowHours(row) {
  const direct = num(row?.hours)
  if (direct > 0) return direct
  if (row?.clock_in_time && row?.clock_out_time) {
    const h = (new Date(row.clock_out_time) - new Date(row.clock_in_time)) / 36e5
    return h > 0 ? h : 0
  }
  return 0
}

/**
 * Is this legacy row already represented by a punch?
 *
 * Matched on job + hours, and on employee only when BOTH sides name one — a
 * legacy row with no employee_id must still be recognised as a duplicate
 * rather than counted twice.
 */
export function isDuplicateOfPunch(legacy, punches = []) {
  const hours = legacyRowHours(legacy)
  if (!(hours > 0)) return true      // nothing to add either way
  return (punches || []).some((p) => {
    if (String(p?.job_id) !== String(legacy?.job_id)) return false
    const bothNameEmployee = p?.employee_id != null && legacy?.employee_id != null
    if (bothNameEmployee && String(p.employee_id) !== String(legacy.employee_id)) return false
    const punchHours = num(p?.total_hours) > 0
      ? num(p.total_hours)
      : (p?.clock_in && p?.clock_out ? (new Date(p.clock_out) - new Date(p.clock_in)) / 36e5 : 0)
    return Math.abs(punchHours - hours) < DUP_EPSILON
  })
}

/**
 * Every hour record for these jobs, in time_clock's shape, counted once.
 *
 * Punches pass through untouched — so with no legacy rows this returns exactly
 * its input, and nothing downstream can behave differently from today.
 * Legacy rows join as synthetic punches only when no punch already covers them.
 */
export function mergeJobHourSources({ timeClock = [], timeLog = [] } = {}) {
  const punches = (timeClock || []).filter(Boolean)

  // Identical hours on the same job and day for more than one person is a job
  // total that was stamped onto the crew. Counting it per employee multiplies
  // the job by the crew size — 277 hours on job 12798 alone.
  const crewStamp = new Set()
  const seen = new Map()
  for (const t of (timeLog || [])) {
    if (!t?.job_id) continue
    const key = `${t.job_id}|${String(t.date || '').slice(0, 10)}|${legacyRowHours(t)}`
    const who = seen.get(key)
    if (who != null && String(who) !== String(t.employee_id)) crewStamp.add(key)
    else seen.set(key, t.employee_id)
  }

  const extra = []
  for (const legacy of (timeLog || [])) {
    if (!legacy?.job_id) continue                       // not attached to a job
    const hrs = legacyRowHours(legacy)
    // Implausible as one person's shift — reject rather than inflate a job.
    if (!(hrs > 0) || hrs > MAX_LEGACY_SHIFT_HOURS) continue
    if (crewStamp.has(`${legacy.job_id}|${String(legacy.date || '').slice(0, 10)}|${hrs}`)) continue
    if (isDuplicateOfPunch(legacy, punches)) continue
    const hours = legacyRowHours(legacy)
    if (!(hours > 0)) continue
    extra.push({
      // Shaped like a punch so every existing consumer reads it without change.
      id: `legacy-${legacy.id}`,
      employee_id: legacy.employee_id ?? null,
      job_id: legacy.job_id,
      total_hours: hours,
      clock_in: legacy.clock_in_time || legacy.date || null,
      clock_out: legacy.clock_out_time || null,
      _source: 'time_log',
      _legacy_id: legacy.id,
    })
  }
  return [...punches, ...extra]
}

/** Total hours on one job, counted once. */
export function hoursForJob(jobId, sources = {}) {
  return mergeJobHourSources(sources)
    .filter((r) => String(r.job_id) === String(jobId))
    .reduce((sum, r) => {
      const h = num(r.total_hours) > 0
        ? num(r.total_hours)
        : (r.clock_in && r.clock_out ? (new Date(r.clock_out) - new Date(r.clock_in)) / 36e5 : 0)
      return sum + (h > 0 ? h : 0)
    }, 0)
}

/**
 * What would change if typed hours counted.
 *
 * The same merge the ledger uses, run side by side with today's punch-only
 * total, so the Payroll screen can show the difference BEFORE any bonus moves.
 * Returns one row per job whose hours change, newest impact first.
 *
 * Pure — reads nothing, writes nothing.
 */
export function previewTypedHourImpact({ jobs = [], timeClock = [], timeLog = [], bonuses = [] } = {}) {
  const group = (rows) => {
    const m = new Map()
    for (const r of rows || []) {
      if (r?.job_id == null) continue
      const k = String(r.job_id)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return m
  }
  const hours = (rows) => (rows || []).reduce((s, r) => {
    const h = parseFloat(r.total_hours)
    if (Number.isFinite(h) && h > 0) return s + h
    if (r.clock_in && r.clock_out) {
      const span = (new Date(r.clock_out) - new Date(r.clock_in)) / 36e5
      return s + (span > 0 ? span : 0)
    }
    return s
  }, 0)

  const punchBy = group(timeClock)
  const typedBy = group(timeLog)
  const jobById = new Map((jobs || []).map(j => [String(j.id), j]))
  const out = []

  for (const [jobKey, typedRows] of typedBy) {
    const punches = punchBy.get(jobKey) || []
    const before = hours(punches)
    const after = hours(mergeJobHourSources({ timeClock: punches, timeLog: typedRows }))
    const added = after - before
    if (Math.abs(added) < 0.01) continue

    const job = jobById.get(jobKey)
    const allotted = Number(job?.allotted_time_hours) || 0
    const jobBonuses = (bonuses || []).filter(b => String(b.job_id) === jobKey)
    out.push({
      job_id: job?.id ?? jobKey,
      label: job?.job_title || job?.job_id || `Job ${jobKey}`,
      allotted,
      punchHours: before,
      typedHours: added,
      totalHours: after,
      savedBefore: allotted - before,
      savedAfter: allotted - after,
      bonusNow: jobBonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0),
      // A paid row is frozen by the ledger, so it cannot change whatever happens.
      frozen: jobBonuses.some(b => b.status === 'paid'),
      // How many typed entries the guards refused — duplicates of a punch,
      // whole-job totals stamped on a crew, or implausible values.
      refusedEntries: typedRows.length -
        mergeJobHourSources({ timeClock: punches, timeLog: typedRows }).filter(r => r._source === 'time_log').length,
    })
  }
  return out.sort((a, b) => b.typedHours - a.typedHours)
}
