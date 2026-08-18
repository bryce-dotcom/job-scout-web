// What a typed-in time entry is allowed to say.
//
// Hours reach a job two ways: a tech punches the clock, or an admin opens the
// job and types a number into "Add Time". The typed path had no validation at
// all, and it shows in the data:
//
//   job 12798, 21 Apr, 55.52h   typed against FIVE different employees —
//                               the whole job's hours put on each crew member
//   17 entries over 16 hours
//   one entry of -3
//
// Those numbers now feed job cost and bonuses, so the box they are typed into
// has to push back. A person typing 55.52 into an hours field is not lying,
// they are recording a job total in a per-person box — the field should say so
// rather than accept it silently.

/** Nobody works more than this in one day. Above it, the number means
 *  something else — usually the whole crew's hours, or the whole job's. */
export const MAX_ENTRY_HOURS = 16

/**
 * Check one typed entry.
 * Returns { ok } or { ok: false, error } with a message written for the person
 * typing, naming what to do instead.
 */
export function validateTimeEntry({ employee_id, hours } = {}) {
  if (!employee_id) return { ok: false, error: 'Choose who the time is for.' }

  const n = typeof hours === 'number' ? hours : parseFloat(hours)
  if (!Number.isFinite(n)) return { ok: false, error: 'Enter the hours as a number.' }
  if (n === 0) return { ok: false, error: 'Enter more than 0 hours.' }
  if (n < 0) {
    return { ok: false, error: 'Hours cannot be negative. To take time off a job, edit or delete the entry that added it.' }
  }
  if (n > MAX_ENTRY_HOURS) {
    return {
      ok: false,
      error: `${n}h is more than one person can work in a day. If this is the whole crew's time, ` +
        `add it per person — one entry each — so the job costs and bonuses come out right.`,
    }
  }
  return { ok: true }
}
