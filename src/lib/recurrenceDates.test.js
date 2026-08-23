import { describe, it, expect } from 'vitest'
import { addMonths, addInterval, occurrenceDates, futureOccurrences } from './recurrenceDates'

const d = (s) => new Date(`${s}T09:00:00`)
const iso = (x) => x.toISOString().slice(0, 10)

describe('the month arithmetic a schedule depends on', () => {
  it('clamps a day the next month does not have', () => {
    expect(iso(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28')
    expect(iso(addMonths(d('2026-01-31'), 3))).toBe('2026-04-30')
  })

  it('keeps the day of month when it exists', () => {
    expect(iso(addMonths(d('2026-08-24'), 1))).toBe('2026-09-24')
  })

  it('crosses a year end', () => {
    expect(iso(addInterval(d('2026-12-15'), 'Monthly'))).toBe('2027-01-15')
  })

  it('walks every supported interval', () => {
    const from = d('2026-08-24')
    expect(iso(addInterval(from, 'Daily'))).toBe('2026-08-25')
    expect(iso(addInterval(from, 'Weekly'))).toBe('2026-08-31')
    expect(iso(addInterval(from, 'Bi-Weekly'))).toBe('2026-09-07')
    expect(iso(addInterval(from, 'Every 6 Weeks'))).toBe('2026-10-05')
    expect(iso(addInterval(from, 'Quarterly'))).toBe('2026-11-24')
    expect(iso(addInterval(from, 'Bi-Annually'))).toBe('2027-02-24')
    expect(iso(addInterval(from, 'Annually'))).toBe('2027-08-24')
  })
})

// "I can't see it the next month" — the point of the whole thing.
describe('seeing next month', () => {
  it('projects a monthly job across the coming quarter', () => {
    const got = occurrenceDates(d('2026-08-24'), 'Monthly', { through: d('2026-11-30') })
    expect(got.map(iso)).toEqual(['2026-08-24', '2026-09-24', '2026-10-24', '2026-11-24'])
  })

  it('leaves out the occurrence that already exists as a real job', () => {
    const got = futureOccurrences(d('2026-08-24'), 'Monthly', { through: d('2026-10-31') })
    expect(got.map(iso)).toEqual(['2026-09-24', '2026-10-24'])
  })

  it('stops at the series end date rather than running on forever', () => {
    const got = occurrenceDates(d('2026-08-24'), 'Monthly', { through: d('2027-12-31'), endDate: '2026-10-24' })
    expect(got.map(iso)).toEqual(['2026-08-24', '2026-09-24', '2026-10-24'])
  })

  it('caps a daily job so a wide window cannot flood the calendar', () => {
    expect(occurrenceDates(d('2026-01-01'), 'Daily', { through: d('2027-01-01'), max: 10 })).toHaveLength(10)
  })
})

describe('it never invents a date', () => {
  it('returns nothing for a job that does not repeat', () => {
    expect(occurrenceDates(d('2026-08-24'), 'None', { through: d('2026-12-31') })).toEqual([])
    expect(occurrenceDates(d('2026-08-24'), null, { through: d('2026-12-31') })).toEqual([])
  })

  it('returns nothing without a start date — most recurring rows have none', () => {
    expect(occurrenceDates(null, 'Monthly', { through: d('2026-12-31') })).toEqual([])
    expect(occurrenceDates('', 'Monthly', { through: d('2026-12-31') })).toEqual([])
  })

  it('survives an unparseable date instead of producing Invalid Date boxes', () => {
    expect(occurrenceDates('not a date', 'Monthly', { through: d('2026-12-31') })).toEqual([])
    expect(occurrenceDates(d('2026-08-24'), 'Monthly', { through: 'rubbish' })).toEqual([])
  })

  it('projects nothing when the window is already behind the start', () => {
    expect(occurrenceDates(d('2026-08-24'), 'Monthly', { through: d('2026-08-01') })).toEqual([])
  })

  it('accepts a plain date string, which is what the rows carry', () => {
    expect(occurrenceDates('2026-08-24', 'Monthly', { through: '2026-10-31' }).map(iso))
      .toEqual(['2026-08-24', '2026-09-24', '2026-10-24'])
  })
})
