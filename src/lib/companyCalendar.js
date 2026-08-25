import { localDateStr } from './localDate'
import { futureOccurrences, REPEATS } from './recurrenceDates'
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
  // Not on the books — a repeat that is due but has no job row yet, because
  // the next occurrence is only created when the current one is completed.
  projected: {
    id: 'projected',
    label: 'Expected',
    color: '#a855f7',
    writes: { source: 'Jobs', bookedIn: 'the Repeat panel', appearsWhen: 'a repeating job is due again — no job exists yet' },
  },
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
  // A visit that is OWED but not yet booked. It is on the books in exactly the
  // sense this calendar promises — the customer is expecting it — and it was
  // the one thing missing that people were already tracking elsewhere.
  service: {
    id: 'service',
    label: 'Service Due',
    color: '#d97706',
    writes: { source: 'Service Visits', bookedIn: 'Work / Operations', appearsWhen: 'a visit is due and not yet scheduled' },
  },
  // The last two islands. Routes and fleet each had their own calendar screen
  // reading their own tables with their own date rules, so a crew's route and a
  // truck being off the road for maintenance were invisible next to the work
  // they affect. Those screens are untouched — this only means the company
  // calendar can finally see them too.
  route: {
    id: 'route',
    label: 'Routes',
    color: '#0891b2',
    writes: { source: 'Routes', bookedIn: 'Routes', appearsWhen: 'a route is built for a day' },
  },
  fleet: {
    id: 'fleet',
    label: 'Fleet',
    color: '#64748b',
    writes: { source: 'Fleet', bookedIn: 'Fleet', appearsWhen: 'maintenance is due or an asset is out on rental' },
  },
}

// A visit that has been scheduled already appears as Delivery on the day it
// will actually happen, so showing the due date as well would put the same
// visit on the calendar twice on two different days. Once it is booked, the
// booked date is the one that matters.
const SERVICE_DONE = ['Completed', 'Verified Complete', 'Paid', 'Closed', 'Archived']

