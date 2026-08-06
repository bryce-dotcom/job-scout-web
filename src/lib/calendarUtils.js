// Unified calendar event normalizers
// Converts appointments, jobs, and Google Calendar events into a common shape

export const SOURCE_COLORS = {
  appointment: { bg: '#5a9bd5', border: '#4a8bc5', label: 'Appointments' },
  job:         { bg: '#22c55e', border: '#16a34a', label: 'Jobs' },
  google:      { bg: '#8b5cf6', border: '#7c3aed', label: 'Google Calendar' },
  // Follow-ups a rep scheduled from the pipeline. The bg here is only the
  // filter-pill default — each event is coloured by WHEN it is due (red past
  // due, green today, yellow ahead) via followUpSchedule, the same traffic
  // light the pipeline card uses.
  followup:    { bg: '#eab308', border: '#ca8a04', label: 'Follow-ups' }
}

const statusToAppointmentColor = {
  'Scheduled':  '#5a9bd5',
  'Confirmed':  '#4a7c59',
  'Completed':  '#5a6349',
  'Cancelled':  '#c25a5a',
  'No Show':    '#d4940a'
}

const statusToJobColor = {
  'Scheduled':   '#22c55e',
  'In Progress': '#16a34a',
  'Completed':   '#15803d',
  'Cancelled':   '#c25a5a',
  'On Hold':     '#d4940a'
}

export function normalizeAppointment(apt) {
  const isBlock = apt.appointment_type === 'Block'
  const color = isBlock ? '#9ca3af' : (statusToAppointmentColor[apt.status] || SOURCE_COLORS.appointment.bg)
  const cust = apt.customer
  const calTitle = cust?.calendar_display === 'business' && cust.business_name
    ? cust.business_name
    : apt.lead?.customer_name || cust?.name || apt.title || 'Appointment'
  return {
    id: apt.id,
    source: 'appointment',
    title: calTitle,
    start: apt.start_time ? new Date(apt.start_time) : null,
    end: apt.end_time ? new Date(apt.end_time) : null,
    allDay: false,
    color,
    borderColor: SOURCE_COLORS.appointment.border,
    status: apt.status,
    location: apt.location || apt.lead?.address || '',
    meta: apt,
    readOnly: false
  }
}

export function normalizeJob(job) {
  const color = statusToJobColor[job.status] || SOURCE_COLORS.job.bg
  const cust = job.customer
  const calTitle = cust?.calendar_display === 'business' && cust.business_name
    ? cust.business_name
    : job.job_title || cust?.name || job.customer_name || `Job #${job.job_id}`
  return {
    id: `job-${job.id}`,
    source: 'job',
    title: calTitle,
    start: job.start_date ? new Date(job.start_date) : null,
    end: job.end_date ? new Date(job.end_date) : null,
    allDay: true,
    color,
    borderColor: SOURCE_COLORS.job.border,
    status: job.status,
    location: job.customer?.address || '',
    meta: job,
    readOnly: true
  }
}

export function normalizeGoogleEvent(evt) {
  const start = evt.start?.dateTime
    ? new Date(evt.start.dateTime)
    : evt.start?.date ? new Date(evt.start.date + 'T00:00:00') : null
  const end = evt.end?.dateTime
    ? new Date(evt.end.dateTime)
    : evt.end?.date ? new Date(evt.end.date + 'T23:59:59') : null
  const allDay = !evt.start?.dateTime

  return {
    id: `gcal-${evt.id}`,
    source: 'google',
    title: evt.summary || '(No title)',
    start,
    end,
    allDay,
    color: SOURCE_COLORS.google.bg,
    borderColor: SOURCE_COLORS.google.border,
    status: evt.status === 'cancelled' ? 'Cancelled' : 'Confirmed',
    location: evt.location || '',
    meta: evt,
    readOnly: true
  }
}

/**
 * A scheduled follow-up as a calendar event.
 *
 * Bryce: "add a filter to the appointments calendar that when a rep creates a
 * follow up it appears on this calendar" — and the colour follows the same
 * traffic light as the pipeline card (followUpSchedule), so a deal is never
 * green on the board and yellow here.
 *
 * All-day, because a follow-up is a commitment for a DAY, not a timed meeting;
 * pinning it to the minute it was scheduled would bury it in the middle of a
 * work day next to real appointments.
 */
export function normalizeFollowUp(row, schedule) {
  if (!row?.next_follow_up_at) return null
  const start = new Date(row.next_follow_up_at)
  if (!Number.isFinite(start.getTime())) return null
  const who = row.lead?.customer_name || row.job?.job_title || 'Follow-up'
  return {
    id: `followup-${row.id}`,
    source: 'followup',
    title: `Follow up: ${who}`,
    start,
    end: start,
    allDay: true,
    color: schedule?.color || SOURCE_COLORS.followup.bg,
    borderColor: SOURCE_COLORS.followup.border,
    status: schedule?.state || null,
    location: row.lead?.address || '',
    meta: row,
    readOnly: true,   // reschedule it from the deal, not by dragging a dot
  }
}
