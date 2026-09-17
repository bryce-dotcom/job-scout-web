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

export function leadStatusForJob(jobStatus, jobStatuses = []) {
  const js = jobStatus || 'Chillin'
  const ids = (jobStatuses || []).map(s => typeof s === 'string' ? s : (s?.name || s?.id)).filter(Boolean)
  if (ids.length === 0) return DEFAULT_DELIVERY[js] || 'Job Scheduled'
  if (ids.includes(js)) return js
  // The job's status is not one of the company's (a legacy name): the nearest
  // configured status by meaning, else the first open one.
  if (/complete|done|finish/i.test(js)) return ids.find(x => /complete|done|finish/i.test(x)) || ids[0]
  return ids.find(x => /^scheduled$/i.test(x)) || ids.find(x => /chillin|new|open/i.test(x)) || ids[0]
}
