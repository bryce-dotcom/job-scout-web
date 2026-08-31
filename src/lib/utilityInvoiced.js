// Which jobs have been invoiced to the UTILITY — the rebate/incentive claim
// sent to RMP, SRP, etc. — as opposed to invoiced to the customer.
//
// Alayda asked to track both "Utility Invoiced" and "Invoiced after completed".
// The second is a job status; this one deliberately is NOT, and the live data
// settles why: the 25 jobs with a utility invoice sit across SIX different job
// statuses (Archived, Paid, Verified Complete, Completed, Invoiced, Closed),
// and every one of them also has a customer invoice. A job is somewhere in the
// pipeline AND separately has a utility claim out. Forcing that into the same
// single-value column would mean one of the two facts overwrites the other —
// which is exactly how a status gets "lost" and someone spends ten minutes
// hunting a job they just finished.
//
// So it is derived, live, from utility_invoices.job_id. Nothing to keep in
// sync, nothing to backfill, and it cannot drift out of agreement with the
// utility invoices themselves.

// utility_invoices.job_id and jobs.id are both integers today and match 25/25,
// but ids are compared as strings here so this can never become the
// jobs.lead_id (text) vs leads.id (int) mismatch that made rep totals read low.
const key = (v) => (v === null || v === undefined ? null : String(v))

/**
 * Job ids (as strings) that have at least one utility invoice.
 * Returns an empty Set on error — a failed lookup hides the badge, it never
 * blocks the job list from rendering.
 */
export async function fetchUtilityInvoicedJobIds(supabase, companyId) {
  if (!supabase || !companyId) return new Set()
  const { data, error } = await supabase
    .from('utility_invoices')
    .select('job_id')
    .eq('company_id', companyId)
    .not('job_id', 'is', null)
  if (error) {
    console.warn('[utilityInvoiced] lookup failed:', error.message)
    return new Set()
  }
  return new Set((data || []).map((r) => key(r.job_id)).filter(Boolean))
}

/** Does this job have a utility invoice? */
export function isUtilityInvoiced(jobIdSet, job) {
  if (!jobIdSet || !job) return false
  return jobIdSet.has(key(job.id))
}
