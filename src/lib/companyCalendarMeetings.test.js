import { describe, it, expect } from 'vitest'
import {
  buildCalendarEvents,
  filterCalendarEvents,
  groupEventsByDay,
  calendarSourcesSentence,
  KINDS,
} from './companyCalendar'

// October 2026 — the 1st is a Thursday, so Mondays are 5, 12, 19, 26.
const WINDOW = { from: '2026-10-01', through: '2026-10-31' }
const HHH = { l10_day: 'Monday', l10_time: '08:30', quarterly_next: '2026-10-10', annual_next: '' }

const meetingsIn = (events) => events.filter((e) => e.kind === 'meeting')

describe('the calendar carries company meetings', () => {
  it('has a meetings kind at all — the gap Bryce reported', () => {
    expect(KINDS.meeting).toBeTruthy()
    expect(KINDS.meeting.writes.source).toBe('EOS')
  })

  it('names EOS as a source, so the page says where meetings come from', () => {
    expect(calendarSourcesSentence()).toContain('eos')
  })

  it('draws the cadence across the month', () => {
    const ev = buildCalendarEvents({ meetingCadence: HHH }, { meetingWindow: WINDOW })
    const l10 = meetingsIn(ev).filter((e) => e.title === 'L10 Meeting')
    expect(l10.map((e) => e.dayKeys[0]))
      .toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(l10[0].subtitle).toBe('8:30 AM')
    expect(l10[0].link).toBe('/admin/eos')
  })

  it('draws the quarterly session beside the weekly ones', () => {
    const ev = buildCalendarEvents({ meetingCadence: HHH }, { meetingWindow: WINDOW })
    expect(meetingsIn(ev).find((e) => e.title === 'Quarterly Session').dayKeys).toEqual(['2026-10-10'])
  })

  it('draws nothing without a window rather than guessing how far to go', () => {
    expect(meetingsIn(buildCalendarEvents({ meetingCadence: HHH }, {}))).toEqual([])
  })

  it('draws nothing when no cadence has been set', () => {
    expect(meetingsIn(buildCalendarEvents({}, { meetingWindow: WINDOW }))).toEqual([])
  })

  it('a moved week shows that it moved', () => {
    const overrides = [{ id: 1, series_kind: 'l10', series_date: '2026-10-12', meeting_date: '2026-10-13', start_time: '09:00:00', cancelled: false }]
    const ev = buildCalendarEvents({ meetingCadence: HHH, meetingOverrides: overrides }, { meetingWindow: WINDOW })
    const moved = meetingsIn(ev).find((e) => e.dayKeys[0] === '2026-10-13')
    expect(moved.subtitle).toBe('9:00 AM · moved')
    expect(moved.status).toBe('Moved')
    expect(meetingsIn(ev).some((e) => e.dayKeys[0] === '2026-10-12')).toBe(false)
  })

  it('a cancelled week is simply not there', () => {
    const overrides = [{ id: 2, series_kind: 'l10', series_date: '2026-10-19', cancelled: true, meeting_date: null }]
    const ev = buildCalendarEvents({ meetingCadence: HHH, meetingOverrides: overrides }, { meetingWindow: WINDOW })
    expect(meetingsIn(ev).some((e) => e.dayKeys[0] === '2026-10-19')).toBe(false)
  })

  it('a one-off all-hands appears under its own name', () => {
    const overrides = [{ id: 3, series_kind: 'custom', series_date: null, meeting_date: '2026-10-14', start_time: '15:00:00', title: 'All-Hands', cancelled: false }]
    const ev = buildCalendarEvents({ meetingCadence: HHH, meetingOverrides: overrides }, { meetingWindow: WINDOW })
    expect(meetingsIn(ev).find((e) => e.dayKeys[0] === '2026-10-14').title).toBe('All-Hands')
  })
})

describe('meetings behave like every other kind', () => {
  const ev = () => buildCalendarEvents({ meetingCadence: HHH }, { meetingWindow: WINDOW })

  it('can be switched off by its chip', () => {
    expect(meetingsIn(filterCalendarEvents(ev(), { kinds: { meeting: false } }))).toEqual([])
    expect(meetingsIn(filterCalendarEvents(ev(), { kinds: {} })).length).toBeGreaterThan(0)
  })

  it('survives a business-unit filter, having no unit of its own', () => {
    // A company meeting belongs to the company, not to a unit. Filtering to
    // one unit must not hide it, or switching units would silently drop the
    // L10 off the calendar.
    const filtered = filterCalendarEvents(ev(), { units: { 'HHH Building Services': true } })
    expect(meetingsIn(filtered).length).toBeGreaterThan(0)
  })

  it('sorts above the work but below time off', () => {
    const events = [
      { id: 'd', kind: 'delivery', dayKeys: ['2026-10-05'], title: 'Job' },
      { id: 'm', kind: 'meeting', dayKeys: ['2026-10-05'], title: 'L10 Meeting' },
      { id: 's', kind: 'sales', dayKeys: ['2026-10-05'], title: 'Appt' },
      { id: 't', kind: 'timeoff', dayKeys: ['2026-10-05'], title: 'Off' },
    ]
    expect(groupEventsByDay(events)['2026-10-05'].map((e) => e.id)).toEqual(['t', 'm', 's', 'd'])
  })

  it('leaves every other kind exactly where it was', () => {
    // The fractional rank exists so nothing else had to move.
    const events = [
      { id: 'd', kind: 'delivery', dayKeys: ['2026-10-05'], title: 'Job' },
      { id: 's', kind: 'sales', dayKeys: ['2026-10-05'], title: 'Appt' },
      { id: 't', kind: 'timeoff', dayKeys: ['2026-10-05'], title: 'Off' },
    ]
    expect(groupEventsByDay(events)['2026-10-05'].map((e) => e.id)).toEqual(['t', 's', 'd'])
  })
})
