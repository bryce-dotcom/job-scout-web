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
