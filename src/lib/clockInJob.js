// A punch needs a job, or a deliberate "no job".
//
// Frankie, 2026-10-11, on HHH's September: 1,513 hours punched, 530 of them
// to no job — a third of the labor landing on nothing, so every job margin
// read high. The clock-in buttons let a person start a shift without
// choosing, and most did. Now the choice is required: a job, or Overhead
// (shop time, office, travel between jobs) said out loud. Both pages that
// clock people in go through this one rule.

export const OVERHEAD_NOTE = 'Overhead — no job'

/**
 * What to write on the time_clock row for this choice, or why it cannot be
 * written. `jobId` may be a number, a numeric string, or empty.
 */
export function clockInChoice({ jobId = null, overhead = false } = {}) {
  const id = jobId === '' || jobId == null ? null : Number(jobId)
  if (id != null && Number.isFinite(id) && id > 0) return { ok: true, job_id: id, notes: null }
  if (overhead) return { ok: true, job_id: null, notes: OVERHEAD_NOTE }
  return { ok: false, reason: 'Pick the job you are clocking in to, or choose Overhead for shop, office or travel time.' }
}

/** Is this punch's "no job" the deliberate kind? */
export function isOverheadPunch(entry) {
  return !entry?.job_id && String(entry?.notes || '').includes(OVERHEAD_NOTE)
}

/** Jobs a person can clock in to: not delivered, not cancelled, newest first. */
const CLOSED = new Set(['Completed', 'Job Complete', 'Verified Complete', 'Post Inspection (Req)', 'Invoiced', 'Paid', 'Closed', 'Done', 'Archived', 'Cancelled', 'Canceled', 'Void', 'Voided'])
export function clockableJobs(jobs = []) {
  return (jobs || [])
    .filter(j => j && !CLOSED.has(j.status))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}
