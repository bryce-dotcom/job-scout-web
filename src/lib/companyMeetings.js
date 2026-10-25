/**
 * The company meeting schedule, derived.
 *
 * Bryce, 2026-10-25: "there is a place to set up your cadence in the eos it
 * just needs to translate to the company calendar and it needs to be maluble
 * in the chace we need to change something."
 *
 * The cadence has always been there — `settings.eos_meeting_cadences`, edited
 * on the EOS page, holding {l10_day, l10_time, quarterly_next, annual_next}.
 * Nothing carried it anywhere. This is the translation.
 *
 * THE SHAPE, AND WHY IT IS THIS ONE.
 *
 * The weekly L10 is a RULE ("every Monday at 08:30"), not a list of meetings.
 * Writing out a row per week would need a spawner, a backfill, and would give
 * two places the right to disagree about when the meeting is — which is the
 * exact failure the recurring-jobs engine was rebuilt to kill.
 *
 * So the series is DERIVED here, the same way the calendar already draws
 * projected repeats of recurring jobs without creating them. The
 * `company_meetings` table holds only what a rule cannot express: a single
 * occurrence moved or cancelled, and one-off meetings that were never part of
 * any series.
 *
 * The consequence is the one Bryce asked for: change the day in EOS and every
 * untouched occurrence follows, while the fortnight you deliberately moved
 * around a holiday stays where you put it.
 */

// Sunday-first, matching JS getDay() and the calendar's own DOW header.
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * The three EOS meetings, plus the one-off.
 *
 * Durations are the EOS defaults the agenda builders already assume —
 * _shared/quarterlyAgenda.ts holds QUARTERLY_SHAPE at 8.5h and ANNUAL_SHAPE at
 * 12.5h across two days — so a block drawn here is the length of the document
 * that gets sent for it rather than a number invented in the UI.
 */
export const MEETING_SERIES = {
  l10: { id: 'l10', label: 'L10 Meeting', minutes: 90, repeat: 'Weekly' },
  quarterly: { id: 'quarterly', label: 'Quarterly Session', minutes: 510, repeat: 'Quarterly' },
  annual: { id: 'annual', label: 'Annual Session', minutes: 750, repeat: 'Annually' },
  custom: { id: 'custom', label: 'Meeting', minutes: 60, repeat: null },
}

/** 'YYYY-MM-DD' from anything date-ish, with no timezone conversion. */
export const dayKey = (v) => String(v || '').slice(0, 10)

/**
 * A Date at MIDDAY on the given day key.
 *
 * Midday rather than midnight on purpose: the hour either side of midnight is
 * where a DST shift lands a date on the day before, and this file does nothing
 * but step across days. It is the same reason expandDateRange in
 * companyCalendar.js parses with 'T12:00:00'.
 */
const atMidday = (key) => {
  const k = dayKey(key)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return null
  const d = new Date(`${k}T12:00:00`)
  return isNaN(d) ? null : d
}

const keyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x }

/**
 * Add months, clamping to the end of a short month.
 *
 * A quarterly anchored on the 31st must not skid into the 1st of the month
 * after — setMonth does that silently, and the meeting would drift a day
 * further every time it crossed a short month.
 */
const addMonths = (d, n) => {
  const x = new Date(d.getTime())
  const day = x.getDate()
  x.setDate(1)
  x.setMonth(x.getMonth() + n)
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  x.setDate(Math.min(day, last))
  return x
}

