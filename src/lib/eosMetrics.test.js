import { describe, it, expect } from 'vitest'
import {
  dayKeyOf, inDayWindow, inInstantWindow, hoursInWindow, filterHoursByEntity, filterHoursWithNoUnit,
  isSetMeeting, isAttendedMeeting, filterAppointmentsByEntity, filterPaymentsByEntity,
} from './eosMetrics'

// Denver. The HHH week of 2026-09-14 (Mon) .. 2026-09-20 (Sun).
const SD = '2026-09-14', ED = '2026-09-20'

describe('dayKeyOf / inDayWindow — timestamps vs bare dates', () => {
  it('leaves a bare date alone', () => {
    expect(dayKeyOf('2026-09-20')).toBe('2026-09-20')
  })

  it('buckets a timestamp in the company timezone, not UTC', () => {
    // 11pm Sunday in Denver is 5am Monday UTC. It is still Sunday.
    expect(dayKeyOf('2026-09-21T05:00:00+00:00')).toBe('2026-09-20')
  })

  it('the Sunday time_log bug: a timestamp on the last day of the window matches', () => {
    // As strings, '2026-09-20T18:00:00+00:00' <= '2026-09-20' is FALSE, so a
    // Sunday row never counted. Bucketed to a day, it does.
    expect(inDayWindow('2026-09-20T18:00:00+00:00', SD, ED)).toBe(true)
    expect(inDayWindow('2026-09-21T18:00:00+00:00', SD, ED)).toBe(false)
  })

  it('a date column stored as UTC midnight means that calendar day', () => {
    // time_log.date: '2026-09-04T00:00:00+00:00'. Zoned to Denver that is
    // 6pm on the 3rd — the wrong day. It names the 4th.
    expect(dayKeyOf('2026-09-04T00:00:00+00:00')).toBe('2026-09-04')
    expect(dayKeyOf('2026-09-04T00:00:00Z')).toBe('2026-09-04')
    expect(inDayWindow('2026-09-20T00:00:00+00:00', SD, ED)).toBe(true)
  })

  it('rejects nulls and junk instead of matching them', () => {
    expect(inDayWindow(null, SD, ED)).toBe(false)
    expect(inDayWindow('soon', SD, ED)).toBe(false)
  })
})

describe('inInstantWindow', () => {
  const S = '2026-09-14T06:00:00.000Z', E = '2026-09-21T05:59:59.999Z'
  it('compares instants, so +00:00 and Z spellings agree', () => {
    expect(inInstantWindow('2026-09-21T05:59:59.999+00:00', S, E)).toBe(true)
    expect(inInstantWindow('2026-09-21T06:00:00+00:00', S, E)).toBe(false)
    expect(inInstantWindow('2026-09-14T05:59:59+00:00', S, E)).toBe(false)
  })
})

describe('hoursInWindow — from real punches', () => {
  const punches = [
    { id: 1, job_id: 10, clock_in: '2026-09-14T13:00:00+00:00', clock_out: '2026-09-14T21:00:00+00:00', total_hours: 8 },
    { id: 2, job_id: 10, clock_in: '2026-09-20T23:30:00+00:00', clock_out: '2026-09-21T02:00:00+00:00', total_hours: 2.5 }, // Sunday evening Denver
    { id: 3, job_id: 11, clock_in: '2026-09-21T13:00:00+00:00', clock_out: '2026-09-21T15:00:00+00:00', total_hours: 2 },   // Monday — next week
    { id: 4, job_id: 10, clock_in: '2026-09-15T13:00:00+00:00', clock_out: null, total_hours: null },                      // still clocked in
  ]

  it('sums the week and keeps a Sunday-evening shift in that week', () => {
    expect(hoursInWindow(punches, SD, ED)).toBe(10.5)
  })

  it('derives hours from the clock pair when total_hours is blank', () => {
    expect(hoursInWindow([{ clock_in: '2026-09-15T13:00:00Z', clock_out: '2026-09-15T17:30:00Z' }], SD, ED)).toBe(4.5)
  })

  it('an open shift counts nothing rather than guessing', () => {
    expect(hoursInWindow([punches[3]], SD, ED)).toBe(0)
  })

  it('entity scoping follows the job, and drops entries with no job', () => {
    const jobs = [{ id: 10, business_unit: 'HHH Building Services' }, { id: 11, business_unit: 'Energy Scout' }]
    expect(filterHoursByEntity(punches, jobs, 'energy scout').map(p => p.id)).toEqual([3])
    expect(filterHoursByEntity([{ id: 9, job_id: null }], jobs, 'Energy Scout')).toEqual([])
    expect(filterHoursByEntity(punches, jobs, null)).toHaveLength(4)
  })
})

