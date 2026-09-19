// Wall-clock time in the user's zone ↔ UTC instants, with no imports, so
// every Arnie module can use them without creating a cycle. The model has
// no clock and the server's is UTC; every "tomorrow at 2" and "5:30
// yesterday" passes through here on the way to a row.

/** Minutes east of UTC for `tz` at the instant `at`. 0 for an unknown zone. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at)
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
    return Math.round((asUtc - at.getTime()) / 60000)
  } catch { return 0 }
}

/** "2026-09-16 14:00" or "2026-09-16T14:00" in `tz` → the UTC instant, or null. */
export function localToUtc(when: string, tz: string): Date | null {
  const m = String(when ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/)
  if (!m) return null
  const guess = new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00Z`)
  if (isNaN(guess.getTime())) return null
  return new Date(guess.getTime() - tzOffsetMinutes(tz, guess) * 60000)
}

/**
 * A day the way a person says it → YYYY-MM-DD in `tz`. "Thursday",
 * "tomorrow", "today", "next Monday", or an ISO date passed through.
 *
 * Why this exists: handed "Today: Tuesday 2026-09-15" AND a seven-day
 * lookup table, the model still put a tech on "Thursday" for the 18th (a
 * Friday) and "Monday" for the 22nd — it does not read the table while it
 * is busy building a tool call; it counts from a calendar of its own. So
 * the model passes the word and the server does the arithmetic. A weekday
 * means the NEXT one after today; "next Thursday" the same (people say it
 * both ways for the coming one); today's own weekday means a week out.
 */
export function resolveDayWord(said: string, tz: string, now = new Date()): string | null {
  const s = String(said ?? '').trim().toLowerCase()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const localMidnight = (d: Date) => new Date(d.getTime() + tzOffsetMinutes(tz, d) * 60000)
  const base = localMidnight(now)                       // "UTC" clock reading the local wall date
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const plus = (n: number) => iso(new Date(base.getTime() + n * 86400000))
  if (/^(today|tonight)$/.test(s)) return plus(0)
  if (/^tomorrow$/.test(s)) return plus(1)
  if (/^(day after tomorrow)$/.test(s)) return plus(2)
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const m = s.match(/^(?:next\s+|this\s+|on\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/)
  if (!m) return null
  const want = DAYS.findIndex((d) => d.startsWith(m[1].slice(0, 3)))
  const todayDow = base.getUTCDay()
  let ahead = (want - todayDow + 7) % 7
  if (ahead === 0) ahead = 7
  return plus(ahead)
}

/**
 * resolveDayWord, with a direction. 'forward' (the default) is for booking:
 * a weekday is the coming one. 'back' is for a clock-out: "Thursday" said on
 * Friday is yesterday, "Thursday" said on Thursday is today, "last Monday"
 * is last Monday whichever way you lean, and "yesterday" is yesterday.
 */
export function resolveDayWordDir(said: string, tz: string, direction: 'forward' | 'back', now = new Date()): string | null {
  const s = String(said ?? '').trim().toLowerCase()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^yesterday$/.test(s)) return plusDays(tz, -1, now)
  if (/^day before yesterday$/.test(s)) return plusDays(tz, -2, now)
  const md = monthDay(s, tz, direction, now)
  if (md) return md
  const m = s.match(/^(last\s+)?(?:next\s+|this\s+|on\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/)
  if (!m) return resolveDayWord(s, tz, now)
  if (!m[1] && direction === 'forward') return resolveDayWord(s, tz, now)
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const want = DAYS.findIndex((d) => d.startsWith(m[2].slice(0, 3)))
  const todayDow = new Date(now.getTime() + tzOffsetMinutes(tz, now) * 60000).getUTCDay()
  let back = (todayDow - want + 7) % 7
  if (m[1] && back === 0) back = 7          // "last Thursday" said on a Thursday = a week ago
  return plusDays(tz, -back, now)
}

/**
 * A calendar day said by month and day — "October 1", "Oct 1st", "10/1",
 * "the 15th" — with no year. Forward means the next such day on or after
 * today (a start date, a booking); back means the most recent one (a
 * clock-out). A year given is kept. Returns null for anything else so the
 * weekday parser gets its turn.
 */
function monthDay(s: string, tz: string, direction: 'forward' | 'back', now: Date): string | null {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  let month = -1, day = -1, year: number | null = null
  let m = s.match(/^(?:on\s+|the\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/) || s.match(/^(?:on\s+|the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\.?(?:,?\s+(\d{4}))?$/)
  if (m && MONTHS.some((x) => (/^\d/.test(m![1]) ? m![2] : m![1]).startsWith(x))) {
    const [a, b] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]]
    month = MONTHS.findIndex((x) => a.startsWith(x)); day = Number(b); year = m[3] ? Number(m[3]) : null
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
    month = Number(m[1]) - 1; day = Number(m[2]); year = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : null
  } else if ((m = s.match(/^(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)$/))) {
    day = Number(m[1])
  } else return null
  if (day < 1 || day > 31) return null
  const today = plusDays(tz, 0, now)
  const [ty, tm] = today.split('-').map(Number)
  const iso = (y: number, mo: number, d: number) => { const dt = new Date(Date.UTC(y, mo, d)); return dt.getUTCMonth() === mo ? dt.toISOString().slice(0, 10) : null }
  if (month < 0) {
    // "the 15th": this month if it fits the direction, else the next/previous month.
    const cur = iso(ty, tm - 1, day)
    if (cur && (direction === 'forward' ? cur >= today : cur <= today)) return cur
    return iso(ty, tm - 1 + (direction === 'forward' ? 1 : -1), day)
  }
  if (year != null) return iso(year, month, day)
  const cur = iso(ty, month, day)
  if (cur && (direction === 'forward' ? cur >= today : cur <= today)) return cur
  return iso(ty + (direction === 'forward' ? 1 : -1), month, day)
}

function plusDays(tz: string, n: number, now: Date): string {
  const base = new Date(now.getTime() + tzOffsetMinutes(tz, now) * 60000)
  return new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10)
}

/**
 * A moment the way a person says it → { date, time } in `tz`, or null.
 *
 *   "Thursday at 2"        "tomorrow 9:30am"      "2pm Friday"
 *   "5:30 yesterday"       "yesterday at 5:30 pm" "noon Monday"
 *   "2026-09-17 14:00"     "2026-09-17T14:00"     "14:00" (today)
 *
 * No am/pm: 1–6 is afternoon, 7–11 is morning, 12 is noon — nobody books
 * a sales call for 2am, and the card reads the time back so a wrong guess
 * is caught before it is booked. A day without a time is returned with
 * time null; the caller decides whether to ask.
 */
export function resolveWhenSaid(said: string, tz: string, direction: 'forward' | 'back' = 'forward', now = new Date()): { date: string; time: string | null } | null {
  let s = String(said ?? '').trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!s) return null
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:[t ](\d{1,2}):(\d{2}))?$/)
  if (iso) return { date: iso[1], time: iso[2] ? `${iso[2].padStart(2, '0')}:${iso[3]}` : null }

  // A month-and-day at either end ("October 1 at 2pm", "2pm on Oct 1st")
  // is lifted out before the time is looked for — its bare day number
  // would otherwise read as one o'clock.
  let fixedDate: string | null = null
  {
    const words = s.split(' ')
    outer: for (const len of [4, 3, 2, 1]) {
      for (const [from, to] of [[0, len], [words.length - len, words.length]]) {
        if (from < 0 || to > words.length || from >= to) continue
        const d = monthDay(words.slice(from, to).join(' '), tz, direction, now)
        if (d) { fixedDate = d; s = [...words.slice(0, from), ...words.slice(to)].join(' ').trim(); break outer }
      }
    }
  }

  // Pull the time out first; whatever is left is the day.
  let time: string | null = null
  const t = s.match(/\b(noon|midnight|(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?)\b/)
  if (t) {
    if (t[1] === 'noon') time = '12:00'
    else if (t[1] === 'midnight') time = '00:00'
    else {
      let h = Number(t[2]); const mm = t[3] || '00'; const ap = (t[4] || '').replace(/\./g, '')
      if (h > 24 || Number(mm) > 59) return null
      if (ap === 'pm' && h < 12) h += 12
      else if (ap === 'am' && h === 12) h = 0
      else if (!ap && h >= 1 && h <= 6) h += 12        // "at 2", "5:30" → afternoon
      time = `${String(h).padStart(2, '0')}:${mm}`
    }
    s = (s.slice(0, t.index) + ' ' + s.slice((t.index ?? 0) + t[0].length)).replace(/\bat\b/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const dayWords = s.replace(/\b(at|on|for)\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (fixedDate && dayWords) return null            // "October 1 Thursday" — two days, no answer
  const date = fixedDate || (dayWords ? resolveDayWordDir(dayWords, tz, direction, now) : plusDays(tz, 0, now))
  if (!date) return null
  return { date, time }
}
