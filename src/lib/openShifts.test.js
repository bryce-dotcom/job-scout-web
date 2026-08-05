import { describe, it, expect } from 'vitest'
import { splitOpenPunches, isAbandoned, hoursOpen, MAX_SHIFT_HOURS } from './openShifts'

// The case that broke the night crew: clocked in yesterday evening, still
// working after midnight. The old calendar-day rule dropped this punch.
const at = (iso) => ({ id: 1, clock_in: iso, clock_out: null })

describe('a shift that crosses midnight', () => {
  const now = new Date('2026-08-05T06:00:00Z') // 12:00am Denver

  it('is still active when it started last evening', () => {
    const punch = at('2026-08-05T03:16:00Z') // 9:16pm Denver, yesterday's date
    expect(isAbandoned(punch, now)).toBe(false)
    expect(splitOpenPunches([punch], now).active).toBe(punch)
  })

  it('stays active right up to the cutoff', () => {
    const punch = at(new Date(now.getTime() - (MAX_SHIFT_HOURS - 0.5) * 3600000).toISOString())
    expect(splitOpenPunches([punch], now).active).toBe(punch)
  })
})

describe('a punch nobody could still be working', () => {
  const now = new Date('2026-08-05T06:00:00Z')

  it('is abandoned past the cutoff, not active', () => {
    const punch = at(new Date(now.getTime() - 30 * 3600000).toISOString())
    const { active, abandoned } = splitOpenPunches([punch], now)
    expect(active).toBeNull()
    expect(abandoned).toEqual([punch])
  })

  it('does not hide a real shift behind an old forgotten one', () => {
    // London: 8:59pm Aug 3 never closed, then a real shift the next night.
    const forgotten = { id: 1, clock_in: '2026-08-04T02:59:00Z', clock_out: null }
    const real = { id: 2, clock_in: '2026-08-05T03:16:00Z', clock_out: null }
    const { active, abandoned } = splitOpenPunches([forgotten, real], now)
    expect(active).toBe(real)
    expect(abandoned).toEqual([forgotten])
  })
})

describe('double-clocked techs', () => {
  const now = new Date('2026-08-05T06:00:00Z')

  it('picks the newest live punch and reports the rest as duplicates', () => {
    const older = { id: 1, clock_in: '2026-08-05T01:00:00Z', clock_out: null }
    const newer = { id: 2, clock_in: '2026-08-05T04:00:00Z', clock_out: null }
    const { active, duplicates } = splitOpenPunches([older, newer], now)
    expect(active).toBe(newer)
    expect(duplicates).toEqual([older])
  })
})

describe('the day crew must not change', () => {
  const now = new Date('2026-08-04T21:00:00Z') // 3:00pm Denver

  it('keeps a normal morning punch active', () => {
    const punch = at('2026-08-04T13:10:00Z') // 7:10am Denver
    expect(splitOpenPunches([punch], now).active).toBe(punch)
  })

  it('ignores closed punches entirely', () => {
    const closed = { id: 9, clock_in: '2026-08-04T13:00:00Z', clock_out: '2026-08-04T20:00:00Z' }
    const { active, abandoned, duplicates } = splitOpenPunches([closed], now)
    expect(active).toBeNull()
    expect(abandoned).toEqual([])
    expect(duplicates).toEqual([])
  })
})

describe('junk', () => {
  it('treats an unparseable clock_in as abandoned rather than active', () => {
    // Never show a running timer counting from garbage.
    expect(hoursOpen({ clock_in: 'nonsense' })).toBe(Infinity)
    expect(splitOpenPunches([{ clock_in: null, clock_out: null }]).active).toBeNull()
  })

  it('survives no rows', () => {
    expect(splitOpenPunches(undefined).active).toBeNull()
    expect(splitOpenPunches([]).abandoned).toEqual([])
  })
})
