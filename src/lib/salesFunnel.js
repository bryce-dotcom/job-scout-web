// Per-rep sales funnel: Meetings → Estimates sent → Closed.
//
// What a rep gets credit for is decided in ONE place, lib/jobOwnership —
// the same rule the Sales Pipeline and payroll commissions use. This file
// used to keep its own copy that also credited the LEAD OWNER, so a setter or
// office manager who owned the lead was shown closing deals (Tracy Clark: 22
// estimates, 4 closed, on a funnel she was never part of), and the other two
// pages disagreed with it. The header of jobOwnership.js names this file as
// one of the four copies that drifted apart.
//
// The other things the real data taught this page (HHH, 2026-09-15):
//
//   - Closed value read the QUOTE amount. One approved estimate carried
//     $1,651,117.14 for a job whose total is $16,299.20, so the company's
//     year-to-date closed value was $2.9M when the jobs behind it add up to
//     $1.55M. Once an estimate has become a job, the job's total is what was
//     sold — the estimate was the offer — so the job total is the value here.
//   - Draft estimates counted as "written". A third of the year's estimates
//     were drafts nobody had seen, which halved the close rate.
//   - A quote with no rep anywhere simply vanished, from the company totals
//     too: 172 of 524 estimates this year. They now sit on an "Unattributed"
//     row so the totals are the whole company and the gap is visible.
//   - The windows had no end. "This month" counted meetings booked for next
//     month, and "year to date" counted 22 meetings that had not happened.
//   - Job and recurring-job appointments are field work, not sales meetings.
//   - A close counted in the month the ESTIMATE was written, not the month it
//     closed: September read "closed 1, $10,245" while the company had won
//     $229,006 that month, nine of those jobs through estimates sent in August.
//     Closed now counts in the window the deal closed — the job's creation
//     (the dashboard's "won" date) or the estimate's approval — so the two
//     pages describe the same month. Estimates sent stay by their sent date;
//     close rate is closed-this-window over sent-this-window.
//   - And the dashboard counts EVERY job as a sale, estimate or not: 604 of
//     HHH's 695 jobs this year never had one (service calls, recurring visits,
//     jobs booked directly). salesWonBridge shows the dashboard's number
//     beside this page's and names the gap, instead of leaving a reader to
//     wonder which page is wrong.

import { buildLeadIndex, primaryOwnerId } from './jobOwnership'
import { wonJobsInRange, sumJobTotal } from './jobMetrics'

export const UNATTRIBUTED = 'unattributed'
const FIELD_APPOINTMENTS = new Set(['Block', 'Job', 'Recurring Job'])
const key = (v) => (v == null || v === '' ? null : String(v))

// The rep credited for an appointment: the rep it was booked for, else the
// first of several, else the credit owner of the lead it was booked on.
function appointmentRep(a, leadIndex) {
  if (a?.salesperson_id != null) return key(a.salesperson_id)
  if (Array.isArray(a?.salesperson_ids)) {
    const first = a.salesperson_ids.find((v) => v != null)
    if (first != null) return key(first)
  }
  return a?.lead_id != null ? primaryOwnerId({ lead_id: a.lead_id }, leadIndex) : null
}

// The rep credited for a quote: its own rep, else its lead's (jobOwnership),
// else the rep of the job it turned into.
function quoteRep(q, leadIndex, jobsByQuote, jobsById) {
  const own = primaryOwnerId(q, leadIndex)
  if (own) return own
  const job = (q.job_id != null && jobsById.get(key(q.job_id))) || jobsByQuote.get(key(q.id)) || null
  return job ? primaryOwnerId(job, leadIndex) : null
}

