// When a repeating job falls next. ONE definition.
//
// Bryce (c8a96621): "When a reacurring job is put on the schedule I can't see
// it the next month. At least show tentative appointment for the next month or
// recurring"
//
// Nothing is broken — the next occurrence genuinely does not exist yet. The DB
// trigger spawn_next_recurring_job creates it when the current one is marked
// Completed, deliberately: an earlier engine spawned eagerly and produced two
// of everything. So the calendar has nothing to draw for next month, because
// there is no row.
//
// The answer is to draw it without creating it. These are projections, not
// jobs: no row, no id, nothing to dispatch, nothing that can be double-billed.
//
// The arithmetic already existed inside RecurrencePicker, which previews the
// next six dates as you set a job up. It lived in the component, so the
// calendar could not reach it. Now it lives here and the picker imports it —
// one rule, so the dates a rep is promised when scheduling are the dates the
// calendar shows.

/** Add months, clamping a day that the target month does not have (31 Jan -> 28 Feb). */
export function addMonths(date, n) {
  const x = new Date(date.getTime())
  const day = x.getDate()
  x.setMonth(x.getMonth() + n)
  if (x.getDate() < day) x.setDate(0)
  return x
}

/** The next date after `date` for a given recurrence. Unknown values fall back to weekly. */
export function addInterval(date, recurrence) {
  const x = new Date(date.getTime())
  switch (recurrence) {
    case 'Daily': x.setDate(x.getDate() + 1); return x
    case 'Weekly': x.setDate(x.getDate() + 7); return x
    case 'Bi-Weekly': x.setDate(x.getDate() + 14); return x
    case 'Every 6 Weeks': x.setDate(x.getDate() + 42); return x
    case 'Monthly': return addMonths(date, 1)
    case 'Bi-Monthly': return addMonths(date, 2)
    case 'Quarterly': return addMonths(date, 3)
    case 'Bi-Annually': return addMonths(date, 6)
    case 'Annually': return addMonths(date, 12)
    default: x.setDate(x.getDate() + 7); return x
  }
}

export const REPEATS = (recurrence) => !!recurrence && recurrence !== 'None'

/**
 * Dates this job would fall on, starting AT `from` and running to `through`.
 *
 * Includes the start date itself, which is what the picker's preview shows.
 * `max` is a hard stop so a daily job across a wide window cannot generate
 * thousands of ghosts.
 */
export function occurrenceDates(startDate, recurrence, { through, endDate = null, max = 60 } = {}) {
  if (!REPEATS(recurrence) || !startDate) return []
  const start = startDate instanceof Date ? new Date(startDate.getTime()) : new Date(startDate)
  if (isNaN(start)) return []
  const limit = through instanceof Date ? through : new Date(through)
  if (isNaN(limit)) return []
  // A series that has already ended must not be projected past its last day.
  const hardEnd = endDate ? new Date(`${String(endDate).slice(0, 10)}T23:59:59`) : null

  const out = []
  let d = start
  for (let i = 0; i < max; i++) {
    if (d > limit) break
    if (hardEnd && d > hardEnd) break
    out.push(new Date(d.getTime()))
    const next = addInterval(d, recurrence)
    // Defensive: an interval that fails to advance would spin to `max`.
    if (next <= d) break
    d = next
  }
  return out
}

/**
 * The projected occurrences AFTER the one that already exists as a job row.
 *
 * The live job draws itself; these are the tentative ones behind it. Returning
 * the real occurrence too would put two boxes on the same day — the exact bug
 * just fixed on the calendar.
 */
export function futureOccurrences(startDate, recurrence, opts = {}) {
  const all = occurrenceDates(startDate, recurrence, opts)
  return all.slice(1)
}
