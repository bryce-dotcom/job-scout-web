// What counts as SOLD — the one rule for the dashboard, Sales Performance, the
// pipeline's Sold tile, EOS, Frankie's query_sales and Jenny's query_sold.
// src/lib/soldTotals.js re-exports it and adds the windowing and per-rep
// breakdowns on top.
//
// Sold = every job created in the window, at its own job_total, cancelled and
// archived excluded — PLUS every estimate the customer approved that has not
// become a job yet (Bryce, 2026-10-30). Before that, Jenny answered "sales"
// from approved estimates (October $291,846.67) and the dashboard from jobs
// ($287,672.51): Jenny missed 37 jobs sold without an estimate ($7,198 —
// window cleanings, recurring visits, service calls) and the dashboard missed
// two estimates Noah Free got approved on 10-06 that nobody turned into jobs
// ($11,372.16). Both now read $299,044.67. Recurring visits count: each is
// billed (Bryce: "count the recurring visits").

export const NOT_SOLD_STATUSES = new Set(['Archived', 'Cancelled', 'Canceled', 'Void', 'Voided'])

/** Is this job a sale at all? A row that exists because someone said yes, and
 *  has not since been cancelled. */
export function isSoldJob(job: any): boolean {
  return !!job?.created_at && !NOT_SOLD_STATUSES.has(job.status)
}

/** What a sold row is worth: its own job_total and nothing else. An unpriced
 *  job is $0 and reported as unpriced, never valued from its estimate (one
 *  HHH estimate reads $1,651,117.14 against a $16,299.20 job). */
export function soldValue(job: any): number {
  const n = Number(job?.job_total)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Was this estimate written in JobScout? Imports carry the old system's
 * number (HouseCall Pro "709", "ST-1270") or a source_system tag, and 151 of
 * HHH's approved estimates with no job are imports whose job was brought in
 * unlinked — counting them would sell that work twice. JobScout numbers an
 * estimate EST-…, or leaves it unnumbered.
 */
export function madeInJobScout(q: any): boolean {
  if (q?.source_system) return false
  const n = String(q?.quote_id ?? '').trim()
  return !n || /^EST-/i.test(n)
}

export const NOT_A_JOB_YET = 'Approved — not a job yet'

/**
 * Approved estimates that have not become a job, as sold rows shaped like a
 * job so every counter, owner rule and drill-down reads them unchanged.
 * Dated by approval, else the day it was written (approval is often never
 * stamped). id is null — there is no job to open; estimate_id is.
 *
 *   quotes  estimate rows: id, quote_id, status, job_id, source_system,
 *           quote_amount, approved_date, created_at, salesperson_id, lead_id
 *   jobs    jobs that point at these estimates (quote_id), ANY status — an
 *           estimate a job points at, with its own job_id never filled in, is
 *           not a sale waiting on a job (2 of HHH's are like that). Pass every
 *           such job, archived included, not a page's windowed list: use
 *           APPROVED_ESTIMATES_PATH + linkedJobsPath, or fetchApprovedNotAJobYet
 *           in src/lib/soldTotals.js.
 */
export function approvedNotAJobYet(quotes: any[] = [], jobs: any[] = []): any[] {
  const linked = new Set((jobs || []).filter((j) => j?.quote_id != null).map((j) => String(j.quote_id)))
  return (quotes || [])
    .filter((q) => q && q.status === 'Approved' && q.job_id == null && !linked.has(String(q.id)) && madeInJobScout(q))
    .map((q) => ({
      id: null,
      estimate_id: q.id,
      quote_id: q.id,
      job_id: q.quote_id || null,
      job_title: q.estimate_name || null,
      status: NOT_A_JOB_YET,
      not_a_job_yet: true,
      created_at: q.approved_date || q.created_at || null,
      job_total: q.quote_amount,
      salesperson_id: q.salesperson_id ?? null,
      lead_id: q.lead_id ?? null,
      customer_id: q.customer_id ?? null,
      customer: q.customer ?? null,
      business_name: q.customer?.business_name ?? null,
      customer_name: q.customer?.name ?? q.lead?.customer_name ?? null,
      customers: q.customer ? { name: q.customer.business_name || q.customer.name } : null,
    }))
}

/** The rows sold is counted over: the jobs, plus approved estimates that are
 *  not a job yet (approvedNotAJobYet's rows). Pass this wherever a sold
 *  figure is computed. A pending row a listed job points at is dropped. */
export function soldRowsOf(jobs: any[] = [], pending: any[] = []): any[] {
  if (!pending?.length) return jobs || []
  const linked = new Set((jobs || []).filter((j) => j?.quote_id != null).map((j) => String(j.quote_id)))
  return [...(jobs || []), ...pending.filter((p) => !linked.has(String(p.estimate_id)))]
}

/** PostgREST paths for the two reads (company filter is the caller's). */
export const APPROVED_ESTIMATES_SELECT = 'id,quote_id,estimate_name,status,job_id,source_system,quote_amount,approved_date,created_at,salesperson_id,lead_id,customer_id,customer:customers!customer_id(name,business_name)'
export const APPROVED_ESTIMATES_PATH = `quotes?status=eq.Approved&job_id=is.null&select=${APPROVED_ESTIMATES_SELECT}`
export const linkedJobsPath = (estimateIds: unknown[]) => `jobs?quote_id=in.(${estimateIds.map(Number).filter(Number.isFinite).join(',')})&select=quote_id`
