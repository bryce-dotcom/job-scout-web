// "Sold" — cumulative, and its own number.
//
// The Sales Won tile sums cards sitting in the Won STAGE right now. That is a
// useful thing to know and a terrible answer to "how much has Cole sold this
// year": not one of his 31 deals is still in Won, so the tile reads $0.00
// against $305,199.43 of real sales.
//
// I shipped this once by REDEFINING Sales Won, which produced a header nobody
// could reconcile with the board and had to be reverted. This time it is a
// separate tile, computed from the jobs themselves rather than from whatever
// cards the board happens to be holding — so it does not silently change when
// the board's fetch changes.
//
// Ownership is lib/jobOwnership's 'credit' scope: the job's salesperson, else
// the lead's. Same rule Payroll pays on, so the two agree.

import { buildLeadIndex, primaryOwnerId } from './jobOwnership'

/**
 * Cumulative sold in a window.
 *
 *   jobs        job rows with created_at, job_total, salesperson_id, lead_id
 *   leads       for the ownership fallback
 *   ownerId     null / 'all' for the whole company
 *   start,end   ISO bounds; end is EXCLUSIVE so months can't double-count
 *
 * A job's created_at is when it was sold — the job exists because someone
 * closed the deal. Dating by start_date (when the work is scheduled) is what
 * put deals in the wrong period before.
 */
export function soldTotal(jobs = [], leads = [], { ownerId = null, start = null, end = null } = {}) {
  const idx = buildLeadIndex(leads)
  const startMs = start ? new Date(start).getTime() : null
  const endMs = end ? new Date(end).getTime() : null
  const scoped = ownerId != null && String(ownerId) !== 'all'

  let total = 0
  let count = 0
  const perOwner = new Map()

  for (const j of jobs || []) {
    if (!j?.created_at) continue
    const t = new Date(j.created_at).getTime()
    if (!Number.isFinite(t)) continue
    if (startMs != null && t < startMs) continue
    if (endMs != null && t >= endMs) continue
    // ONE owner per deal, so per-rep totals partition the company total
    // instead of overlapping. Using "is this rep anywhere on the deal"
    // (jobOwnedBy) counted a job named to Doug whose lead is Cole's for BOTH
    // of them — Cole came out at 55 jobs / $388,078 against a real 31 /
    // $305,199.43, and the rep totals no longer added up to the company.
    const owner = primaryOwnerId(j, idx) ?? 'unattributed'
    if (scoped && String(owner) !== String(ownerId)) continue

    const amt = Number(j.job_total) || 0
    total += amt
    count += 1
    if (!perOwner.has(owner)) perOwner.set(owner, { count: 0, total: 0 })
    const o = perOwner.get(owner); o.count += 1; o.total += amt
  }

  return { count, total: Math.round(total * 100) / 100, perOwner }
}

/** Month-to-date and year-to-date bounds, LOCAL — a Denver rep's "this month"
 *  must not start on the 31st because UTC says so. */
export function periodBounds(range, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  if (range === 'mtd') return { start: new Date(y, m, 1).toISOString(), end: null }
  if (range === 'ytd') return { start: new Date(y, 0, 1).toISOString(), end: null }
  if (range === 'last30') return { start: new Date(now.getTime() - 30 * 86400000).toISOString(), end: null }
  if (range === 'last90') return { start: new Date(now.getTime() - 90 * 86400000).toISOString(), end: null }
  if (range === 'all') return { start: null, end: null }
  return { start: new Date(y, 0, 1).toISOString(), end: null }
}
