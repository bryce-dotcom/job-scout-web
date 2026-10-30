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

// Explicit extension: Frankie's context (frankieContext.js) imports this and
// is run under plain Node by the eval runner, which does not resolve
// extensionless specifiers.
import { buildLeadIndex, primaryOwnerId } from './jobOwnership.js'
// What counts as sold — NOT_SOLD_STATUSES, isSoldJob, soldValue, and approved
// estimates that are not a job yet — is one rule shared with the server
// (Frankie's query_sales, Jenny's query_sold). Cancelled work is not sold work;
// a job is worth its own job_total, never its estimate's amount. See the file.
import { NOT_SOLD_STATUSES, isSoldJob, soldValue, soldRowsOf, approvedNotAJobYet, NOT_A_JOB_YET, madeInJobScout, APPROVED_ESTIMATES_SELECT } from '../../supabase/functions/_shared/soldRule.ts'
export { NOT_SOLD_STATUSES, isSoldJob, soldValue, soldRowsOf, approvedNotAJobYet, NOT_A_JOB_YET, madeInJobScout, APPROVED_ESTIMATES_SELECT }

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
/** Every job sold in [start, end). The one filter — date by created_at, because
 *  a job exists only because someone closed the deal. */
export function soldJobsInRange(jobs = [], { start = null, end = null } = {}) {
  const startMs = start ? new Date(start).getTime() : null
  const endMs = end ? new Date(end).getTime() : null
  return (jobs || []).filter((j) => {
    if (!isSoldJob(j)) return false
    const t = new Date(j.created_at).getTime()
    if (!Number.isFinite(t)) return false
    if (startMs != null && t < startMs) return false
    if (endMs != null && t >= endMs) return false
    return true
  })
}

export function soldTotal(jobs = [], leads = [], { ownerId = null, start = null, end = null } = {}) {
  const idx = buildLeadIndex(leads)
  const startMs = start ? new Date(start).getTime() : null
  const endMs = end ? new Date(end).getTime() : null
  const scoped = ownerId != null && String(ownerId) !== 'all'

  let total = 0
  let count = 0
  const perOwner = new Map()

  for (const j of jobs || []) {
    if (!isSoldJob(j)) continue
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

    const amt = soldValue(j)
    total += amt
    count += 1
    if (!perOwner.has(owner)) perOwner.set(owner, { count: 0, total: 0 })
    const o = perOwner.get(owner); o.count += 1; o.total += amt
  }

  return { count, total: Math.round(total * 100) / 100, perOwner }
}

export const UNATTRIBUTED = 'unattributed'

/**
 * Sold, broken out by rep, with the jobs behind each number.
 *
 * This is what a sales manager actually asks for: where are my guys at this
 * month, and what is in that figure. Carrying the jobs means clicking a rep
 * shows the deals themselves rather than firing a second query that could
 * scope differently and disagree with the row it came from — which is how
 * these pages drifted apart in the first place.
 *
 * Every rep who sold anything gets a row, including one with no estimate and
 * no meeting: Sales Performance used to build its rows from the estimate
 * funnel and then drop anyone with neither, so London Miller ($87,223) and
 * Cameron McDonough ($12,569) were simply absent from the year, and
 * Christopher Lyman's 457 jobs showed as $88,880 of the $365,749 he sold.
 *
 *   jobs       job rows: created_at, job_total, status, salesperson_id,
 *              lead_id, and whatever else you want to show in the drill-down
 *   leads      for the ownership fallback (jobs.lead_id is TEXT — jobOwnership
 *              handles it; never join on it yourself)
 *   employees  [{id, name}] to name the rows; a rep who has left still sold it
 */
export function soldByRep(jobs = [], leads = [], { start = null, end = null, employees = [] } = {}) {
  const idx = buildLeadIndex(leads)
  const nameOf = new Map((employees || []).filter(Boolean).map((e) => [String(e.id), e.name]))
  const rows = new Map()

  for (const j of soldJobsInRange(jobs, { start, end })) {
    const owner = primaryOwnerId(j, idx) ?? UNATTRIBUTED
    const k = String(owner)
    if (!rows.has(k)) {
      rows.set(k, {
        ownerId: owner === UNATTRIBUTED ? null : owner,
        name: owner === UNATTRIBUTED ? 'Nobody on the deal' : nameOf.get(k) || `#${k}`,
        count: 0, total: 0, unpriced: 0, viaEstimate: 0, jobs: [],
      })
    }
    const r = rows.get(k)
    const amt = soldValue(j)
    r.count += 1
    r.total += amt
    if (amt === 0) r.unpriced += 1
    if (j.quote_id != null) r.viaEstimate += 1
    r.jobs.push(j)
  }

  const out = [...rows.values()].map((r) => ({
    ...r,
    total: Math.round(r.total * 100) / 100,
    avg: r.count ? Math.round((r.total / r.count) * 100) / 100 : 0,
    // Biggest first, so the drill-down opens on what moved the number.
    jobs: r.jobs.slice().sort((a, b) => soldValue(b) - soldValue(a)),
  }))
  // Reps by what they sold; the nobody row last, where it reads as a gap to
  // close rather than as a person.
  out.sort((a, b) => (a.ownerId == null) - (b.ownerId == null) || b.total - a.total || b.count - a.count)

  const total = Math.round(out.reduce((s, r) => s + r.total, 0) * 100) / 100
  return {
    rows: out,
    total,
    count: out.reduce((s, r) => s + r.count, 0),
    unpriced: out.reduce((s, r) => s + r.unpriced, 0),
  }
}

/** Month-to-date and year-to-date bounds, LOCAL — a Denver rep's "this month"
 *  must not start on the 31st because UTC says so. */
export function periodBounds(range, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  if (range === 'mtd') return { start: new Date(y, m, 1).toISOString(), end: null }
  // Closed at the start of this month, so a manager comparing months is not
  // reading a window that keeps growing under them.
  if (range === 'lastmonth') return { start: new Date(y, m - 1, 1).toISOString(), end: new Date(y, m, 1).toISOString() }
  if (range === 'ytd') return { start: new Date(y, 0, 1).toISOString(), end: null }
  if (range === 'last30') return { start: new Date(now.getTime() - 30 * 86400000).toISOString(), end: null }
  if (range === 'last90') return { start: new Date(now.getTime() - 90 * 86400000).toISOString(), end: null }
  if (range === 'all') return { start: null, end: null }
  return { start: new Date(y, 0, 1).toISOString(), end: null }
}

/**
 * Approved estimates that are not a job yet, read for one company — the rows
 * soldRowsOf adds to the jobs. Checks EVERY job (archived too) for one that
 * points at the estimate, so a page holding only this month's jobs, or the
 * store's live ones, still never counts a deal twice. Returns [] on any error:
 * the jobs figure stands on its own.
 */
export async function fetchApprovedNotAJobYet(supabase, companyId) {
  if (!supabase || !companyId) return []
  try {
    const { data: quotes, error } = await supabase.from('quotes').select(APPROVED_ESTIMATES_SELECT)
      .eq('company_id', companyId).eq('status', 'Approved').is('job_id', null).limit(1000)
    if (error || !quotes?.length) return []
    const mine = quotes.filter(madeInJobScout)
    if (!mine.length) return []
    const { data: linked, error: e2 } = await supabase.from('jobs').select('quote_id')
      .eq('company_id', companyId).in('quote_id', mine.map((q) => q.id))
    if (e2) return []
    return approvedNotAJobYet(mine, linked || [])
  } catch { return [] }
}
