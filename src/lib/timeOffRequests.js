// Sorting time-off requests into what still needs a decision and what is
// already history.
//
// Bryce: "if the request is already past its date how should we handle that?"
//
// Eight of the nine pending requests on HHH have dates that have already gone
// by — the oldest was raised in April for a day in January. That is not a queue
// of things to approve, it is a backlog nobody could act on, and mixing the two
// is why the list reads as noise.
//
// They are NOT hidden. A past request still matters: it is the record of
// whether that day was time off, which is the difference between a paid absence
// and an unexplained gap in someone's hours. Hiding it would quietly decide
// that question. Separating it says the decision is late, not optional.

/** A request whose last day has passed can no longer be planned around. */
export function isPast(request, now = new Date()) {
  const end = request?.end_date || request?.start_date
  if (!end) return false
  const last = new Date(`${String(end).slice(0, 10)}T23:59:59`)
  if (isNaN(last)) return false
  return last < now
}

/** Whole days since the last day of the request. 0 for anything not yet past. */
export function daysOverdue(request, now = new Date()) {
  if (!isPast(request, now)) return 0
  const end = new Date(`${String(request.end_date || request.start_date).slice(0, 10)}T23:59:59`)
  return Math.floor((now - end) / 86400000)
}

/**
 * Split pending requests into the ones still ahead and the ones already gone
 * by, each in the order a person would want to work through them: soonest
 * first for upcoming, longest-waiting first for the backlog.
 */
export function splitPendingRequests(requests = [], now = new Date()) {
  const pending = (requests || []).filter(r => r?.status === 'pending')
  const upcoming = pending.filter(r => !isPast(r, now))
    .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
  const past = pending.filter(r => isPast(r, now))
    .sort((a, b) => String(a.end_date || a.start_date || '').localeCompare(String(b.end_date || b.start_date || '')))
  return { upcoming, past }
}
