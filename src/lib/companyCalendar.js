import { localDateStr } from './localDate'
// Company Calendar — one month view combining what the business actually has
// on the books: Sales (appointments), Delivery (scheduled jobs), and Employee
// time off. Alayda: "seeing events on the calendar would be super helpful —
// like when guys take time off & for how long" (feedback b387ab3f).
//
// Pure functions only, so the day-bucketing and filtering are unit-testable
// and the page stays a thin renderer.
//
// Day bucketing note: appointments/jobs store TIMESTAMPS, so they go through
// zonedDayKey (Mountain) — a 6pm Utah job must not land on the next day for a
// viewer in another zone. time_off_requests stores plain DATE columns
// (YYYY-MM-DD) with no zone, so those are used as-is; running a bare date
// through a timezone conversion is what makes days drift.

import { zonedDayKey, DEFAULT_TZ } from './dateTz'

/**
 * What writes to the Company Calendar.
 *
 * Bryce: "Time off writes to the company calendar, Job Board writes to the
 * calendar and Lead Setter writes to the calendar... it should be specified
 * how to write to the company calendar."
 *
 * It is specified here, and this is the whole list. Three things reach this
 * calendar and nothing else does — a Service Visit due next Tuesday, a
 * recurring job's next spawn, a fleet service booking and a route are all
 * invisible on it today. That is not an oversight to fix silently; it is a
 * decision about what "the company calendar" means, and the answer belongs in
 * one readable place rather than spread across three loops.
 *
 * `writes` is what a person needs to know: which screen creates this, and what
 * has to be true before it appears. The calendar page shows these, so nobody
 * has to guess why their thing is or isn't on it.
 */
export const KINDS = {
  sales: {
    id: 'sales',
    label: 'Sales',
    color: '#3b82f6',
    writes: { source: 'Appointments', bookedIn: 'Lead Setter', appearsWhen: 'an appointment is booked' },
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    color: '#5a6349',
    writes: { source: 'Jobs', bookedIn: 'Job Board', appearsWhen: 'a job has a scheduled date' },
  },
  timeoff: {
    id: 'timeoff',
    label: 'Time Off',
    color: '#a855f7',
    writes: { source: 'Time Off Requests', bookedIn: 'Team', appearsWhen: 'a request is approved' },
  },
}

