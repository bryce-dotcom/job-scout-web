// What a recurring series is doing right now — the one rule for the Recurring
// Jobs page (src/pages/RecurringJobs.jsx) and Jenny's query_recurring_jobs.
//
// Both used to say "a visit at Invoiced is still open", so an invoiced July
// visit stood in as the series' NEXT visit while a real October one sat
// behind it, and both hid every series whose visits were all finished — which
// is exactly what a series looks like when it has stopped creating its next
// visit (HHH, 2026-10-29: both Costcos, Desert Books and Azalea had quietly
// stopped). The finished list matches spawn_next_recurring_job
// (migration 20261030120000): finishing a visit is what books the next one.

export const FINISHED = ['Completed', 'Job Complete', 'Verified Complete', 'Invoiced', 'Paid', 'Closed', 'Done']
export const CALLED_OFF = ['Cancelled', 'Canceled', 'Archived', 'Void', 'Voided']

export const isFinished = (status: unknown) => FINISHED.includes(String(status))
export const isCalledOff = (status: unknown) => CALLED_OFF.includes(String(status))
export const isOpenVisit = (status: unknown) => !isFinished(status) && !isCalledOff(status)

/** The day a visit is (or was) for: its start, else its service-due date. */
export const visitDay = (j: any): string | null => String(j?.start_date || j?.service_due_date || '').slice(0, 10) || null

const customerKey = (j: any) =>
  j?.customer_id != null ? `id:${j.customer_id}` : (String(j?.business_name || j?.customer_name || '').trim().toLowerCase() || null)

const sameVisit = (a: any, b: any) =>
  a.customer_id != null && a.customer_id === b.customer_id &&
  a.recurrence === b.recurrence &&
  String(a.job_title || '').trim() === String(b.job_title || '').trim()

/**
 * jobs: recurring job rows (recurrence set, not 'None') with id,
 * recurrence_parent_id, status, recurrence, recurrence_end_date, start_date,
 * service_due_date, customer_id, job_title.
 *
 * open    — one per series that has a visit not yet done: the EARLIEST such
 *           visit (an overdue one is the next one, not a later one).
 * stalled — series whose visits are all finished, whose end date has not
 *           passed, and that the customer has not moved on from: no open
 *           look-alike (months entered as separate recurring jobs) and no
 *           later visit in another of their series (an April series replaced
 *           by a September one). Nothing is booked next. The row is the
 *           latest finished visit.
 */
export function seriesOf(jobs: any[] = [], today: string) {
  const chains = new Map<string, any[]>()
  for (const j of jobs || []) {
    if (!j?.recurrence || j.recurrence === 'None') continue
    const key = String(j.recurrence_parent_id || j.id)
    const list = chains.get(key) || []
    list.push(j)
    chains.set(key, list)
  }
  const byDay = (a: any, b: any) => String(visitDay(a) || '9999').localeCompare(String(visitDay(b) || '9999'))
  const open: any[] = []
  const done: any[] = []
  for (const list of chains.values()) {
    const live = list.filter((j) => isOpenVisit(j.status)).sort(byDay)
    if (live.length) { open.push(live[0]); continue }
    const finished = list.filter((j) => isFinished(j.status)).sort(byDay)
    if (!finished.length) continue // every visit called off: the series was stopped on purpose
    const last = finished[finished.length - 1]
    if (last.recurrence_end_date && String(last.recurrence_end_date).slice(0, 10) <= today) continue
    done.push(last)
  }
  const all = (jobs || []).filter((j) => j?.recurrence && j.recurrence !== 'None' && !isCalledOff(j.status))
  const movedOn = (last: any) => {
    const who = customerKey(last)
    if (!who) return false
    const mine = visitDay(last) || ''
    return all.some((j) => j.id !== last.id && customerKey(j) === who && String(visitDay(j) || '') > mine)
  }
  const stalled = done.filter((last) => !open.some((o) => sameVisit(o, last)) && !movedOn(last))
  return { open: open.sort(byDay), stalled: stalled.sort(byDay) }
}