export function computeSalesFunnel(
  { appointments = [], quotes = [], leads = [], employees = [], jobs = [] } = {},
  { sinceIso = null, untilIso = null } = {},
) {
  const inWindow = (d) => {
    if (!d) return false
    const s = String(d)
    return (!sinceIso || s >= sinceIso) && (!untilIso || s <= untilIso)
  }
  const empName = new Map((employees || []).filter(Boolean).map((e) => [key(e.id), e.name]))
  const leadIndex = buildLeadIndex(leads)
  const jobsById = new Map((jobs || []).filter(Boolean).map((j) => [key(j.id), j]))
  const jobsByQuote = new Map((jobs || []).filter((j) => j && j.quote_id != null).map((j) => [key(j.quote_id), j]))

  const rows = new Map()
  const row = (id) => {
    const k = id == null ? UNATTRIBUTED : id
    if (!rows.has(k)) {
      rows.set(k, {
        repId: id == null ? null : id,
        repName: id == null ? 'Unattributed' : empName.get(id) || `#${id}`,
        meetings: 0, takeoffs: 0, closed: 0, closedValue: 0,
      })
    }
    return rows.get(k)
  }

  for (const a of appointments || []) {
    if (!a || FIELD_APPOINTMENTS.has(a.appointment_type)) continue
    if (!inWindow(a.start_time || a.created_at)) continue
    const rep = appointmentRep(a, leadIndex)
    if (!rep) continue // a meeting nobody is booked for is not a rep's meeting
    row(rep).meetings++
  }

  for (const q of quotes || []) {
    if (!q || q.status === 'Draft') continue
    const job = (q.job_id != null && jobsById.get(key(q.job_id))) || jobsByQuote.get(key(q.id)) || null
    const sentHere = inWindow(q.created_at)
    const isClosed = q.status === 'Approved' || !!job
    // When it closed: the job's creation (the dashboard's "won" date), else
    // the approval date, else the best the record has — the day it was written.
    const closedHere = isClosed && inWindow(closeDateOf(q, job))
    if (!sentHere && !closedHere) continue
    const r = row(quoteRep(q, leadIndex, jobsByQuote, jobsById))
    if (sentHere) r.takeoffs++
    if (closedHere) {
      r.closed++
      // What was sold: the job's total once there is one, the estimate until then.
      const jobTotal = job ? Number(job.job_total) : NaN
      r.closedValue += Number.isFinite(jobTotal) && jobTotal > 0 ? jobTotal : Number(q.quote_amount) || 0
    }
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      closedValue: Math.round(r.closedValue * 100) / 100,
      closeRate: r.takeoffs ? Math.round((r.closed / r.takeoffs) * 100) : 0,
      takeoffRate: r.meetings ? Math.min(100, Math.round((r.takeoffs / r.meetings) * 100)) : 0,
    }))
    // Reps by results; the unattributed row always last.
    .sort((a, b) => (a.repId == null) - (b.repId == null) || b.closed - a.closed || b.takeoffs - a.takeoffs || b.meetings - a.meetings)
}

/** The day a deal closed, for windowing: job creation, else approval, else the estimate's own date. */
export function closeDateOf(q, job) {
  return job?.created_at || q?.approved_date || q?.created_at || null
}

/**
 * The dashboard's "Sales Won" for the same window — every job created in it,
 * estimate or not — split into the part this page can see (jobs that came
 * through an estimate) and the part it cannot (jobs created without one).
 * Same definition as the dashboard: lib/jobMetrics.wonJobsInRange.
 */
export function salesWonBridge({ jobs = [], quotes = [] } = {}, { sinceIso = null, untilIso = null } = {}) {
  const won = wonJobsInRange(jobs || [], sinceIso, untilIso)
  const quoteIds = new Set((quotes || []).filter(Boolean).map((q) => key(q.id)))
  const quoteJobIds = new Set((quotes || []).filter((q) => q && q.job_id != null).map((q) => key(q.job_id)))
  const quoteAmountById = new Map((quotes || []).filter(Boolean).map((q) => [q.id, q.quote_amount]))
  const via = won.filter((j) => (j.quote_id != null && quoteIds.has(key(j.quote_id))) || quoteJobIds.has(key(j.id)))
  const viaSet = new Set(via)
  const direct = won.filter((j) => !viaSet.has(j))
  const r2 = (n) => Math.round(n * 100) / 100
  return {
    wonCount: won.length, wonTotal: r2(sumJobTotal(won, quoteAmountById)),
    viaEstimateCount: via.length, viaEstimateTotal: r2(sumJobTotal(via, quoteAmountById)),
    directCount: direct.length, directTotal: r2(sumJobTotal(direct, quoteAmountById)),
  }
}

export function funnelTotals(rows) {
  const t = (rows || []).reduce(
    (s, r) => ({ meetings: s.meetings + r.meetings, takeoffs: s.takeoffs + r.takeoffs, closed: s.closed + r.closed, closedValue: s.closedValue + (r.closedValue || 0) }),
    { meetings: 0, takeoffs: 0, closed: 0, closedValue: 0 },
  )
  return { ...t, closedValue: Math.round(t.closedValue * 100) / 100, closeRate: t.takeoffs ? Math.round((t.closed / t.takeoffs) * 100) : 0 }
}

// The window for a named range: a start, and an end of "now" so nothing
// booked for later is counted. `all` has no start.
export function funnelWindow(range, now = new Date()) {
  const untilIso = now.toISOString()
  if (range === 'mtd') return { sinceIso: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), untilIso }
  if (range === 'ytd') return { sinceIso: new Date(now.getFullYear(), 0, 1).toISOString(), untilIso }
  if (range === 'last90') { const d = new Date(now); d.setDate(d.getDate() - 90); return { sinceIso: d.toISOString(), untilIso } }
  return { sinceIso: null, untilIso }
}

// Kept for callers that only want the start.
export function funnelSince(range, now = new Date()) {
  return funnelWindow(range, now).sinceIso
}
