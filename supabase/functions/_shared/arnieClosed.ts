// "What did we close in September?"
//
// Closed is a word with three meanings in this database and only one of them
// is the one people mean.
//
//   • An ESTIMATE THE CUSTOMER APPROVED. This is what a person means by
//     closed, closing, close rate, "what did we close". It is the sale.
//   • jobs.status = 'Closed' — 98 of them on the live tenant. That is
//     DELIVERY: the work is wrapped. A job closed in September was very
//     likely sold months earlier.
//   • leads.status = 'Closed' — 61 of them, same idea on the pipeline.
//
// Answering the first question with either of the other two is not a rounding
// error, it is a different number about a different thing. Hence this module:
// Arnie gets the sale, and says so.
//
// The rule is NOT invented here. src/lib/salesFunnel.js already defines it for
// the Sales Performance page — `closeDateOf` and `q.status === 'Approved' ||
// !!job` — and src/lib/arnieClosed.test.js holds the two side by side. If the
// page's definition changes, this one changes with it.

import type { Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'

/**
 * The day a deal closed, for windowing: job creation, else approval, else the
 * estimate's own date. Ported from src/lib/salesFunnel.js closeDateOf.
 *
 * The order matters and the fallbacks are not decoration: on the live tenant
 * only 119 of 357 approved estimates carry an approved_date at all, because
 * nothing ever stamped it — it is a field somebody types on the estimate page.
 * Without the job's creation date as the first choice, two thirds of closed
 * deals could not be placed in a month.
 */
export function closeDateOf(q: any, job: any): string | null {
  return job?.created_at || q?.approved_date || q?.created_at || null
}

/** How we knew when it closed — so the answer can admit when it is a proxy. */
export function dateSourceOf(q: any, job: any): 'job' | 'approval' | 'estimate' | 'none' {
  if (job?.created_at) return 'job'
  if (q?.approved_date) return 'approval'
  if (q?.created_at) return 'estimate'
  return 'none'
}

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100
const usd = (n: number) => '$' + r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null)

export interface ClosedOpts { start?: string | null; end?: string | null; salespersonId?: number | null; limit?: number }

export async function closedDeals(r: Rest, companyId: number, opts: ClosedOpts = {}) {
  const start = day(opts.start), end = day(opts.end)
  // Approved is the sale. A quote with a job but no Approved status counts too
  // — that is how the funnel reads it, and how an estimate converted straight
  // from the page looks.
  const quotes = await readRecordList(r, `quotes?select=id,quote_id,estimate_name,quote_amount,status,approved_date,created_at,job_id,salesperson_id,customer_id,lead_id&company_id=eq.${companyId}&or=(status.eq.Approved,job_id.not.is.null)&limit=5000`)
  if (!quotes.length) return { closed: 0, value: usd(0), deals: [], dated_by: {}, note: 'No approved estimates at all.' }

  const ids = quotes.map((q: any) => q.id)
  const jobs: any[] = []
  for (let i = 0; i < ids.length; i += 200) {
    jobs.push(...await readRecordList(r, `jobs?select=id,job_id,quote_id,created_at,job_total,status&company_id=eq.${companyId}&quote_id=in.(${ids.slice(i, i + 200).join(',')})&limit=5000`))
  }
  const jobFor = new Map(jobs.map((j: any) => [String(j.quote_id), j]))

  const emps = opts.salespersonId ? [] : await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&limit=300`)
  const nameOf = (id: unknown) => emps.find((e: any) => String(e.id) === String(id))?.name || null

  const rows: any[] = []
  const dated: Record<string, number> = {}
  for (const q of quotes) {
    const job = jobFor.get(String(q.id)) || null
    if (opts.salespersonId && String(q.salesperson_id) !== String(opts.salespersonId)) continue
    const when = day(closeDateOf(q, job))
    if (!when) continue
    if (start && when < start) continue
    if (end && when > end) continue
    const src = dateSourceOf(q, job)
    dated[src] = (dated[src] || 0) + 1
    // The funnel's value rule: the job's total once there is one, else the estimate.
    const jobTotal = Number(job?.job_total)
    rows.push({
      quote: q.quote_id, name: q.estimate_name, closed_on: when, dated_by: src,
      value: r2(Number.isFinite(jobTotal) && jobTotal > 0 ? jobTotal : Number(q.quote_amount) || 0),
      job: job?.job_id || null, rep: nameOf(q.salesperson_id),
    })
  }
  rows.sort((a, b) => String(b.closed_on).localeCompare(String(a.closed_on)))
  const value = rows.reduce((s, x) => s + x.value, 0)
  const limit = Math.min(opts.limit || 25, 100)

  const notes: string[] = []
  if (dated.approval || dated.estimate) {
    const proxy = (dated.approval || 0) + (dated.estimate || 0)
    notes.push(`${proxy} of these ${proxy === 1 ? 'is' : 'are'} dated by ${dated.job ? 'a proxy' : 'the estimate or the approval date'} rather than the job that came from it${dated.estimate ? `, and ${dated.estimate} by the day the estimate was written because nothing recorded when it was approved` : ''}.`)
  }
  return {
    means: 'closed = an estimate the customer approved. Not jobs or leads whose status reads "Closed" — that is the work being finished.',
    window: start || end ? `${start || 'the beginning'} to ${end || 'today'}` : 'all time',
    closed: rows.length,
    value: usd(value),
    dated_by: dated,
    deals: rows.slice(0, limit),
    ...(rows.length > limit ? { showing: limit } : {}),
    ...(notes.length ? { note: notes.join(' ') } : {}),
  }
}
