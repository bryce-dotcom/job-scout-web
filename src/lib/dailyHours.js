// Per-day hours inside a pay period.
//
// London: "Ability to see the hours clocked each day of the pay period."
// My Pay only showed a period TOTAL plus "N time entries logged this pay
// period. Full detail on the Time Clock page." — so a tech couldn't check a
// single day's hours without leaving the page. (Viewing past pay periods,
// the second half of the request, already worked via the period arrows.)
//
// Day bucketing goes through zonedDayKey: clock_in is a timestamp, and a
// 6pm Mountain shift is the NEXT day in UTC. Bucketing on the raw ISO string
// would scatter evening work onto the wrong day — the same class of bug that
// drifted leads and inflated the EOS scorecard.

import { zonedDayKey, DEFAULT_TZ } from './dateTz'

/** Hours on one entry: prefer the stored total, else derive from the clock pair. */
export function entryHours(e) {
  const stored = Number(e?.total_hours)
  if (Number.isFinite(stored) && stored > 0) return stored
  if (e?.clock_in && e?.clock_out) {
    const h = (new Date(e.clock_out) - new Date(e.clock_in)) / 36e5
    return Number.isFinite(h) && h > 0 ? h : 0
  }
  return 0
}

/** An entry that was never clocked out — hours unknown, and it should be
 *  visible rather than silently counted as zero. */
export function isOpenShift(e) {
  return !!e?.clock_in && !e?.clock_out
}

/**
 * Group time entries into one row per calendar day, newest first.
 * @returns Array<{ dayKey, hours, entries, hasOpenShift }>
 */
export function groupHoursByDay(timeEntries = [], tz = DEFAULT_TZ) {
  const byDay = new Map()
  for (const e of timeEntries || []) {
    const stamp = e?.clock_in || e?.date
    if (!stamp) continue
    // A bare YYYY-MM-DD date column is already local — don't shift it.
    const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(stamp))
      ? String(stamp)
      : zonedDayKey(stamp, tz)
    if (!dayKey) continue
    if (!byDay.has(dayKey)) byDay.set(dayKey, { dayKey, hours: 0, entries: 0, hasOpenShift: false })
    const row = byDay.get(dayKey)
    row.hours += entryHours(e)
    row.entries += 1
    if (isOpenShift(e)) row.hasOpenShift = true
  }
  return [...byDay.values()]
    .map((r) => ({ ...r, hours: Math.round(r.hours * 100) / 100 }))
    .sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0))
}

/** Total across the grouped rows — matches the sum of what's displayed. */
export function totalFromDays(days = []) {
  return Math.round((days || []).reduce((s, d) => s + (Number(d.hours) || 0), 0) * 100) / 100
}
