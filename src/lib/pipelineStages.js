// The Sales Pipeline's delivery columns ARE the company's job statuses
// (settings.job_statuses). This is the one place that turns those statuses
// into board columns.
//
// A job status is { id, name, color, category }. jobs.status holds the ID,
// and a converted lead's status mirrors it (lib/leadDeliveryStatus). The name
// is only the board label, and the two differ the moment a company renames a
// stage: HHH's last stage is { id: 'Paid', name: 'Payments' }. The board used
// to build its column ids from the NAME, so a lead that reached Paid matched
// no column and vanished from the board (12 HHH leads, 2026-10-11), and the
// jobs query asked for status = 'Payments', which no job has ever carried.
//
// It also appended an 'Invoiced' column and a 'Closed' column without
// checking whether the company's own statuses already had them, so HHH's
// board carried two Invoiced columns and two Closed columns.

const FALLBACK_COLOR = '#94a3b8'

/** The status id a job carries, from a string or a { id, name } row. */
export const jobStatusId = (s) => (typeof s === 'string' ? s : s?.id || s?.name || null)

/** The board label for a status. */
export const jobStatusName = (s) => (typeof s === 'string' ? s : s?.name || s?.id || null)

/**
 * Delivery columns for the board, one per job status, keyed by the status ID.
 * `reserved` are column ids the board already has (Closed, Lost) and must not
 * be duplicated; an 'Invoiced' column is appended only when the company has
 * no status with that id.
 */
export function deliveryStagesFrom(jobStatuses = [], { reserved = [] } = {}) {
  const seen = new Set(reserved)
  const stages = []
  for (const s of jobStatuses || []) {
    const id = jobStatusId(s)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const color = (typeof s === 'object' && s?.color) || FALLBACK_COLOR
    const stage = { id, name: jobStatusName(s), color, isDelivery: true }
    if (typeof s === 'object' && s?.category) stage.category = s.category
    stages.push(stage)
  }
  if (!seen.has('Invoiced')) stages.push({ id: 'Invoiced', name: 'Invoiced', color: '#8b5cf6', isDelivery: true })
  return stages
}
