// One rule for "is this open punch a shift in progress, or a missed clock-out?"
//
// Field Scout used to answer this with the calendar day: a punch counted as
// yours only if clock_in was after local midnight today. That silently broke
// every shift that crosses midnight. The night crew clocked in at 9pm, and at
// 12:01am the app stopped seeing the punch — no Clock Out button, no running
// timer, they looked clocked out. So they clocked in again and got a duplicate,
// and the real punch stayed open forever.
//
// Measured on company 3 before the fix: punches starting 6pm-4am were left open
// 17.6% of the time (9 of 51). Punches starting 4am-6pm: 0.7% (7 of 1008).
// A 25x difference that lands entirely on the people who work nights.
//
// The replacement rule is elapsed time, not the calendar. Completed shifts run
// a median of 5.1h and p95 of 12h; every recorded shift past 18h is itself a
// missed clock-out (the longest is 817h). So 18h separates the two cases with
// a wide margin on both sides.

/** Past this many hours an open punch is a missed clock-out, not a shift. */
export const MAX_SHIFT_HOURS = 18

/**
 * Is a failed clock-out worth handing to the offline queue, or must it be
 * shown to the tech?
 *
 * Queueing EVERY failure is what burned Cameron: he had full signal, the
 * server rejected the write, and the app told him it was saved and he could
 * put his phone away. The queue then retried something that could never
 * succeed. Waiting for signal only helps when signal is the problem.
 *
 * A PostgREST error carries a `code` — that is the server having considered
 * the request and refused it (RLS, constraint, validation). Never queue those.
 */
export function shouldQueueClockOut(error, { online = true } = {}) {
  if (online === false) return true              // genuinely offline
  if (error?.code) return false                  // server answered, and said no
  const msg = String(error?.message || '')
  return /fetch|network|timeout|connection|offline/i.test(msg)
}

export function hoursOpen(entry, now = new Date()) {
  const started = new Date(entry?.clock_in ?? NaN).getTime()
  if (!Number.isFinite(started)) return Infinity
  return (now.getTime() - started) / 3600000
}

/** True when nobody could still be working this — it needs payroll to correct it. */
export function isAbandoned(entry, now = new Date()) {
  return hoursOpen(entry, now) > MAX_SHIFT_HOURS
}

/**
 * Split open punches into the one still being worked and the ones that were
 * forgotten. Newest wins: if a duplicate was created by the old bug, the punch
 * the tech is actually looking at is the most recent one.
 */
export function splitOpenPunches(rows = [], now = new Date()) {
  const open = (rows || []).filter(r => r && !r.clock_out)
  const live = open
    .filter(r => !isAbandoned(r, now))
    .sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))
  return {
    active: live[0] || null,
    abandoned: open.filter(r => isAbandoned(r, now))
      .sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in)),
    // Extra live punches mean the tech is double-clocked — one shift, two rows.
    duplicates: live.slice(1),
  }
}

// ── Closing a forgotten shift, by the person who knows when it ended ──
//
// The next morning a tech taps Clock In and the one-open-punch rule stops
// them: "close yesterday's shift first". Yesterday's shift was not on their
// screen (today's list), the banner said "no action needed", and Payroll is
// not theirs to open — so Christopher spent five minutes looking for a
// button that did not exist and stayed clocked into the wrong day
// (02e30d0c); London the day before (b25b596a). Only they know when they
// stopped, so ask them, close the shift at that time, flag it for payroll
// to confirm, and let them clock in — one sheet, one tap. The write is the
// same shape as Arnie's shift_close (the Payroll page's write): clock_out,
// total_hours net of lunch, the adjustment trail, the originals kept.

const LOCAL_MINUTE = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * A starting point for the end-time picker: eight hours after the clock-in,
 * never in the future. A tech corrects it; payroll confirms it.
 * @returns 'YYYY-MM-DDTHH:MM' in local time, for a datetime-local input
 */
export function defaultMissedShiftEnd(entry, now = new Date()) {
  const started = new Date(entry?.clock_in ?? NaN).getTime()
  if (!Number.isFinite(started)) return LOCAL_MINUTE(now)
  return LOCAL_MINUTE(new Date(Math.min(started + 8 * 3600000, now.getTime())))
}

/**
 * Why an entered end time cannot be right, or null when it can.
 * @param endedAt Date
 */
export function missedShiftEndProblem(entry, endedAt, now = new Date()) {
  const started = new Date(entry?.clock_in ?? NaN).getTime()
  const ended = endedAt instanceof Date ? endedAt.getTime() : new Date(endedAt ?? NaN).getTime()
  if (!Number.isFinite(ended)) return 'Enter the time you finished.'
  if (!Number.isFinite(started)) return 'This shift has no clock-in time — ask your manager to fix it in Payroll.'
  if (ended <= started) return 'That is before you clocked in.'
  if (ended > now.getTime() + 5 * 60000) return 'That is in the future.'
  if ((ended - started) / 3600000 > MAX_SHIFT_HOURS) return `That would be a ${Math.round((ended - started) / 3600000)}-hour shift. Enter the time you actually stopped.`
  return null
}

/**
 * The update that closes a forgotten shift at the time the tech entered.
 * Flagged for payroll: the number came from memory, the day after.
 */
export function closeMissedShiftPatch(entry, endedAt, { byEmployeeId = null, byName = '', now = new Date() } = {}) {
  const out = endedAt instanceof Date ? endedAt : new Date(endedAt)
  const started = new Date(entry.clock_in)
  let hours = (out.getTime() - started.getTime()) / 3600000
  if (entry.lunch_start && entry.lunch_end) hours -= (new Date(entry.lunch_end) - new Date(entry.lunch_start)) / 3600000
  hours = Math.max(0, Math.round(hours * 100) / 100)
  const stamp = `[MISSED CLOCK-OUT closed ${now.toISOString()} by ${byName || 'the tech'} — end time entered from memory at next clock-in]`
  const patch = {
    clock_out: out.toISOString(),
    total_hours: hours,
    adjusted_by: byEmployeeId ?? null,
    adjusted_at: now.toISOString(),
    adjustment_reason: 'Missed clock-out — end time entered by the tech at next clock-in',
    flagged_for_review: true,
    review_reason: 'Missed clock-out — end time entered by the tech from memory; please confirm the hours',
    notes: entry.notes ? `${entry.notes}\n${stamp}` : stamp,
  }
  if (!entry.original_clock_in) { patch.original_clock_in = entry.clock_in; patch.original_clock_out = null; patch.original_total_hours = null }
  return patch
}