// One sentence naming every writer, for the calendar page to print. Derived
// from KINDS so it cannot drift from what actually gets built.
export function calendarSourcesSentence() {
  const parts = Object.values(KINDS).map(k => `${k.writes.source.toLowerCase()} (${k.writes.appearsWhen})`)
  if (parts.length < 2) return parts[0] || ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const dayKeyOfDate = (d) => String(d || '').slice(0, 10)

/**
 * The day key for a JS Date, from its LOCAL parts.
 *
 * Lives here beside dayKeyOfDate so the two formats cannot drift: a lookup
 * built with a different key silently finds nothing, which looks exactly like
 * 'nobody is off today' rather than like a bug. Deliberately not
 * toISOString(), which converts to UTC and lands on the previous day for any
 * viewer far enough east.
 */
// The same rule payroll needs, so there is one implementation of it.
export const dayKeyOfLocalDate = localDateStr

// Every YYYY-MM-DD from start..end inclusive (time off spans days).
export function expandDateRange(start, end) {
  const s = dayKeyOfDate(start)
  const e = dayKeyOfDate(end) || s
  if (!s) return []
  const out = []
  const cur = new Date(s + 'T12:00:00') // midday avoids DST edge shifts
  const last = new Date(e + 'T12:00:00')
  if (isNaN(cur) || isNaN(last) || last < cur) return s ? [s] : []
  let guard = 0
  while (cur <= last && guard++ < 400) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/**
 * Normalize the three sources into one event list.
 * Each event: { id, kind, dayKeys[], title, subtitle, businessUnit, link, status }
 */
export function buildCalendarEvents({ appointments = [], jobs = [], timeOff = [], employees = [] } = {}, { tz = DEFAULT_TZ } = {}) {
  const empName = new Map((employees || []).map((e) => [String(e.id), e.name]))
  const events = []

  for (const a of appointments || []) {
    if (!a || !a.start_time) continue
    if (a.appointment_type === 'Block') continue // blocked time isn't a company event
    events.push({
      id: `appt-${a.id}`,
      kind: 'sales',
      dayKeys: [zonedDayKey(a.start_time, tz)],
      title: a.title || a.lead?.customer_name || 'Appointment',
      subtitle: empName.get(String(a.salesperson_id)) || a.location || '',
      businessUnit: a.business_unit || null,
      status: a.status || null,
      link: a.lead_id ? `/leads/${a.lead_id}` : '/appointments',
      time: a.start_time,
    })
  }

  for (const j of jobs || []) {
    if (!j || !j.start_date) continue
    events.push({
      id: `job-${j.id}`,
      kind: 'delivery',
      dayKeys: [zonedDayKey(j.start_date, tz)],
      title: j.job_title || j.job_id || 'Job',
      subtitle: j.customer?.name || j.assigned_team || '',
      businessUnit: j.business_unit || null,
      status: j.status || null,
      link: `/jobs/${j.id}`,
      time: j.start_date,
    })
  }

  for (const t of timeOff || []) {
    if (!t || !t.start_date) continue
    const who = empName.get(String(t.employee_id)) || 'Employee'
    const days = expandDateRange(t.start_date, t.end_date)
    events.push({
      id: `pto-${t.id}`,
      kind: 'timeoff',
      dayKeys: days,
      title: `${who} — ${labelForTimeOff(t.request_type)}`,
      subtitle: days.length > 1 ? `${days.length} days` : '',
      businessUnit: null,
      status: t.status || 'pending',
      link: '/payroll',
      time: null,
    })
  }

  return events
}

export function labelForTimeOff(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'pto' || t === 'vacation') return 'PTO'
  if (t === 'sick') return 'Sick'
  if (t === 'unpaid') return 'Unpaid'
  if (!t) return 'Time off'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

/**
 * Filter by the toggles. Business-unit filtering only applies to events that
 * actually carry a business unit (jobs) — appointments and time off have none,
 * so they're governed by their own kind toggle rather than being filtered out.
 */
export function filterCalendarEvents(events, { kinds = {}, units = {}, includeUnassignedUnit = true } = {}) {
  const kindOn = (k) => kinds[k] !== false
  const anyUnitFilter = Object.keys(units).length > 0
  return (events || []).filter((ev) => {
    if (!kindOn(ev.kind)) return false
    if (!anyUnitFilter) return true
    if (!ev.businessUnit) return includeUnassignedUnit
    return units[ev.businessUnit] !== false
  })
}

// Group events into { 'YYYY-MM-DD': [events] } for the month grid.
//
// Within a day, time off sorts FIRST. A day cell only shows the first few
// events before collapsing to "+N more", and on a busy delivery day that
// buried the very thing this calendar was asked for — knowing who's off
// (Alayda b387ab3f). Everything else keeps its natural order.
const KIND_PRIORITY = { timeoff: 0, sales: 1, delivery: 2 }

export function groupEventsByDay(events) {
  const map = {}
  for (const ev of events || []) {
    for (const key of ev.dayKeys || []) {
      if (!key) continue
      ;(map[key] ||= []).push(ev)
    }
  }
  for (const key of Object.keys(map)) {
    map[key] = map[key]
      .map((ev, i) => ({ ev, i }))
      .sort((a, b) => (KIND_PRIORITY[a.ev.kind] ?? 9) - (KIND_PRIORITY[b.ev.kind] ?? 9) || a.i - b.i)
      .map((x) => x.ev)
  }
  return map
}

// Month grid cells (leading blanks + each day), matching a Sun-start week.
export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1)
  const startBlanks = first.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startBlanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, key })
  }
  return cells
}
