// EOS scorecard data plumbing — the parts that were silently reading zero.
//
// Bryce (HHH, 2026-09-21): "it's not picking up the metrics correctly...
// the numbers seem off." Recomputing every live metric for HHH server-side
// against the raw tables showed which ones, and why:
//
//   Total Man Hours / Dollars per Hour read 0. Crews clock in to `time_clock`
//     (1,430 punches for HHH, 46 last week alone — 591 hours). The scorecard
//     read `time_log`, the legacy typed-hours table: 85 rows, newest 9/4.
//   Meetings metrics read 0 the moment an entity was set. `appointments`
//     has no business_unit column, so filterByEntity dropped every row.
//   Meetings Attended read 0 always. Nothing in the app ever sets an
//     appointment's status to Completed; the lead page records `outcome`.
//   Cash Collected, entity-scoped, dropped 5,729 of 5,980 payments. They
//     carry an invoice_id, not a job_id, and the filter only followed job_id.
//   time_log.date is a timestamp ('2026-09-04T00:00:00+00:00'), compared as
//     a string against a bare 'YYYY-MM-DD' window end — so Sunday never
//     matched. Any timestamp column compared that way has the same hole.
//
// Everything here is pure so it can be unit-tested (eosMetrics.test.js).

import { zonedDayKey, DEFAULT_TZ } from './dateTz'
import { calendarDay } from './localDate'
import { entryHours } from './dailyHours'

// A date COLUMN carries no zone: a bare 'YYYY-MM-DD', or the same day wearing
// a timestamp's clothes ('2026-09-04T00:00:00+00:00' — every time_log.date row
// looks like this). lib/localDate is already the one rule for those and knows
// both shapes; this must not become a second copy of it.
const DATE_COLUMN = /^\d{4}-\d{2}-\d{2}(?:[T ]00:00:00(?:\.0+)?(?:Z|\+00(?::?00)?))?$/

/**
 * The calendar day a value belongs to.
 *
 * A date column means the day it names — ask localDate. A real instant (a
 * clock-in) belongs to the day it happened in the COMPANY's timezone, which
 * is not always the viewer's: an admin in Arizona must not push a Utah crew's
 * Sunday evening shift onto Monday.
 */
export function dayKeyOf(value, tz = DEFAULT_TZ) {
  if (!value) return null
  const s = String(value).trim()
  if (DATE_COLUMN.test(s)) return calendarDay(s) || null
  return zonedDayKey(s, tz) || null
}

/** Is this date-ish value inside the inclusive local-day window [sd, ed]? */
export function inDayWindow(value, sd, ed, tz = DEFAULT_TZ) {
  const k = dayKeyOf(value, tz)
  return !!k && k >= sd && k <= ed
}

/** Is this timestamp inside the inclusive instant window [start, end]?
 *  Parsed, not string-compared — '+00:00' and 'Z' suffixes don't sort. */
export function inInstantWindow(value, start, end) {
  if (!value) return false
  const t = new Date(value).getTime()
  if (!Number.isFinite(t)) return false
  return t >= new Date(start).getTime() && t <= new Date(end).getTime()
}

/** Hours worked inside a local-day window, from entries in time_clock's
 *  shape (real punches, or legacy rows merged via mergeJobHourSources).
 *  A shift belongs to the day it was clocked IN, in the company's timezone. */
export function hoursInWindow(entries, sd, ed, tz = DEFAULT_TZ) {
  let total = 0
  for (const e of entries || []) {
    if (!e) continue
    const stamp = e.clock_in || e.date
    if (!inDayWindow(stamp, sd, ed, tz)) continue
    total += entryHours(e)
  }
  return Math.round(total * 10) / 10
}

export function sameEntity(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase()
}

/** Keep only entries whose job sits in the entity. Entries not clocked to a
 *  job have no business unit and are left out of an entity-scoped total. */
export function filterHoursByEntity(entries, jobs, entity) {
  if (!entity) return entries || []
  const ids = new Set((jobs || []).filter(j => sameEntity(j.business_unit, entity)).map(j => String(j.id)))
  return (entries || []).filter(e => e?.job_id != null && ids.has(String(e.job_id)))
}

/**
 * The leftover: entries whose hours NO business unit can claim — clocked in
 * without picking a job, or onto a job that carries no business unit.
 *
 * These hours are real and they are paid, but every unit-scoped row has to
 * drop them, so they fall between the columns and nobody sees them. On HHH
 * that was 314 of 591 hours in one week — more than half the crew's time.
 *
 * Counting them makes the week add up: unit A + unit B + this = every hour
 * clocked. A job the page cannot see (archived) lands here too, which is
 * honest — if we cannot name its unit we must not pretend we can.
 */
export function filterHoursWithNoUnit(entries, jobs) {
  const unitOf = new Map((jobs || []).map(j => [String(j.id), j.business_unit]))
  return (entries || []).filter(e => {
    if (e?.job_id == null) return true
    const unit = unitOf.get(String(e.job_id))
    return !unit || !String(unit).trim()
  })
}

// ── Meetings ────────────────────────────────────────────────────────────

// Calendar entries that are crew scheduling, not a meeting anyone set.
const NOT_A_MEETING = new Set(['job', 'recurring job', 'block'])

/** A meeting someone SET: a sales call, consultation, site visit, follow-up —
 *  anything on the calendar that isn't a job block. */
export function isSetMeeting(appt) {
  if (!appt) return false
  const type = String(appt.appointment_type || '').trim().toLowerCase()
  return !NOT_A_MEETING.has(type)
}

const DID_NOT_HAPPEN = /no[\s-]?show|cancel|resched|missed/i

/** A meeting that happened: status Completed, or an outcome was recorded
 *  that isn't a no-show / cancellation. */
export function isAttendedMeeting(appt) {
  if (!appt || !isSetMeeting(appt)) return false
  if (String(appt.status || '').toLowerCase() === 'completed') return true
  const outcome = String(appt.outcome || '').trim()
  return !!outcome && !DID_NOT_HAPPEN.test(outcome)
}

/** Appointments have no business unit of their own; they take the linked
 *  lead's. With no entity asked for, everything passes. */
export function filterAppointmentsByEntity(appointments, leads, entity) {
  if (!entity) return appointments || []
  const leadBu = new Map((leads || []).map(l => [String(l.id), l.business_unit]))
  return (appointments || []).filter(a => {
    const bu = a?.lead?.business_unit ?? (a?.lead_id != null ? leadBu.get(String(a.lead_id)) : null)
    return sameEntity(bu, entity)
  })
}

// ── Money ───────────────────────────────────────────────────────────────

/** Payments in an entity, resolved through the payment's own job_id OR its
 *  invoice's job_id — almost every payment only carries the invoice. */
export function filterPaymentsByEntity(payments, invoices, jobs, entity) {
  if (!entity) return payments || []
  const jobIds = new Set((jobs || []).filter(j => sameEntity(j.business_unit, entity)).map(j => String(j.id)))
  const invoiceJob = new Map((invoices || []).map(i => [String(i.id), i.job_id]))
  return (payments || []).filter(p => {
    const jobId = p?.job_id ?? (p?.invoice_id != null ? invoiceJob.get(String(p.invoice_id)) : null)
    return jobId != null && jobIds.has(String(jobId))
  })
}
