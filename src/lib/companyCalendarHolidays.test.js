import { describe, it, expect } from 'vitest'
import {
  buildCalendarEvents,
  filterCalendarEvents,
  groupEventsByDay,
  calendarSourcesSentence,
  KINDS,
} from './companyCalendar'

// November 2026: Thanksgiving falls on the 26th, the day after on the 27th.
const NOV = { from: '2026-11-01', through: '2026-11-30' }
const OCT = { from: '2026-10-01', through: '2026-10-31' }

const holidaysIn = (events) => events.filter((e) => e.kind === 'holiday')
const build = (data = {}, window = NOV) =>
  buildCalendarEvents(data, { meetingWindow: window })

describe('the calendar shows the days the company is closed', () => {
  it('has a holidays kind at all — the gap Bryce reported', () => {
    expect(KINDS.holiday).toBeTruthy()
    expect(KINDS.holiday.writes.bookedIn).toContain('Company Holidays')
  })

  it('names HR & Payroll Settings as a source', () => {
    expect(calendarSourcesSentence().toLowerCase()).toContain('payroll settings')
  })

  it('draws the federal days with nothing configured at all', () => {
    // The point: every company gets these without setting anything, because
    // offDayReason has always applied them.
    const got = holidaysIn(build())
    expect(got.map((e) => e.dayKeys[0])).toEqual(['2026-11-26', '2026-11-27'])
    expect(got[0].title).toBe('Thanksgiving')
    expect(got[0].status).toBe('Closed')
  })

  it('capitalises a name written for the middle of a sentence', () => {
    // The rule calls it "the day after Thanksgiving" so a routine can report
    // "Skipped — the day after Thanksgiving."
    expect(holidaysIn(build())[1].title).toBe('The day after Thanksgiving')
  })

  it('a month with no holidays draws none', () => {
    expect(holidaysIn(build({}, OCT))).toEqual([])
  })

  it('draws nothing without a window rather than guessing how far to go', () => {
    expect(holidaysIn(buildCalendarEvents({}, {}))).toEqual([])
  })

  it('a federal day the company works is not drawn', () => {
    const got = holidaysIn(build({ companyHolidays: '[{"skip":"day_after_thanksgiving"}]' }))
    expect(got.map((e) => e.dayKeys[0])).toEqual(['2026-11-26'])
  })

  it('a day the company added is drawn under its own name', () => {
    const got = holidaysIn(build({ companyHolidays: '[{"date":"2026-11-02","name":"Team Offsite"}]' }))
    expect(got[0].dayKeys[0]).toBe('2026-11-02')
    expect(got[0].title).toBe('Team Offsite')
    expect(got[0].subtitle).toBe('Company holiday')
  })

  it('a malformed setting leaves the federal days standing', () => {
    // A typo in the setting must not make the office look open on Christmas.
    for (const bad of ['not json', '{}', '', null, undefined]) {
      expect(holidaysIn(build({ companyHolidays: bad })).map((e) => e.dayKeys[0]))
        .toEqual(['2026-11-26', '2026-11-27'])
    }
  })

  it('is not clickable, because the list is edited behind Payroll', () => {
    expect(holidaysIn(build())[0].link).toBe(null)
  })
})

describe('holidays behave like every other kind', () => {
  it('can be switched off by its chip', () => {
    expect(holidaysIn(filterCalendarEvents(build(), { kinds: { holiday: false } }))).toEqual([])
    expect(holidaysIn(filterCalendarEvents(build(), { kinds: {} })).length).toBeGreaterThan(0)
  })

  it('survives a business-unit filter, belonging to no unit', () => {
    // The company is shut for everyone; filtering to one unit must not hide it.
    const filtered = filterCalendarEvents(build(), { units: { 'HHH Building Services': true } })
    expect(holidaysIn(filtered).length).toBeGreaterThan(0)
  })

  it('sorts above everything — it is why the rest of the day is not happening', () => {
    const events = [
      { id: 'd', kind: 'delivery', dayKeys: ['2026-11-26'], title: 'Job' },
      { id: 'm', kind: 'meeting', dayKeys: ['2026-11-26'], title: 'L10' },
      { id: 't', kind: 'timeoff', dayKeys: ['2026-11-26'], title: 'Off' },
      { id: 'h', kind: 'holiday', dayKeys: ['2026-11-26'], title: 'Thanksgiving' },
    ]
    expect(groupEventsByDay(events)['2026-11-26'].map((e) => e.id)).toEqual(['h', 't', 'm', 'd'])
  })

  it('leaves every other kind exactly where it was', () => {
    const events = [
      { id: 'd', kind: 'delivery', dayKeys: ['2026-11-26'], title: 'Job' },
      { id: 's', kind: 'sales', dayKeys: ['2026-11-26'], title: 'Appt' },
      { id: 't', kind: 'timeoff', dayKeys: ['2026-11-26'], title: 'Off' },
    ]
    expect(groupEventsByDay(events)['2026-11-26'].map((e) => e.id)).toEqual(['t', 's', 'd'])
  })

  it('does not disturb the meetings drawn in the same window', () => {
    // Both are rules drawn across the same month; one must not consume the
    // other's window.
    const ev = build({
      meetingCadence: { l10_day: 'Monday', l10_time: '08:30' },
      companyHolidays: '[{"date":"2026-11-02","name":"Team Offsite"}]',
    })
    expect(ev.filter((e) => e.kind === 'meeting').map((e) => e.dayKeys[0]))
      .toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(holidaysIn(ev).map((e) => e.dayKeys[0])).toEqual(['2026-11-02', '2026-11-26', '2026-11-27'])
  })
})

describe('every kind the page can draw has an icon', () => {
  // This exists because adding the holiday kind crashed /company-calendar with
  // "Element type is invalid ... got: undefined": KINDS gained an entry and
  // KIND_ICON did not, so the filter chip rendered <undefined />. The guard and
  // the whole suite passed; only opening the page caught it. One assertion so
  // the next kind cannot do it again.
  it('KIND_ICON covers every KINDS id', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/pages/CompanyCalendar.jsx', 'utf8')
    const line = src.split(/\r?\n/).find((l) => l.startsWith('const KIND_ICON'))
    expect(line, 'KIND_ICON declaration not found').toBeTruthy()
    const mapped = [...line.matchAll(/(\w+):\s*\w+/g)].map((m) => m[1])
    for (const id of Object.keys(KINDS)) expect(mapped, `no icon for kind "${id}"`).toContain(id)
  })
})
