import { describe, it, expect } from 'vitest'
import {
  buildCalendarEvents,
  calendarSourcesSentence,
  filterCalendarEvents,
  groupEventsByDay,
  expandDateRange,
  monthGrid,
  labelForTimeOff,
} from './companyCalendar'

const employees = [{ id: 7, name: 'Cole Westcott' }, { id: 9, name: 'Doug Webb' }]

describe('expandDateRange', () => {
  it('returns a single day when start === end', () => {
    expect(expandDateRange('2026-08-03', '2026-08-03')).toEqual(['2026-08-03'])
  })

  it('expands a multi-day range inclusively', () => {
    expect(expandDateRange('2026-08-03', '2026-08-06')).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
    ])
  })

  it('spans a month boundary', () => {
    expect(expandDateRange('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02',
    ])
  })

  it('falls back to the start day when end is missing or backwards', () => {
    expect(expandDateRange('2026-08-03', null)).toEqual(['2026-08-03'])
    expect(expandDateRange('2026-08-05', '2026-08-01')).toEqual(['2026-08-05'])
  })
})

describe('buildCalendarEvents', () => {
  it('maps each source to its kind and keeps the business unit', () => {
    const events = buildCalendarEvents({
      appointments: [{ id: 1, start_time: '2026-08-04T18:00:00Z', title: 'Site visit', salesperson_id: 9, lead_id: 55 }],
      jobs: [{ id: 2, start_date: '2026-08-05T16:00:00Z', job_title: 'Window clean', business_unit: 'HHH Building Services' }],
      timeOff: [{ id: 3, employee_id: 7, start_date: '2026-08-10', end_date: '2026-08-12', request_type: 'pto', status: 'approved' }],
      employees,
    })
    const byKind = Object.fromEntries(events.map((e) => [e.kind, e]))
    expect(byKind.sales.title).toBe('Site visit')
    expect(byKind.sales.subtitle).toBe('Doug Webb')
    expect(byKind.sales.link).toBe('/leads/55')
    expect(byKind.delivery.businessUnit).toBe('HHH Building Services')
    expect(byKind.delivery.link).toBe('/jobs/2')
    expect(byKind.timeoff.title).toBe('Cole Westcott — PTO')
  })

  it('spans time off across every day it covers', () => {
    const [pto] = buildCalendarEvents({
      timeOff: [{ id: 3, employee_id: 7, start_date: '2026-08-10', end_date: '2026-08-12', request_type: 'pto' }],
      employees,
    })
    expect(pto.dayKeys).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
    expect(pto.subtitle).toBe('3 days')
  })

  it('buckets an evening Mountain-time job on its own local day, not the next', () => {
    // 2026-08-05 19:00 MDT === 2026-08-06 01:00 UTC — must stay on the 5th.
    const [job] = buildCalendarEvents({
      jobs: [{ id: 2, start_date: '2026-08-06T01:00:00Z', job_title: 'Evening job' }],
    })
    expect(job.dayKeys).toEqual(['2026-08-05'])
  })

  it('skips Block appointments and rows with no date', () => {
    const events = buildCalendarEvents({
      appointments: [
        { id: 1, start_time: '2026-08-04T18:00:00Z', appointment_type: 'Block', title: 'Blocked' },
        { id: 2, title: 'No date' },
      ],
      jobs: [{ id: 3, job_title: 'Unscheduled' }],
    })
    expect(events).toHaveLength(0)
  })
})

describe('filterCalendarEvents', () => {
  const events = buildCalendarEvents({
    appointments: [{ id: 1, start_time: '2026-08-04T18:00:00Z', title: 'Site visit' }],
    jobs: [
      { id: 2, start_date: '2026-08-05T16:00:00Z', job_title: 'Clean', business_unit: 'HHH Building Services' },
      { id: 3, start_date: '2026-08-06T16:00:00Z', job_title: 'Retrofit', business_unit: 'Energy Scout' },
    ],
    timeOff: [{ id: 4, employee_id: 7, start_date: '2026-08-10', end_date: '2026-08-10' }],
    employees,
  })

  it('hides a kind when its toggle is off', () => {
    const out = filterCalendarEvents(events, { kinds: { timeoff: false } })
    expect(out.some((e) => e.kind === 'timeoff')).toBe(false)
    expect(out.some((e) => e.kind === 'sales')).toBe(true)
  })

  it('filters jobs by business unit but keeps events that have none', () => {
    const out = filterCalendarEvents(events, { units: { 'Energy Scout': false } })
    const titles = out.map((e) => e.title)
    expect(titles).toContain('Clean')          // other BU stays
    expect(titles).not.toContain('Retrofit')   // filtered BU dropped
    expect(titles).toContain('Site visit')     // no BU -> governed by its kind
  })

  it('shows everything when no filters are set', () => {
    expect(filterCalendarEvents(events, {})).toHaveLength(events.length)
  })
})

