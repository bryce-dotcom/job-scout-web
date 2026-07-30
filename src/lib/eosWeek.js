// EOS scorecard week windows (Mon–Sun).
//
// Extracted from EOS.jsx so the date math is unit-testable — it had a real
// off-by-one that inflated the L10 scorecard (Alayda ec5e049b: "the scorecard
// is off or reading incorrectly").
//
// The bug: startDate/endDate were derived with `.toISOString().slice(0,10)` on
// LOCAL Date objects. Sunday 23:59:59.999 Mountain is Monday 05:59 UTC, so the
// end DATE string came back as the following Monday — every metric that
// compares against a date column (man hours, cash collected, callbacks,
// dollars/hour) ran over an 8-day window. On the week of 2026-07-20 that read
// Cash Collected as $41,200 instead of $11,416.
//
// start/end (absolute ISO instants) were always correct — they describe local
// midnight Monday through local Sunday 23:59:59.999. Only the DATE STRINGS,
// which must stay in local calendar terms, needed fixing.

// Local calendar day as YYYY-MM-DD — never round-trip through UTC for this.
export function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * @param {number} weeksAgo 0 = current (partial) week, 1 = last completed week
 * @param {Date} [now] injectable for tests
 */
export function getWeekRange(weeksAgo = 0, now = new Date()) {
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset - (weeksAgo * 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return {
    start: monday.toISOString(),
    end: sunday.toISOString(),
    startDate: localDayKey(monday),
    endDate: localDayKey(sunday),
    label: `${monday.getMonth() + 1}/${monday.getDate()}`,
  }
}
