// The lead's status once its deal has become a job.
//
// The pipeline's delivery columns ARE the company's job statuses, by name
// (SalesPipeline builds them from settings.job_statuses). So a converted
// lead simply mirrors its job's status and lands in that column. The four
// places that convert or move a job used to write the app's ORIGINAL default
// stage names ('Job Scheduled', 'Job Complete') instead, which match no
// column for a company with its own job statuses: HHH had 62 leads the
// pipeline never fetched, 6 of them invisible everywhere (2026-09-17).
//
// A company that has not configured job statuses still gets the defaults,
// which is exactly what the old literals were.

const DEFAULT_DELIVERY = { 'Chillin': 'Job Scheduled', 'Scheduled': 'Job Scheduled', 'On Hold': 'Job Scheduled', 'In Progress': 'In Progress', 'Completed': 'Job Complete' }

// Lead statuses that mean the deal is decided or has become a job, whatever
// the company calls its stages: the pipeline's Won / Closed / Lost columns,
// the legacy literals, the default delivery columns, and every one of the
// company's own job statuses (id AND name — the board shows the name, the
// lead carries the id). Everything else is still in the sales funnel.
const DECIDED = ['Won', 'Lost', 'Closed', 'Converted', 'Not Qualified', 'Invoiced', 'Paid', ...Object.keys(DEFAULT_DELIVERY), ...Object.values(DEFAULT_DELIVERY)]

/** Is this lead still in the sales funnel (not won, lost, closed or turned into a job)? */
export function isOpenLead(lead, jobStatuses = []) {
  const status = lead?.status
  if (status == null || status === '') return true
  if (DECIDED.includes(status)) return false
  for (const s of jobStatuses || []) {
    if (typeof s === 'string') { if (s === status) return false; continue }
    if (s?.id === status || s?.name === status) return false
  }
  return true
}

export function leadStatusForJob(jobStatus, jobStatuses = []) {
  const js = jobStatus || 'Chillin'
  // `id` FIRST. jobs.status holds the status id; `name` is only the board
  // label, and the two differ the moment a company renames a stage. HHH's
  // last stage is { id: 'Paid', name: 'Payments' }, so reading `name` here
  // meant a PAID job's lead did not match 'Paid', fell through to the
  // nearest-by-meaning branch and landed back in 'Scheduled' — the deal
  // walking backwards down the board after the customer had paid.
  // The test fixture hid it by building every row as { id: n, name: n }.
  const ids = (jobStatuses || []).map(s => typeof s === 'string' ? s : (s?.id || s?.name)).filter(Boolean)
  if (ids.length === 0) return DEFAULT_DELIVERY[js] || 'Job Scheduled'
  if (ids.includes(js)) return js
  // The job's status is not one of the company's (a legacy name): the nearest
  // configured status by meaning, else the first open one.
  if (/complete|done|finish/i.test(js)) return ids.find(x => /complete|done|finish/i.test(x)) || ids[0]
  return ids.find(x => /^scheduled$/i.test(x)) || ids.find(x => /chillin|new|open/i.test(x)) || ids[0]
}
