// Company holidays (2026-10-25). The rule lives in _shared/holidays.ts and is
// imported here exactly as the browser imports it — no transpile trick needed,
// because the file deliberately has no imports of its own.
import { describe, it, expect } from 'vitest'
import {
  usHolidays,
  usHolidayList,
  US_HOLIDAY_KEYS,
  parseCompanyHolidays,
  serializeHolidayPlan,
  emptyHolidayPlan,
  holidayOn,
  holidaysBetween,
} from '../../supabase/functions/_shared/holidays.ts'

describe('the federal days did not change when they moved files', () => {
  // The same assertions repGoals.test.js has always made. If the move altered
  // a single date, Cole's routines would start running on a holiday.
  it('observes the eight days, shifted off the weekend', () => {
    const h26 = usHolidays(2026)
    expect(h26['2026-11-26']).toBe('Thanksgiving')
    expect(h26['2026-11-27']).toBe('the day after Thanksgiving')
    expect(h26['2026-12-25']).toBe('Christmas')
    expect(h26['2026-07-03']).toBe('Independence Day')   // Jul 4 2026 is a Saturday
    expect(h26['2026-05-25']).toBe('Memorial Day')
    expect(h26['2026-09-07']).toBe('Labor Day')
    expect(usHolidays(2027)['2027-12-24']).toBe('Christmas')        // Saturday → Friday
    expect(usHolidays(2027)['2027-12-31']).toBe("New Year's Day")   // Jan 1 2028 is a Saturday
  })

  it('keys are stable across years, because dates are not', () => {
    // Thanksgiving is a different date every year, so an opt-out stored as a
    // date would silently come back next November.
    const k = (y) => usHolidayList(y).find((h) => h.key === 'thanksgiving')
    expect(k(2026).date).toBe('2026-11-26')
    expect(k(2027).date).toBe('2027-11-25')
    for (const key of US_HOLIDAY_KEYS) {
      expect(usHolidayList(2026).some((h) => h.key === key)).toBe(true)
    }
  })

  it('marks next year\'s New Year as a carry, so a settings list can drop it', () => {
    const carried = usHolidayList(2027).filter((h) => h.carry)
    expect(carried).toHaveLength(1)
    expect(carried[0].date).toBe('2027-12-31')
    // One row per holiday once the carry is filtered out.
    expect(usHolidayList(2026).filter((h) => !h.carry)).toHaveLength(US_HOLIDAY_KEYS.length)
  })
})

describe('reading the company_holidays setting', () => {
  it('accepts the legacy bare-string list', () => {
    const plan = parseCompanyHolidays('["2026-12-24","2026-12-31"]')
    expect(plan.added.map((a) => a.date)).toEqual(['2026-12-24', '2026-12-31'])
    expect(plan.added[0].name).toBe('a company holiday')
  })

  it('accepts named days and skips together', () => {
    const plan = parseCompanyHolidays(JSON.stringify([
      { date: '2026-12-24', name: 'Christmas Eve' },
      { skip: 'day_after_thanksgiving' },
    ]))
    expect(plan.added).toEqual([{ date: '2026-12-24', name: 'Christmas Eve' }])
    expect([...plan.skip]).toEqual(['day_after_thanksgiving'])
  })

  it('takes an already-parsed array as well as a string', () => {
    expect(parseCompanyHolidays([{ date: '2026-07-06', name: 'Shutdown' }]).added).toHaveLength(1)
  })

  it('a malformed setting yields no holidays rather than throwing', () => {
    // offDayReason would otherwise skip a routine it should have run.
    for (const bad of ['', '   ', 'not json', '{"nope":1}', 'null', null, undefined, 42, [{ date: 'yesterday' }], [null], ['garbage']]) {
      const plan = parseCompanyHolidays(bad)
      expect(plan.added).toEqual([])
      expect(plan.skip.size).toBe(0)
    }
  })

  it('round-trips through the stored form', () => {
    const plan = emptyHolidayPlan()
    plan.skip.add('christmas')
    plan.added.push({ date: '2026-07-06', name: 'Shutdown' })
    const back = parseCompanyHolidays(serializeHolidayPlan(plan))
    expect([...back.skip]).toEqual(['christmas'])
    expect(back.added).toEqual([{ date: '2026-07-06', name: 'Shutdown' }])
  })

  it('a skip entry is invisible to the reader that shipped before skips existed', () => {
    // The claim the one-setting decision rests on. This is the old loop, kept
    // verbatim: it reads h.date, which a skip entry has not got.
    const list = JSON.parse(serializeHolidayPlan({ skip: new Set(['christmas']), added: [{ date: '2026-07-06', name: 'Shutdown' }] }))
    const oldReaderSays = (day) => {
      for (const h of Array.isArray(list) ? list : []) {
        const d = typeof h === 'string' ? h : h?.date
        if (d === day) return (typeof h === 'object' && h?.name) || 'a company holiday'
      }
      return null
    }
    expect(oldReaderSays('2026-07-06')).toBe('Shutdown')  // still understood

    // Across a real year of day keys, the skip row is the holiday for none of
    // them — the added day is the only thing the old reader reports.
    const hits = []
    for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2026, 11, 31); t += 86400000) {
      const day = new Date(t).toISOString().slice(0, 10)
      if (oldReaderSays(day)) hits.push(day)
    }
    expect(hits).toEqual(['2026-07-06'])
  })
})

