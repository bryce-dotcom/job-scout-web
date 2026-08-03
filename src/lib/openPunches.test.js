import { describe, it, expect } from 'vitest'
import {
  classifyOpenPunch, typicalShiftHours, needsAttention,
  SUPERSEDED, OVERRUN, LONG, RUNNING,
} from './openPunches'

// Every case here comes from the real crew. London, Mike and Derrick work
// nights and swing; the old 12-hour rule called their long shifts ghosts.

const NOW = new Date('2026-08-03T21:39:00Z').getTime()   // Mon 3:39 PM MT
const h = (n) => ({ employee_id: 1, total_hours: n })
const dayShifts = Array.from({ length: 20 }, () => h(6))

describe('a newer clock-in proves the old punch was abandoned', () => {
  const abandoned = { id: 1205, employee_id: 1, clock_in: '2026-08-03T02:40:00Z' } // Sun 8:40 PM MT
  const newer = { id: 1214, employee_id: 1, clock_in: '2026-08-03T19:50:00Z' }     // Mon 1:50 PM MT

  it('flags the earlier punch as superseded', () => {
    // London: swing shift Sunday night never closed, then clocked in Monday.
    const c = classifyOpenPunch(abandoned, [abandoned, newer], dayShifts, NOW)
    expect(c.level).toBe(SUPERSEDED)
    expect(c.supersededBy).toBe(1214)
  })

  it('works no matter what shift pattern they keep', () => {
    // Same proof holds with a night-shift history — nobody is on two clocks.
    const nights = Array.from({ length: 20 }, () => h(11))
    expect(classifyOpenPunch(abandoned, [abandoned, newer], nights, NOW).level).toBe(SUPERSEDED)
  })

  it('ignores a punch belonging to someone else', () => {
    const other = { id: 99, employee_id: 2, clock_in: '2026-08-03T19:50:00Z' }
    expect(classifyOpenPunch(abandoned, [abandoned, other], dayShifts, NOW).level).not.toBe(SUPERSEDED)
  })

  it('ignores an EARLIER punch — only a later one proves abandonment', () => {
    const earlier = { id: 5, employee_id: 1, clock_in: '2026-08-01T10:00:00Z' }
    expect(classifyOpenPunch(abandoned, [abandoned, earlier], dayShifts, NOW).level).not.toBe(SUPERSEDED)
  })
})

describe('a long swing shift is NOT a missed clock-out', () => {
  it('leaves a 10-hour night shift alone for someone who works nights', () => {
    // Derrick's median is ~7h; 10h is a long night, not an abandoned punch.
    const nights = Array.from({ length: 20 }, () => h(7))
    const p = { id: 1, employee_id: 1, clock_in: new Date(NOW - 10 * 36e5).toISOString() }
    expect(classifyOpenPunch(p, [p], nights, NOW).level).toBe(RUNNING)
  })

  it('the old 12-hour rule would have flagged it; this does not', () => {
    const nights = Array.from({ length: 20 }, () => h(9))
    const p = { id: 1, employee_id: 1, clock_in: new Date(NOW - 13 * 36e5).toISOString() }
    // 13h against a 9h norm — long, but plausible for swing. Not an overrun.
    expect(classifyOpenPunch(p, [p], nights, NOW).level).not.toBe(OVERRUN)
  })

  it('still catches a genuine 20-hour overrun', () => {
    // 1203/1204/1205 had run ~20h against 5-8h medians.
    const p = { id: 1, employee_id: 1, clock_in: new Date(NOW - 20 * 36e5).toISOString() }
    expect(classifyOpenPunch(p, [p], dayShifts, NOW).level).toBe(OVERRUN)
  })

  it('catches the June ghosts that ran for weeks', () => {
    const p = { id: 1, employee_id: 1, clock_in: '2026-06-22T03:08:00Z' }
    expect(classifyOpenPunch(p, [p], dayShifts, NOW).level).toBe(OVERRUN)
  })
})

describe('judging against the person, not a company-wide number', () => {
  it('uses the median of their own completed shifts', () => {
    expect(typicalShiftHours([h(4), h(6), h(8)], 1)).toBe(6)
  })

  it('discards ghost shifts so they cannot inflate the norm', () => {
    // Mike had a completed "418 hour" shift — itself an un-fixed ghost.
    expect(typicalShiftHours([h(6), h(7), h(8), h(418)], 1)).toBeLessThan(24)
  })

  it('returns null without enough history to judge', () => {
    expect(typicalShiftHours([h(6)], 1)).toBeNull()
    expect(typicalShiftHours([], 1)).toBeNull()
  })

  it('falls back to a swing-friendly threshold with no history', () => {
    const short = { id: 1, employee_id: 9, clock_in: new Date(NOW - 13 * 36e5).toISOString() }
    const longOne = { id: 2, employee_id: 9, clock_in: new Date(NOW - 20 * 36e5).toISOString() }
    expect(classifyOpenPunch(short, [short], [], NOW).level).toBe(RUNNING)
    expect(classifyOpenPunch(longOne, [longOne], [], NOW).level).toBe(OVERRUN)
  })
})

describe('what the admin actually gets shown', () => {
  it('hides people who are simply still working', () => {
    const working = { id: 1, employee_id: 1, clock_in: new Date(NOW - 5 * 36e5).toISOString() }
    expect(needsAttention([working], [working], dayShifts, NOW)).toHaveLength(0)
  })

  it('puts proven-abandoned punches above merely long ones', () => {
    const superseded = { id: 1, employee_id: 1, clock_in: new Date(NOW - 19 * 36e5).toISOString() }
    const newer = { id: 2, employee_id: 1, clock_in: new Date(NOW - 2 * 36e5).toISOString() }
    const longOne = { id: 3, employee_id: 5, clock_in: new Date(NOW - 30 * 36e5).toISOString() }
    const out = needsAttention([superseded, longOne], [superseded, newer, longOne], dayShifts, NOW)
    expect(out[0].id).toBe(1)
    expect(out[0]._classification.level).toBe(SUPERSEDED)
  })

  it('every surfaced row explains itself', () => {
    const p = { id: 1, employee_id: 1, clock_in: new Date(NOW - 30 * 36e5).toISOString() }
    for (const r of needsAttention([p], [p], dayShifts, NOW)) {
      expect(r._classification.reason.length).toBeGreaterThan(0)
    }
  })

  it('survives junk input', () => {
    expect(needsAttention(null, null, null, NOW)).toEqual([])
    expect(classifyOpenPunch(null, [], [], NOW).level).toBe(RUNNING)
    expect(classifyOpenPunch({ clock_in: 'nonsense' }, [], [], NOW).level).toBe(RUNNING)
  })
})
