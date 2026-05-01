// Centralized job-metrics calculation.
//
// One source of truth for "Sales Won" and "Jobs Complete" so the dashboard,
// the sales pipeline page, the EOS scoreboard, and any future report all
// agree on what counts and when it counted.
//
// The two events we measure:
//
//   1. WON — A deal entered the work queue. Two paths into this state, both
//      result in a row in the `jobs` table:
//        a) An estimate gets approved and auto-converts to a job
//        b) A job is created fresh (service call, recurring, no quote step)
//      So: a job's `created_at` IS the win timestamp. No status filter needed
//      — every job in the table represents a "won" deal.
//
//   2. DELIVERED — A job moved into a terminal-ish status (Completed,
//      Verified Complete, Post Inspected, Invoiced, Closed — whatever the
//      company has flagged with category='delivered' in their settings).
//      Timestamp: `last_status_change_at` (set by a DB trigger whenever
//      status changes), gated by current status being in the delivered set.
//
// IMPORTANT: status sets are NOT hardcoded. Each company defines their own
// pipeline in /settings → job_statuses, and each status carries a `category`
// field ('open' | 'delivered'). This helper resolves that config at call
// time so custom pipelines work automatically.

/** Pull the set of delivered status IDs from a company's job_statuses config. */
export function getDeliveredStatusIds(jobStatuses) {
  if (!Array.isArray(jobStatuses)) return new Set()
  return new Set(
    jobStatuses
      .filter(s => s && s.category === 'delivered')
      .map(s => s.id || s.name)
      .filter(Boolean)
  )
}

/** Inverse — every status that is NOT delivered. Used for "open work" tallies. */
export function getOpenStatusIds(jobStatuses) {
  if (!Array.isArray(jobStatuses)) return new Set()
  return new Set(
    jobStatuses
      .filter(s => s && s.category !== 'delivered')
      .map(s => s.id || s.name)
      .filter(Boolean)
  )
}

/** Convert a Date|string|null to ms, or null. Defensive against bad data. */
function ms(d) {
  if (!d) return null
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * "Sales Won in this window" — jobs whose `created_at` falls in [start, end).
 * Pass a Date or ISO string for either bound; null = unbounded that side.
 *
 * Returns the matching jobs (caller decides whether to .length or .reduce on
 * job_total). We prefer returning the array over returning aggregates so
 * callers can render counts AND dollars from one filter pass.
 */
export function wonJobsInRange(jobs, startDate, endDate) {
  const startMs = ms(startDate)
  const endMs = ms(endDate)
  if (!Array.isArray(jobs)) return []
  return jobs.filter(j => {
    const t = ms(j.created_at)
    if (t == null) return false
    if (startMs != null && t < startMs) return false
    if (endMs != null && t >= endMs) return false
    return true
  })
}

/**
 * "Jobs Delivered in this window" — jobs currently in a delivered status
 * whose `last_status_change_at` falls in [start, end).
 *
 * Pass the company's `jobStatuses` settings array so the delivered set is
 * resolved at call time (custom pipelines just work).
 *
 * Falls back to `updated_at` for jobs that don't yet have
 * `last_status_change_at` (the trigger backfill set that for existing rows,
 * but defensive coding helps if you query a stale store snapshot).
 */
export function deliveredJobsInRange(jobs, jobStatuses, startDate, endDate) {
  const delivered = getDeliveredStatusIds(jobStatuses)
  if (delivered.size === 0 || !Array.isArray(jobs)) return []
  const startMs = ms(startDate)
  const endMs = ms(endDate)
  return jobs.filter(j => {
    if (!delivered.has(j.status)) return false
    const t = ms(j.last_status_change_at) ?? ms(j.updated_at)
    if (t == null) return false
    if (startMs != null && t < startMs) return false
    if (endMs != null && t >= endMs) return false
    return true
  })
}

/** Sum job_total over a list of jobs. */
export function sumJobTotal(jobs) {
  return (jobs || []).reduce((s, j) => s + (parseFloat(j.job_total) || 0), 0)
}

// ── Common date windows ─────────────────────────────────────────────────────

export function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export function startOfYear(now = new Date()) {
  return new Date(now.getFullYear(), 0, 1)
}

export function daysAgo(n, now = new Date()) {
  return new Date(now.getTime() - n * 24 * 3600 * 1000)
}
