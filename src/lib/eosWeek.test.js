import { describe, it, expect } from 'vitest'
import { getWeekRange, localDayKey } from './eosWeek'

// Wed 2026-07-29, mid-morning local. Last completed week = Mon 7/20 – Sun 7/26.
const WED = new Date(2026, 6, 29, 10, 30)

describe('localDayKey', () => {
  it('uses local calendar parts, not a UTC round-trip', () => {
    // Local Sunday 23:59:59.999 is Monday in UTC — the exact case that broke
    // the scorecard. The key must still say Sunday.
    expect(localDayKey(new Date(2026, 6, 26, 23, 59, 59, 999))).toBe('2026-07-26')
    expect(localDayKey(new Date(2026, 6, 20, 0, 0, 0, 0))).toBe('2026-07-20')
  })
})

describe('getWeekRange', () => {
  it('returns the last COMPLETED week as Mon–Sun (7 days, not 8)', () => {
    const w = getWeekRange(1, WED)
    expect(w.startDate).toBe('2026-07-20') // Monday
    expect(w.endDate).toBe('2026-07-26')   // Sunday — was 07-27 before the fix
  })

  it('spans exactly 7 calendar days', () => {
    const w = getWeekRange(1, WED)
    const days = (new Date(w.endDate) - new Date(w.startDate)) / 86400000
    expect(days).toBe(6) // inclusive Mon..Sun
  })

  it('never lets endDate leak into the next week', () => {
    // The regression: an 8-day window swallowed the following Monday, which
    // tripled Cash Collected on the real 7/20 week.
    for (let back = 0; back <= 6; back++) {
      const w = getWeekRange(back, WED)
      const next = getWeekRange(back - 1, WED)
      if (back > 0) expect(w.endDate < next.startDate).toBe(true)
    }
  })

  it('walks back one week at a time', () => {
    expect(getWeekRange(2, WED).startDate).toBe('2026-07-13')
    expect(getWeekRange(2, WED).endDate).toBe('2026-07-19')
    expect(getWeekRange(0, WED).startDate).toBe('2026-07-27') // current partial week
  })

  it('treats Sunday as the end of the week in progress, not the start of a new one', () => {
    const SUN = new Date(2026, 6, 26, 15, 0) // Sunday afternoon
    const cur = getWeekRange(0, SUN)
    expect(cur.startDate).toBe('2026-07-20')
    expect(cur.endDate).toBe('2026-07-26')
  })

  it('keeps start/end as absolute instants covering the local day boundaries', () => {
    const w = getWeekRange(1, WED)
    expect(new Date(w.start).getTime()).toBeLessThan(new Date(w.end).getTime())
    // end is the last millisecond of local Sunday
    const localEnd = new Date(w.end)
    expect(localDayKey(localEnd)).toBe('2026-07-26')
  })
})
