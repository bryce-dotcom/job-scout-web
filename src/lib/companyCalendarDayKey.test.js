import { describe, it, expect } from 'vitest'
import { buildCalendarEvents, groupEventsByDay, dayKeyOfLocalDate } from './companyCalendar'

// The appointments calendar looks up "who is off today" with
// dayKeyOfLocalDate(date). If that key does not match the keys
// groupEventsByDay produces, the lookup finds nothing — and an empty result
// looks exactly like "nobody is off", not like a bug. These tests exist to
// make that mismatch impossible to ship.

const employees = [{ id: 7, name: 'London Miller' }]

describe('the pill finds the time off that exists', () => {
  it('a single-day request is found under the day it falls on', () => {
    const events = buildCalendarEvents({
      timeOff: [{ id: 1, employee_id: 7, start_date: '2026-08-20', end_date: '2026-08-20', request_type: 'pto', status: 'approved' }],
      employees,
    }).filter(e => e.kind === 'timeoff')
    const byDay = groupEventsByDay(events)
    expect(byDay[dayKeyOfLocalDate(new Date(2026, 7, 20))]).toHaveLength(1)
  })

  it('a multi-day request is found on every day it covers, including the last', () => {
    const events = buildCalendarEvents({
      timeOff: [{ id: 2, employee_id: 7, start_date: '2026-08-24', end_date: '2026-08-26', request_type: 'vacation', status: 'approved' }],
      employees,
    }).filter(e => e.kind === 'timeoff')
    const byDay = groupEventsByDay(events)
    for (const d of [24, 25, 26]) {
      expect(byDay[dayKeyOfLocalDate(new Date(2026, 7, d))], `day ${d}`).toHaveLength(1)
    }
    expect(byDay[dayKeyOfLocalDate(new Date(2026, 7, 27))]).toBeUndefined()
  })

  it('a day with nobody off has no entry, so the pill stays hidden', () => {
    const byDay = groupEventsByDay([])
    expect(byDay[dayKeyOfLocalDate(new Date(2026, 7, 20))]).toBeUndefined()
  })
})

describe('dayKeyOfLocalDate', () => {
  it('uses local calendar parts, not a UTC conversion', () => {
    // Local midnight — toISOString() would move this to the previous day for
    // any viewer east of UTC. The key must be the date a person sees.
    expect(dayKeyOfLocalDate(new Date(2026, 7, 20, 0, 0, 0))).toBe('2026-08-20')
    expect(dayKeyOfLocalDate(new Date(2026, 7, 20, 23, 59, 59))).toBe('2026-08-20')
  })

  it('zero-pads month and day so keys sort and compare as strings', () => {
    expect(dayKeyOfLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('survives a missing or invalid date rather than throwing in a render', () => {
    expect(dayKeyOfLocalDate(null)).toBe('')
    expect(dayKeyOfLocalDate(new Date('nonsense'))).toBe('')
  })
})