describe('is this day off?', () => {
  it('a federal day is off with nothing configured', () => {
    expect(holidayOn('2026-11-26').name).toBe('Thanksgiving')
    expect(holidayOn('2026-11-26', null).custom).toBe(false)
  })

  it('a workday is not a holiday', () => {
    expect(holidayOn('2026-11-24')).toBe(null)
  })

  it('a federal day the company works is NOT a holiday', () => {
    // The gap this change exists to close: plenty of field companies work the
    // day after Thanksgiving.
    const plan = parseCompanyHolidays('[{"skip":"day_after_thanksgiving"}]')
    expect(holidayOn('2026-11-27', plan)).toBe(null)
    expect(holidayOn('2026-11-26', plan).name).toBe('Thanksgiving')  // the next day still is
  })

  it('a day the company added is a holiday, under its own name', () => {
    const plan = parseCompanyHolidays('[{"date":"2026-12-24","name":"Christmas Eve"}]')
    const h = holidayOn('2026-12-24', plan)
    expect(h.name).toBe('Christmas Eve')
    expect(h.custom).toBe(true)
  })

  it('a company entry cannot quietly rename Christmas', () => {
    const plan = parseCompanyHolidays('[{"date":"2026-12-25","name":"Whatever"}]')
    expect(holidayOn('2026-12-25', plan).name).toBe('Christmas')
  })

  it('skipping a federal day lets the company name that date itself', () => {
    const plan = parseCompanyHolidays('[{"skip":"christmas"},{"date":"2026-12-25","name":"Working Christmas"}]')
    expect(holidayOn('2026-12-25', plan).name).toBe('Working Christmas')
  })

  it('a junk day key is not a holiday', () => {
    for (const bad of ['', 'nonsense', '2026-13-45x', null, undefined]) expect(holidayOn(bad)).toBe(null)
  })
})

describe('the holidays in a window — what the calendar draws', () => {
  it('finds the days inside a month and nothing outside it', () => {
    const got = holidaysBetween('2026-11-01', '2026-11-30')
    expect(got.map((h) => h.date)).toEqual(['2026-11-26', '2026-11-27'])
  })

  it('a month with no holidays is empty, not undefined', () => {
    expect(holidaysBetween('2026-10-01', '2026-10-31')).toEqual([])
  })

  it('a window straddling the new year finds both New Year entries', () => {
    const got = holidaysBetween('2026-12-28', '2027-01-05')
    // Jan 1 2027 is a Friday, so it is observed on the day itself.
    expect(got.map((h) => h.date)).toContain('2027-01-01')
  })

  it('a skipped day is simply not drawn', () => {
    const plan = parseCompanyHolidays('[{"skip":"thanksgiving"}]')
    expect(holidaysBetween('2026-11-01', '2026-11-30', plan).map((h) => h.date)).toEqual(['2026-11-27'])
  })

  it('a company day is drawn alongside the federal ones, in date order', () => {
    const plan = parseCompanyHolidays('[{"date":"2026-11-02","name":"Team Offsite"}]')
    const got = holidaysBetween('2026-11-01', '2026-11-30', plan)
    expect(got.map((h) => h.date)).toEqual(['2026-11-02', '2026-11-26', '2026-11-27'])
    expect(got[0].custom).toBe(true)
  })

  it('a company day on a federal date does not draw twice', () => {
    const plan = parseCompanyHolidays('[{"date":"2026-12-25","name":"Christmas Eve-ish"}]')
    const got = holidaysBetween('2026-12-01', '2026-12-31', plan)
    expect(got.filter((h) => h.date === '2026-12-25')).toHaveLength(1)
  })

  it('a backwards or junk window draws nothing', () => {
    expect(holidaysBetween('2026-11-30', '2026-11-01')).toEqual([])
    expect(holidaysBetween('', '2026-11-01')).toEqual([])
    expect(holidaysBetween('2026-11-01', 'soon')).toEqual([])
  })
})
