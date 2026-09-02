import { describe, it, expect } from 'vitest'
import {localDateStr, parseLocalDate, inLocalRange } from './localDate'
import { getCurrentPayPeriod } from './bonusCalc'

// Alayda, 14 Aug: "the pay period is incorrect & off by one day it is supposed
// to be till the end of the month - the last day. The system is reading to the
// first of the month which throws it off."

describe('the last day of the month stays the last day', () => {
  it('does not roll a late-evening local time into tomorrow', () => {
    // 23:59:59 on the 31st — what a period end actually is.
    expect(localDateStr(new Date(2026, 7, 31, 23, 59, 59))).toBe('2026-08-31')
  })

  it('the semi-monthly period end reads as the end of the month', () => {
    const { periodEnd } = getCurrentPayPeriod({ pay_frequency: 'semi-monthly' }, 0)
    const str = localDateStr(periodEnd)
    // Whatever today is, the string must be the same calendar day the Date is.
    expect(str).toBe(`${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}-${String(periodEnd.getDate()).padStart(2, '0')}`)
    expect(str.endsWith('-01')).toBe(periodEnd.getDate() === 1)
  })

  it('start and end of every frequency round-trip to their own calendar day', () => {
    for (const pay_frequency of ['weekly', 'bi-weekly', 'semi-monthly', 'monthly']) {
      for (const offset of [-1, 0, 1]) {
        const { periodStart, periodEnd } = getCurrentPayPeriod({ pay_frequency }, offset)
        for (const [name, d] of [['start', periodStart], ['end', periodEnd]]) {
          expect(localDateStr(d), `${pay_frequency} ${name} @${offset}`)
            .toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        }
      }
    }
  })
})

describe('bad input fails visibly, not confidently', () => {
  it('never returns the epoch for a missing value', () => {
    for (const bad of [null, undefined, '']) expect(localDateStr(bad)).toBe('')
  })

  it('returns empty for an unparseable date', () => {
    expect(localDateStr('not a date')).toBe('')
    expect(localDateStr(new Date('nonsense'))).toBe('')
  })

  it('accepts a date string and keeps its day', () => {
    expect(localDateStr('2026-08-31T23:59:59')).toBe('2026-08-31')
  })

  it('zero-pads so the strings compare and sort correctly', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// parseLocalDate / inLocalRange — the reading direction of the same bug.
// `new Date('2026-09-01')` is UTC midnight, which west of Greenwich is the
// evening of Aug 31, so the 1st of every month fell into the previous month.
// Live consequence: on 2 Sep 2026 the dashboard showed MTD Revenue $0 while
// $38,974 sat in eleven payments dated '2026-09-01'.
// ─────────────────────────────────────────────────────────────────────────
describe('parseLocalDate', () => {
  it('reads a bare date as local midnight, not UTC midnight', () => {
    const d = parseLocalDate('2026-09-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)   // September
    expect(d.getDate()).toBe(1)    // the 1st, not Aug 31
    expect(d.getHours()).toBe(0)
  })

  it('is not fooled by the naive parse it exists to replace', () => {
    // The whole point: these two disagree, and the naive one is wrong.
    expect(parseLocalDate('2026-09-01').getDate()).toBe(1)
    expect(new Date('2026-09-01').getDate()).not.toBe(1) // UTC-negative zones
  })

  it('leaves a real instant alone — those carry their own zone', () => {
    const d = parseLocalDate('2026-09-01T10:30:00-06:00')
    expect(d.toISOString()).toBe('2026-09-01T16:30:00.000Z')
  })

  it('passes a Date straight through', () => {
    const d = new Date(2026, 8, 1)
    expect(parseLocalDate(d)).toBe(d)
  })

  it('returns null for anything unusable rather than a confident wrong day', () => {
    for (const v of [null, undefined, '', 'not a date', new Date('nope'), 42, {}]) {
      expect(parseLocalDate(v)).toBeNull()
    }
  })
})

describe('inLocalRange', () => {
  const aug = new Date(2026, 7, 1)
  const sep = new Date(2026, 8, 1)
  const oct = new Date(2026, 9, 1)

  it('puts the 1st of the month in that month', () => {
    expect(inLocalRange('2026-09-01', sep, oct)).toBe(true)
    expect(inLocalRange('2026-09-01', aug, sep)).toBe(false)
  })

  it('puts the last day of the month in that month', () => {
    expect(inLocalRange('2026-08-31', aug, sep)).toBe(true)
    expect(inLocalRange('2026-08-31', sep, oct)).toBe(false)
  })

  // Half-open, so consecutive windows tile without overlapping.
  it('never counts one day in two consecutive windows', () => {
    for (const day of ['2026-07-31', '2026-08-01', '2026-08-15', '2026-08-31', '2026-09-01']) {
      const hits = [[new Date(2026, 6, 1), aug], [aug, sep], [sep, oct]]
        .filter(([s, e]) => inLocalRange(day, s, e))
      expect(hits).toHaveLength(1)
    }
  })

  it('treats a null bound as open on that side', () => {
    expect(inLocalRange('2030-01-01', sep, null)).toBe(true)
    expect(inLocalRange('2000-01-01', null, sep)).toBe(true)
    expect(inLocalRange('2000-01-01', sep, null)).toBe(false)
  })

  it('is false for a missing date instead of throwing', () => {
    expect(inLocalRange(null, aug, sep)).toBe(false)
    expect(inLocalRange('', aug, sep)).toBe(false)
  })
})
