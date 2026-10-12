// When a job is created straight from a lead ("Convert to Job" on the lead
// page), the lead's estimate was left behind: the job had no quote_id and the
// estimate no job_id, so the estimate read as still OPEN in the sales funnel
// and the close never counted. HHH, 2026-10-12: 104 jobs this year sat on a
// lead with a sent estimate and no link; the clear conversions were same-week
// (JOB-MMJB9AGC $9,941 against a $10,482 estimate sent the same day).
//
// The link is made only when it is unambiguous: the lead's most recent staged
// estimate (sent, under negotiation or approved; not a draft, not rejected,
// not already a job) written within MAX_DAYS before the job. A repeat customer
// whose lead carries estimates from 2021 gets no link — that would mark a
// five-year-old bid as closed by a $125 service call.

const STAGED = new Set(['Sent', 'Negotiation', 'Approved'])
export const MAX_DAYS = 120

/** The estimate this job most plausibly is, or null. Pure. */
export function pickEstimateForJob(quotes, jobCreatedAt, { maxDays = MAX_DAYS } = {}) {
  const at = jobCreatedAt ? new Date(jobCreatedAt).getTime() : Date.now()
  if (!Number.isFinite(at)) return null
  const floor = at - maxDays * 86400e3
  const candidates = (quotes || []).filter((q) => {
    if (!q || !STAGED.has(q.status) || q.job_id != null) return false
    const t = new Date(q.created_at).getTime()
    return Number.isFinite(t) && t <= at + 60e3 && t >= floor
  })
  if (!candidates.length) return null
  candidates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return candidates[0]
}

/**
 * Link the lead's estimate to the job it just became, both ways
 * (quotes.job_id and jobs.quote_id). Returns the estimate linked, or null.
 * Never throws: a failed link must not fail the conversion.
 */
export async function linkLeadEstimateToJob(supabase, { quotes, job }) {
  const q = pickEstimateForJob(quotes, job?.created_at)
  if (!q || !job?.id) return null
  try {
    const { error: e1 } = await supabase.from('quotes').update({ job_id: job.id }).eq('id', q.id).is('job_id', null)
    if (e1) return null
    const { error: e2 } = await supabase.from('jobs').update({ quote_id: q.id }).eq('id', job.id).is('quote_id', null)
    if (e2) return null
    return q
  } catch {
    return null
  }
}