describe('filterHoursWithNoUnit — the hours that fall between the columns', () => {
  const jobs = [
    { id: 10, business_unit: 'HHH Building Services' },
    { id: 11, business_unit: 'Energy Scout' },
    { id: 12, business_unit: null },
    { id: 13, business_unit: '   ' },
  ]
  const entries = [
    { id: 'a', job_id: 10, clock_in: '2026-09-15T13:00:00Z', clock_out: '2026-09-15T21:00:00Z', total_hours: 8 },
    { id: 'b', job_id: null, clock_in: '2026-09-15T13:00:00Z', clock_out: '2026-09-15T18:00:00Z', total_hours: 5 },
    { id: 'c', job_id: 12, clock_in: '2026-09-16T13:00:00Z', clock_out: '2026-09-16T16:00:00Z', total_hours: 3 },
    { id: 'd', job_id: 13, clock_in: '2026-09-16T13:00:00Z', clock_out: '2026-09-16T15:00:00Z', total_hours: 2 },
    { id: 'e', job_id: 99, clock_in: '2026-09-17T13:00:00Z', clock_out: '2026-09-17T14:00:00Z', total_hours: 1 },
    { id: 'f', job_id: 11, clock_in: '2026-09-17T13:00:00Z', clock_out: '2026-09-17T17:00:00Z', total_hours: 4 },
  ]

  it('catches a punch with no job, a job with no unit, and a blank unit', () => {
    expect(filterHoursWithNoUnit(entries, jobs).map(e => e.id)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('counts a punch on a job the page cannot see, rather than losing it', () => {
    // Job 99 is archived or past the row cap. We cannot name its unit, so we
    // must not pretend we can — but the hours were still worked.
    expect(filterHoursWithNoUnit(entries, jobs).some(e => e.id === 'e')).toBe(true)
  })

  it('the week adds up: unit A + unit B + no-unit = every hour clocked', () => {
    const all = hoursInWindow(entries, SD, ED)
    const hhh = hoursInWindow(filterHoursByEntity(entries, jobs, 'HHH Building Services'), SD, ED)
    const es = hoursInWindow(filterHoursByEntity(entries, jobs, 'Energy Scout'), SD, ED)
    const none = hoursInWindow(filterHoursWithNoUnit(entries, jobs), SD, ED)
    expect(hhh + es + none).toBe(all)
    expect(all).toBe(23)
  })

  it('returns nothing for an empty or null list', () => {
    expect(filterHoursWithNoUnit([], jobs)).toEqual([])
    expect(filterHoursWithNoUnit(null, jobs)).toEqual([])
  })
})

describe('meetings', () => {
  it('a job block on the calendar is not a meeting anyone set', () => {
    expect(isSetMeeting({ appointment_type: 'Job' })).toBe(false)
    expect(isSetMeeting({ appointment_type: 'Recurring Job' })).toBe(false)
    expect(isSetMeeting({ appointment_type: 'Block' })).toBe(false)
    expect(isSetMeeting({ appointment_type: 'Sales Call' })).toBe(true)
    expect(isSetMeeting({ appointment_type: null, lead_id: 5 })).toBe(true)
  })

  it('attended means Completed OR a recorded outcome that is not a no-show', () => {
    expect(isAttendedMeeting({ status: 'Completed' })).toBe(true)
    expect(isAttendedMeeting({ status: 'Scheduled', outcome: 'Quoted' })).toBe(true)
    expect(isAttendedMeeting({ status: 'Scheduled', outcome: 'No Show' })).toBe(false)
    expect(isAttendedMeeting({ status: 'Scheduled', outcome: 'Cancelled' })).toBe(false)
    expect(isAttendedMeeting({ status: 'Scheduled', outcome: null })).toBe(false)
  })

  it('entity scoping goes through the lead, since appointments have no business unit', () => {
    const leads = [{ id: 1, business_unit: 'Energy Scout' }, { id: 2, business_unit: null }]
    const appts = [{ id: 'a', lead_id: 1 }, { id: 'b', lead_id: 2 }, { id: 'c', lead_id: null }, { id: 'd', lead: { business_unit: 'Energy Scout' } }]
    expect(filterAppointmentsByEntity(appts, leads, 'Energy Scout').map(a => a.id)).toEqual(['a', 'd'])
    expect(filterAppointmentsByEntity(appts, leads, null)).toHaveLength(4)
  })
})

describe('payments by entity — through the invoice', () => {
  const jobs = [{ id: 100, business_unit: 'HHH Building Services' }, { id: 200, business_unit: 'Energy Scout' }]
  const invoices = [{ id: 7, job_id: 100 }, { id: 8, job_id: 200 }]
  const payments = [
    { id: 'p1', job_id: 100, invoice_id: null, amount: 10 },
    { id: 'p2', job_id: null, invoice_id: 7, amount: 20 },   // the common shape
    { id: 'p3', job_id: null, invoice_id: 8, amount: 30 },
    { id: 'p4', job_id: null, invoice_id: null, amount: 40 },
  ]

  it('finds the job via the invoice when the payment has none', () => {
    expect(filterPaymentsByEntity(payments, invoices, jobs, 'HHH Building Services').map(p => p.id)).toEqual(['p1', 'p2'])
  })

  it('an unlinked payment belongs to no entity, but to the company total', () => {
    expect(filterPaymentsByEntity(payments, invoices, jobs, 'Energy Scout').map(p => p.id)).toEqual(['p3'])
    expect(filterPaymentsByEntity(payments, invoices, jobs, null)).toHaveLength(4)
  })
})