// One sentence naming every writer, for the calendar page to print. Derived
// from KINDS so it cannot drift from what actually gets built.
export function calendarSourcesSentence() {
  // Sources, de-duplicated and without the per-kind rule.
  //
  // Two things changed the shape of this: jobs feed THREE kinds (scheduled
  // delivery, a service visit that is due, and a projected repeat), so naming
  // the source per kind printed "jobs … jobs … jobs"; and at seven kinds the
  // full "(what has to be true)" for each ran to a paragraph nobody would read.
  // The per-kind rule moved to the filter chips, where it is one hover away
  // from the thing it describes.
  const seen = new Set()
  const parts = []
  for (const k of Object.values(KINDS)) {
    const s = k.writes.source.toLowerCase()
    if (seen.has(s)) continue
    seen.add(s)
    parts.push(s)
  }
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
export function buildCalendarEvents({ appointments = [], jobs = [], timeOff = [], employees = [], routes = [], fleet = [], fleetRentals = [] } = {}, { tz = DEFAULT_TZ, projectRecurringThrough = null } = {}) {
  const empName = new Map((employees || []).map((e) => [String(e.id), e.name]))
  const events = []

  for (const a of appointments || []) {
    if (!a || !a.start_time) continue
    if (a.appointment_type === 'Block') continue // blocked time isn't a company event
    // A 'Job' appointment is a mirror of a scheduled job, written by the job
    // dialog until this was removed. The job renders as its own delivery event,
    // so drawing this too is the second box — and because the mirror was never
    // kept in step with the job, it is usually the WRONG box: stale date, or a
    // job that no longer exists. Skipping them here retires the 233 already in
    // the table without deleting anyone's data.
    if (a.appointment_type === 'Job') continue
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

    // Bryce: "When a reacurring job is put on the schedule I can't see it the
    // next month. At least show tentative appointment for the next month or
    // recurring."
    //
    // The next occurrence genuinely does not exist yet — the DB trigger creates
    // it when the current one is Completed, on purpose, because an earlier
    // engine spawned eagerly and made two of everything. So this DRAWS the
    // future without creating it: no row, no id, nothing to dispatch or bill.
    // Only the occurrences after the live one, so the real job is not doubled.
    if (projectRecurringThrough && REPEATS(j.recurrence)) {
      const ghosts = futureOccurrences(j.start_date, j.recurrence, {
        through: projectRecurringThrough,
        endDate: j.recurrence_end_date || null,
      })
      for (const g of ghosts) {
        events.push({
          id: `job-${j.id}-projected-${zonedDayKey(g, tz)}`,
          kind: 'projected',
          dayKeys: [zonedDayKey(g, tz)],
          title: j.job_title || j.job_id || 'Job',
          subtitle: j.recurrence,
          businessUnit: j.business_unit || null,
          status: 'Expected',
          link: `/jobs/${j.id}`,
          time: g.toISOString(),
          projected: true,
        })
      }
    }
  }

  // Service visits come from the SAME jobs rows, keyed on service_due_date
  // rather than start_date — a visit that is owed rather than booked.
  //
  // service_due_date is a plain DATE column, so it is used as-is. Running a
  // bare date through a timezone conversion is what makes days drift, which is
  // the same reason time off is handled this way.
  for (const j of jobs || []) {
    if (!j || !j.service_due_date) continue
    if (j.start_date) continue                      // booked — Delivery already shows it
    if (SERVICE_DONE.includes(j.status)) continue   // already done
    events.push({
      id: `svc-${j.id}`,
      kind: 'service',
      dayKeys: [dayKeyOfDate(j.service_due_date)],
      title: j.job_title || j.job_id || 'Service visit',
      subtitle: [labelForServiceKind(j.service_kind), j.customer?.name || j.customer_name].filter(Boolean).join(' · '),
      businessUnit: j.business_unit || null,
      status: j.status || null,
      link: `/jobs/${j.id}`,
      time: null,
    })
  }

  // Routes. routes.date is a timestamp at midnight UTC that MEANS a date —
  // RoutesCalendar matches it with `r.date.startsWith(dateStr)`, a plain string
  // prefix. Putting it through a zone conversion instead would slide a route
  // onto the previous day for anyone west of UTC, so the date part is taken
  // as-is to match the screen that owns this data.
  for (const r of routes || []) {
    if (!r || !r.date) continue
    const jobCount = (() => {
      try { return Array.isArray(r.job_ids) ? r.job_ids.length : JSON.parse(r.job_ids || '[]').length }
      catch { return 0 }
    })()
    events.push({
      id: `route-${r.id}`,
      kind: 'route',
      dayKeys: [dayKeyOfDate(r.date)],
      title: r.team || r.route_id || 'Route',
      subtitle: jobCount ? `${jobCount} ${jobCount === 1 ? 'stop' : 'stops'}` : '',
      businessUnit: r.business_unit || null,
      status: null,
      link: '/routes',
      time: null,
    })
  }

  // Fleet maintenance. next_pm_due is a plain DATE column — used as-is for the
  // same reason time off is.
  for (const a of fleet || []) {
    if (!a || !a.next_pm_due) continue
    events.push({
      id: `pm-${a.id}`,
      kind: 'fleet',
      dayKeys: [dayKeyOfDate(a.next_pm_due)],
      title: a.name || 'Asset',
      subtitle: 'Maintenance due',
      businessUnit: a.business_unit || null,
      status: a.status || null,
      link: '/fleet',
      time: null,
    })
  }

  // Rentals span days, like time off — an asset is off the yard for the whole
  // period, not just the day it left.
  for (const r of fleetRentals || []) {
    if (!r || !r.start_date) continue
    const days = expandDateRange(dayKeyOfDate(r.start_date), dayKeyOfDate(r.end_date))
    if (!days.length) continue
    events.push({
      id: `rental-${r.id}`,
      kind: 'fleet',
      dayKeys: days,
      title: r.rental_customer || r.rental_id || 'Rental',
      subtitle: days.length > 1 ? `On rental · ${days.length} days` : 'On rental',
      businessUnit: null,
      status: r.status || null,
      link: '/fleet',
      time: null,
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

// warranty / callback / repair / annual — shown beside the customer so a glance
// tells you whether this is work you owe them or work they will pay for.
export function labelForServiceKind(kind) {
  const k = String(kind || '').toLowerCase()
  if (!k) return 'Service'
  if (k === 'pm') return 'Maintenance'
  return k.charAt(0).toUpperCase() + k.slice(1)
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