/** '08:30' → '8:30 AM'. Blank in, blank out. */
export function formatTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '').trim())
  if (!m) return ''
  let h = Number(m[1])
  const min = m[2]
  if (h < 0 || h > 23) return ''
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${min} ${suffix}`
}

/**
 * Every occurrence of a weekday between two day keys, inclusive.
 *
 * Bounded by the window rather than by a count: a month holds four or five of
 * them and the caller never asks for more than a month at a time, so there is
 * nothing here that can run away.
 */
function weekdayOccurrences(weekdayName, fromKey, throughKey) {
  const target = DOW_NAMES.indexOf(String(weekdayName || '').trim())
  if (target < 0) return []
  const start = atMidday(fromKey)
  const end = atMidday(throughKey)
  if (!start || !end || end < start) return []

  // Walk forward to the first matching weekday on or after `from`.
  let d = start
  const delta = (target - d.getDay() + 7) % 7
  if (delta) d = addDays(d, delta)

  const out = []
  let guard = 0
  while (d <= end && guard++ < 400) {
    out.push(keyOf(d))
    d = addDays(d, 7)
  }
  return out
}

/**
 * Every occurrence of a month-stepped series that lands inside the window.
 *
 * It walks from the stored anchor, which is routinely in the PAST — HHH's
 * quarterly_next has read 2026-10-10 since before that date passed, and the
 * EOS page just counts down into the negative. Stepping forward from the
 * anchor means a lapsed date still produces the right future sessions instead
 * of nothing at all.
 */
function monthlyOccurrences(anchorKey, stepMonths, fromKey, throughKey) {
  const anchor = atMidday(anchorKey)
  const start = atMidday(fromKey)
  const end = atMidday(throughKey)
  if (!anchor || !start || !end || end < start || stepMonths < 1) return []

  // Every occurrence is measured from the ANCHOR, never from the one before
  // it. Stepping iteratively makes the month-end clamp stick: a quarterly
  // anchored on the 31st lands on 30 April, and a walk that continues from
  // there is on the 30th for good. Counted from the anchor it returns to the
  // 31st the moment a month is long enough to hold it.
  const monthsApart = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  const at = (n) => addMonths(anchor, n * stepMonths)

  // Jump most of the way in one step rather than walking from an anchor that
  // may be years back, then correct — the estimate can be a step out either
  // way because of the day-of-month.
  let n = Math.max(0, Math.floor(monthsApart(anchor, start) / stepMonths))
  let guard = 0
  while (n > 0 && at(n - 1) >= start && guard++ < 600) n -= 1
  while (at(n) < start && guard++ < 600) n += 1

  const out = []
  while (guard++ < 600) {
    const d = at(n)
    if (d > end) break
    out.push(keyOf(d))
    n += 1
  }
  return out
}

const overrideKey = (kind, seriesDate) => `${kind}|${dayKey(seriesDate)}`

/**
 * The meetings that fall between two day keys.
 *
 * @param cadence   settings.eos_meeting_cadences — {l10_day, l10_time, quarterly_next, annual_next}
 * @param overrides rows from company_meetings
 * @param window    { from: 'YYYY-MM-DD', through: 'YYYY-MM-DD' }
 *
 * Each result: { key, seriesKind, seriesDate, date, time, title, minutes,
 *                moved, custom, overrideId }
 *
 * `seriesDate` is the date the occurrence would NORMALLY fall on, and it is
 * what an edit writes back as the join key. It survives the move — if it were
 * updated to the new date, the occurrence being overridden would reappear on
 * the original day and you would have the meeting twice.
 */
export function deriveMeetings(cadence, overrides = [], { from, through } = {}) {
  const fromKey = dayKey(from)
  const throughKey = dayKey(through)
  if (!fromKey || !throughKey) return []

  const c = cadence || {}
  const rows = Array.isArray(overrides) ? overrides : []

  // Index the exceptions by the occurrence they replace. One-offs carry no
  // series_date and are emitted on their own below.
  const byOccurrence = new Map()
  for (const r of rows) {
    if (!r || !r.series_date) continue
    byOccurrence.set(overrideKey(r.series_kind, r.series_date), r)
  }

  const out = []

  const addDerived = (kind, dates) => {
    for (const d of dates) {
      // An occurrence with an exception is not drawn from the rule. It is
      // drawn from the row, below, where its real date decides whether it
      // belongs in this window at all — a meeting moved into next month must
      // leave this one.
      if (byOccurrence.has(overrideKey(kind, d))) continue
      const s = MEETING_SERIES[kind]
      out.push({
        key: `meeting-${kind}-${d}`,
        seriesKind: kind,
        seriesDate: d,
        date: d,
        time: kind === 'l10' ? (c.l10_time || '') : '',
        title: s.label,
        minutes: s.minutes,
        moved: false,
        custom: false,
        overrideId: null,
      })
    }
  }

  if (c.l10_day) addDerived('l10', weekdayOccurrences(c.l10_day, fromKey, throughKey))
  if (c.quarterly_next) addDerived('quarterly', monthlyOccurrences(c.quarterly_next, 3, fromKey, throughKey))
  if (c.annual_next) addDerived('annual', monthlyOccurrences(c.annual_next, 12, fromKey, throughKey))

  // The exceptions and the one-offs, placed by where they ACTUALLY land.
  for (const r of rows) {
    if (!r || r.cancelled) continue
    const d = dayKey(r.meeting_date)
    if (!d || d < fromKey || d > throughKey) continue
    const kind = MEETING_SERIES[r.series_kind] ? r.series_kind : 'custom'
    const s = MEETING_SERIES[kind]
    out.push({
      key: `meeting-row-${r.id}`,
      seriesKind: kind,
      seriesDate: r.series_date ? dayKey(r.series_date) : null,
      date: d,
      time: r.start_time ? String(r.start_time).slice(0, 5) : '',
      title: r.title || s.label,
      minutes: r.duration_minutes || s.minutes,
      // Moved only if it is standing in for a series occurrence on another day.
      moved: !!r.series_date && dayKey(r.series_date) !== d,
      custom: !r.series_date,
      overrideId: r.id,
      notes: r.notes || '',
    })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)))
}

/**
 * A one-line description of the cadence, for the EOS page and the calendar.
 * Empty when nothing is set, so the caller can say "no cadence yet" instead of
 * printing a sentence with holes in it.
 */
export function cadenceSentence(cadence) {
  const c = cadence || {}
  const parts = []
  if (c.l10_day) parts.push(`L10 every ${c.l10_day}${c.l10_time ? ` at ${formatTime(c.l10_time)}` : ''}`)
  if (c.quarterly_next) parts.push('quarterly every 90 days')
  if (c.annual_next) parts.push('annual once a year')
  if (!parts.length) return ''
  return parts.join(' · ')
}
