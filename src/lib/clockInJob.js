// A punch is charged to a job, or it is overhead — and the ROLE decides,
// never the person at the clock.
//
// Frankie, 2026-10-11, on HHH's September: 1,513 hours punched, 530 of them
// to no job — a third of the labor landing on nothing, so every job margin
// read high. The first fix let the person pick "Overhead" at clock-in.
// Bryce, 2026-10-12: "the first thing field guys will do is use that so they
// don't charge the job and they can get more bonus... the system should be
// using the job description to know whose work is overhead or not."
//
// So: a field role, or anyone on the efficiency bonus, must clock in to a
// job — there is no other button. An office role clocks in and the punch is
// overhead on its own, labelled with the role. Both clock-in pages go
// through this one rule.

/** Roles whose hours belong on a job. Matched on the role name the company
 *  gave the person (Field Tech, Installer, Labor, Lead Tech, Crew Lead…). */
const FIELD_ROLE = /tech|install|labor|labour|crew|foreman|apprentice|helper|operator|journeyman|electrician|plumber|hvac|landscap|mow/i

/** On the crew efficiency bonus: a skill level is set and it is not the
 *  "Not on bonus" level. Bonus is paid on hours SAVED against a job's
 *  allotment, which is exactly why a bonus-eligible person may not park
 *  hours off the job. */
export function onBonus(employee) {
  const lvl = String(employee?.skill_level || '').trim()
  return !!lvl && !/not on bonus|no bonus/i.test(lvl)
}

export function isFieldRole(role) {
  return FIELD_ROLE.test(String(role || ''))
}

/** Must this person's punch carry a job? */
export function mustClockToJob(employee) {
  return isFieldRole(employee?.role) || onBonus(employee)
}

export const OVERHEAD_PREFIX = 'Overhead — '

/**
 * What to write on the time_clock row, or why it cannot be written.
 * `jobId` may be a number, a numeric string, or empty.
 */
export function clockInChoice({ jobId = null, employee = null } = {}) {
  const id = jobId === '' || jobId == null ? null : Number(jobId)
  if (id != null && Number.isFinite(id) && id > 0) return { ok: true, job_id: id, notes: null, overhead: false }
  if (mustClockToJob(employee)) {
    return { ok: false, reason: 'Pick the job you are clocking in to. Your hours are charged to jobs; there is no overhead clock-in for your role.' }
  }
  const role = String(employee?.role || 'Office').trim() || 'Office'
  return { ok: true, job_id: null, notes: `${OVERHEAD_PREFIX}${role}`, overhead: true }
}

/** Is this punch's "no job" the deliberate kind (an office role's hours)? */
export function isOverheadPunch(entry) {
  return !entry?.job_id && String(entry?.notes || '').startsWith(OVERHEAD_PREFIX)
}

/** Jobs a person can clock in to: not delivered, not cancelled, newest first. */
const CLOSED = new Set(['Completed', 'Job Complete', 'Verified Complete', 'Post Inspection (Req)', 'Invoiced', 'Paid', 'Closed', 'Done', 'Archived', 'Cancelled', 'Canceled', 'Void', 'Voided'])
export function clockableJobs(jobs = []) {
  return (jobs || [])
    .filter(j => j && !CLOSED.has(j.status))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}
