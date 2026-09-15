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