describe('groupEventsByDay', () => {
  it('puts a multi-day event on each of its days', () => {
    const events = buildCalendarEvents({
      timeOff: [{ id: 3, employee_id: 7, start_date: '2026-08-10', end_date: '2026-08-11' }],
      employees,
    })
    const map = groupEventsByDay(events)
    expect(map['2026-08-10']).toHaveLength(1)
    expect(map['2026-08-11']).toHaveLength(1)
  })

  it('sorts time off first so it is never buried behind "+N more"', () => {
    const events = buildCalendarEvents({
      jobs: [
        { id: 1, start_date: '2026-08-10T16:00:00Z', job_title: 'Job A' },
        { id: 2, start_date: '2026-08-10T17:00:00Z', job_title: 'Job B' },
        { id: 3, start_date: '2026-08-10T18:00:00Z', job_title: 'Job C' },
        { id: 4, start_date: '2026-08-10T19:00:00Z', job_title: 'Job D' },
      ],
      timeOff: [{ id: 5, employee_id: 7, start_date: '2026-08-10', end_date: '2026-08-10' }],
      employees,
    })
    const day = groupEventsByDay(events)['2026-08-10']
    expect(day[0].kind).toBe('timeoff')
    // and the jobs keep their original relative order behind it
    expect(day.slice(1).map((e) => e.title)).toEqual(['Job A', 'Job B', 'Job C', 'Job D'])
  })
})

describe('monthGrid', () => {
  it('pads leading blanks to the first weekday and covers the month', () => {
    // Aug 2026 starts on a Saturday (index 6) and has 31 days.
    const cells = monthGrid(2026, 7)
    expect(cells.slice(0, 6).every((c) => c === null)).toBe(true)
    expect(cells[6]).toEqual({ day: 1, key: '2026-08-01' })
    expect(cells.filter(Boolean)).toHaveLength(31)
  })
})

describe('labelForTimeOff', () => {
  it('maps known types and titles unknown ones', () => {
    expect(labelForTimeOff('pto')).toBe('PTO')
    expect(labelForTimeOff('sick')).toBe('Sick')
    expect(labelForTimeOff('')).toBe('Time off')
    expect(labelForTimeOff('bereavement')).toBe('Bereavement')
  })
})

// ── Service visits ────────────────────────────────────────────────────
// A visit that is OWED but not booked. Same jobs rows as delivery, keyed on
// service_due_date instead of start_date.
describe('service visits', () => {
  const svc = (over = {}) => ({
    id: 7, job_title: 'Lights flickering', service_kind: 'warranty',
    service_due_date: '2026-09-01', status: 'Chillin', customer_name: 'Acme', ...over,
  })

  it('appears on the day it is due', () => {
    const [ev] = buildCalendarEvents({ jobs: [svc()] })
    expect(ev.kind).toBe('service')
    expect(ev.dayKeys).toEqual(['2026-09-01'])
    expect(ev.subtitle).toContain('Warranty')
  })

  it('uses the bare date as-is, with no timezone conversion', () => {
    // service_due_date is a plain DATE column. Running it through a zone
    // conversion is what slides a visit onto the previous day.
    const [ev] = buildCalendarEvents({ jobs: [svc({ service_due_date: '2026-01-01' })] })
    expect(ev.dayKeys).toEqual(['2026-01-01'])
  })

  it('drops out once the visit is scheduled', () => {
    // Delivery already shows it on the booked day; listing the due date too
    // puts one visit on the calendar twice, on two different days.
    const events = buildCalendarEvents({ jobs: [svc({ start_date: '2026-09-05T15:00:00Z' })] })
    expect(events.filter(e => e.kind === 'service')).toHaveLength(0)
    expect(events.filter(e => e.kind === 'delivery')).toHaveLength(1)
  })

  it('drops out once the visit is done', () => {
    for (const status of ['Completed', 'Verified Complete', 'Paid', 'Closed', 'Archived']) {
      expect(buildCalendarEvents({ jobs: [svc({ status })] })).toHaveLength(0)
    }
  })

  it('ignores ordinary jobs that have no due date', () => {
    const events = buildCalendarEvents({ jobs: [{ id: 1, start_date: '2026-09-05T15:00:00Z' }] })
    expect(events.filter(e => e.kind === 'service')).toHaveLength(0)
  })

  it('is named in the sources sentence the page prints', () => {
    // The promise on screen is derived from KINDS, so adding a writer without
    // telling anyone is not possible.
    expect(calendarSourcesSentence()).toContain('service visits')
  })
})
