// Telling a missed clock-out from someone who is simply still working.
//
// The old rule was "open for more than 12 hours = missed clock-out". That
// assumes a day shift. London, Mike and Derrick work nights and swing —
// roughly one shift in seven starts after 5pm — so a 13-hour swing shift got
// called a ghost while a genuinely abandoned punch could look normal.
//
// There is a signal that does not care what shift someone works: if the same
// employee has clocked in AGAIN since, the earlier punch is abandoned. Nobody
// is on two clocks at once. That is proof, not a guess, and it holds for day,
// night, swing and split shifts alike.
//
// Everything else is graded against how long that person's shifts actually
// run, rather than one company-wide number.

export const SUPERSEDED = 'superseded'   // a newer clock-in exists — definitely abandoned
export const OVERRUN = 'overrun'         // far longer than this person ever works
export const LONG = 'long'               // longer than usual, but plausible
export const RUNNING = 'running'         // normal; leave it alone

/** Median shift length for an employee, from their completed shifts.
 *  Returns null when there isn't enough history to judge. */
export function typicalShiftHours(completedRows = [], employeeId) {
  const hrs = (completedRows || [])
    .filter(r => String(r.employee_id) === String(employeeId))
    .map(r => Number(r.total_hours) || 0)
    // Drop absurd values — they are themselves un-fixed ghosts and would
    // drag the median up until nothing ever looked wrong.
    .filter(h => h > 0 && h <= 24)
    .sort((a, b) => a - b)
  if (hrs.length < 3) return null
  return hrs[Math.floor(hrs.length / 2)]
}

/**
 * Classify one open punch.
 *   openRow        the punch with no clock_out
 *   allPunches     every punch for the company (to find a later clock-in)
 *   completedRows  completed punches, for the person's normal shift length
 *   now            ms timestamp
 */
export function classifyOpenPunch(openRow, allPunches = [], completedRows = [], now = Date.now()) {
  if (!openRow?.clock_in) return { level: RUNNING, hours: 0, reason: '' }
  const startedMs = new Date(openRow.clock_in).getTime()
  if (!Number.isFinite(startedMs)) return { level: RUNNING, hours: 0, reason: '' }
  const hours = (now - startedMs) / 36e5

  // 1. Proof: did they clock in again after this?
  const later = (allPunches || []).find(p =>
    p && String(p.id) !== String(openRow.id) &&
    String(p.employee_id) === String(openRow.employee_id) &&
    p.clock_in && new Date(p.clock_in).getTime() > startedMs)
  if (later) {
    return {
      level: SUPERSEDED, hours, supersededBy: later.id,
      reason: 'They clocked in again after this — this shift was never closed',
    }
  }

  // 2. Judge against their OWN normal shift, not a company-wide number.
  const typical = typicalShiftHours(completedRows, openRow.employee_id)
  if (typical) {
    // Absolute ceiling as well as a personal one: nobody works past 18 hours,
    // so a punch beyond that is an overrun however long their usual shift is.
    // Without this Mike's 20-hour Sunday punch read as merely "long" purely
    // because his median is high.
    if (hours > 18 || hours > typical * 2.5) {
      return { level: OVERRUN, hours, typical, reason: `Running ${hours.toFixed(1)}h — they normally work about ${typical.toFixed(1)}h` }
    }
    if (hours > Math.max(typical * 1.6, 12)) {
      return { level: LONG, hours, typical, reason: `Running ${hours.toFixed(1)}h — longer than their usual ${typical.toFixed(1)}h, but they may still be on shift` }
    }
    return { level: RUNNING, hours, typical, reason: '' }
  }

  // 3. No history: fall back to a threshold generous enough for a swing shift.
  if (hours > 18) return { level: OVERRUN, hours, reason: `Running ${hours.toFixed(1)}h with no clock-out` }
  if (hours > 14) return { level: LONG, hours, reason: `Running ${hours.toFixed(1)}h — check whether they are still on shift` }
  return { level: RUNNING, hours, reason: '' }
}

/** Punches an admin should actually be shown, worst first. RUNNING is
 *  excluded — surfacing someone who is simply still working is what made
 *  the night crew look broken. */
export function needsAttention(openRows = [], allPunches = [], completedRows = [], now = Date.now()) {
  const order = { [SUPERSEDED]: 0, [OVERRUN]: 1, [LONG]: 2 }
  return (openRows || [])
    .map(r => ({ ...r, _classification: classifyOpenPunch(r, allPunches, completedRows, now) }))
    .filter(r => r._classification.level !== RUNNING)
    .sort((a, b) => {
      const d = order[a._classification.level] - order[b._classification.level]
      return d !== 0 ? d : b._classification.hours - a._classification.hours
    })
}
