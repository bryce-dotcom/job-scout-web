import { describe, it, expect } from 'vitest'
import { groupHoursByDay, totalFromDays, entryHours, isOpenShift } from './dailyHours'

describe('entryHours', () => {
  it('prefers the stored total', () => {
    expect(entryHours({ total_hours: 7.5, clock_in: '2026-07-20T14:00:00Z', clock_out: '2026-07-20T20:00:00Z' })).toBe(7.5)
  })

  it('derives from the clock pair when no total is stored', () => {
    expect(entryHours({ clock_in: '2026-07-20T14:00:00Z', clock_out: '2026-07-20T20:00:00Z' })).toBe(6)
  })

  it('returns 0 for an open or unusable shift instead of NaN', () => {
    expect(entryHours({ clock_in: '2026-07-20T14:00:00Z' })).toBe(0)
    expect(entryHours({})).toBe(0)
    expect(entryHours(null)).toBe(0)
  })
})

describe('isOpenShift', () => {
  it('flags a clock-in with no clock-out', () => {
    expect(isOpenShift({ clock_in: '2026-07-20T14:00:00Z' })).toBe(true)
    expect(isOpenShift({ clock_in: '2026-07-20T14:00:00Z', clock_out: '2026-07-20T20:00:00Z' })).toBe(false)
  })
})

describe('groupHoursByDay', () => {
  it('sums multiple entries on the same day', () => {
    const days = groupHoursByDay([
      { clock_in: '2026-07-20T15:00:00Z', total_hours: 4 },
      { clock_in: '2026-07-20T21:00:00Z', total_hours: 3 },
    ])
    expect(days).toHaveLength(1)
    expect(days[0].hours).toBe(7)
    expect(days[0].entries).toBe(2)
  })

  it('keeps an evening Mountain shift on its OWN local day', () => {
    // 2026-07-20 19:00 MDT === 2026-07-21 01:00 UTC. It belongs to the 20th.
    const days = groupHoursByDay([{ clock_in: '2026-07-21T01:00:00Z', total_hours: 2 }])
    expect(days[0].dayKey).toBe('2026-07-20')
  })

  it('does not shift a bare YYYY-MM-DD date column', () => {
    const days = groupHoursByDay([{ date: '2026-07-20', total_hours: 5 }])
    expect(days[0].dayKey).toBe('2026-07-20')
  })

  it('sorts newest day first', () => {
    const days = groupHoursByDay([
      { clock_in: '2026-07-18T15:00:00Z', total_hours: 1 },
      { clock_in: '2026-07-22T15:00:00Z', total_hours: 1 },
      { clock_in: '2026-07-20T15:00:00Z', total_hours: 1 },
    ])
    expect(days.map(d => d.dayKey)).toEqual(['2026-07-22', '2026-07-20', '2026-07-18'])
  })

  it('marks a day containing an open shift, without inventing hours', () => {
    const days = groupHoursByDay([
      { clock_in: '2026-07-20T15:00:00Z', total_hours: 4 },
      { clock_in: '2026-07-20T22:00:00Z' }, // never clocked out
    ])
    expect(days[0].hasOpenShift).toBe(true)
    expect(days[0].hours).toBe(4)
  })

  it('ignores entries with no usable timestamp', () => {
    expect(groupHoursByDay([{ total_hours: 5 }, null, {}])).toEqual([])
    expect(groupHoursByDay([])).toEqual([])
    expect(groupHoursByDay(null)).toEqual([])
  })
})

describe('totalFromDays', () => {
  it('matches the sum of the displayed rows', () => {
    const days = groupHoursByDay([
      { clock_in: '2026-07-20T15:00:00Z', total_hours: 4.25 },
      { clock_in: '2026-07-21T15:00:00Z', total_hours: 3.5 },
    ])
    expect(totalFromDays(days)).toBe(7.75)
  })

  it('handles an empty period', () => {
    expect(totalFromDays([])).toBe(0)
  })
})
