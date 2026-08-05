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
