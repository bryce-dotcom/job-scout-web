// "How much have we sold?" on the server — Jenny's query_sold and Frankie's
// query_sales. Same rule as the dashboard and Sales Performance
// (_shared/soldRule.ts): jobs created in the window, cancelled/archived out,
// plus estimates the customer approved that are not a job yet; one rep per
// deal by _shared/jobOwnership.ts. Days are the company's local days, so a
// job sold at 8pm on the 31st lands in the month the dashboard puts it in.

import type { Rest } from './arnieConfig.ts'
import { readRecordList, readAllRecords } from './arnieRest.ts'
import { dayStartUtc } from './repGoals.ts'
import { isSoldJob, soldValue, soldRowsOf, approvedNotAJobYet, madeInJobScout, APPROVED_ESTIMATES_PATH, linkedJobsPath } from './soldRule.ts'
import { buildLeadIndex, primaryOwnerId } from './jobOwnership.ts'

const r2 = (n: number) => Math.round(n * 100) / 100
const isDay = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ''))
const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)

export async function companyTimezone(r: Rest, companyId: number): Promise<string> {
  const rows = await readRecordList(r, `companies?select=timezone&id=eq.${companyId}&limit=1`).catch(() => [])
  return String(rows?.[0]?.timezone || 'America/Denver')
}

export interface SoldOpts { start?: string | null; end?: string | null; salespersonId?: number | string | null; byMonth?: boolean; limit?: number; tz?: string }

/** start/end are local days (YYYY-MM-DD), both inclusive. */
export async function soldReport(r: Rest, companyId: number, opts: SoldOpts = {}) {
  const co = `company_id=eq.${companyId}`
  const tz = opts.tz || await companyTimezone(r, companyId)
  const start = isDay(opts.start) ? String(opts.start) : null
  const end = isDay(opts.end) ? String(opts.end) : null
  const fromMs = start ? dayStartUtc(start, tz).getTime() : null
  const untilMs = end ? dayStartUtc(nextDay(end), tz).getTime() : null

  let jobPath = `jobs?${co}&select=id,job_id,job_title,status,job_total,created_at,salesperson_id,lead_id,quote_id,customer_id,business_name,customer_name&order=created_at.desc`
  if (fromMs != null) jobPath += `&created_at=gte.${new Date(fromMs).toISOString()}`
  if (untilMs != null) jobPath += `&created_at=lt.${new Date(untilMs).toISOString()}`
  const [jobs, approved, emps] = await Promise.all([
    readAllRecords(r, jobPath, 20000),
    readRecordList(r, `${APPROVED_ESTIMATES_PATH}&${co}&limit=1000`),
    readRecordList(r, `employees?${co}&select=id,name&limit=500`),
  ])
  const mine = approved.filter(madeInJobScout)
  // Every job pointing at one of these, any status, any date — never a deal twice.
  const linked = mine.length ? await readRecordList(r, `${linkedJobsPath(mine.map((q: any) => q.id))}&${co}&limit=1000`) : []
  const pending = approvedNotAJobYet(mine, linked).filter((p: any) => {
    const t = Date.parse(p.created_at)
    return Number.isFinite(t) && (fromMs == null || t >= fromMs) && (untilMs == null || t < untilMs)
  })

  // Only the leads these deals hang off — the owner fallback (jobs.lead_id is TEXT).
  const leadIds = [...new Set([...jobs, ...pending].map((j: any) => Number(j.lead_id)).filter(Number.isFinite))]
  const leads: any[] = []
  for (let i = 0; i < leadIds.length; i += 200) leads.push(...await readRecordList(r, `leads?${co}&select=id,salesperson_id,salesperson_ids&id=in.(${leadIds.slice(i, i + 200).join(',')})`))
  const idx = buildLeadIndex(leads)
  const nameOf = new Map(emps.map((e: any) => [String(e.id), e.name]))
  let rows = soldRowsOf(jobs.filter(isSoldJob), pending)
  const ownerOf = (j: any) => primaryOwnerId(j, idx)
  if (opts.salespersonId != null && opts.salespersonId !== '') rows = rows.filter((j: any) => String(ownerOf(j)) === String(opts.salespersonId))

  const total = rows.reduce((s: number, j: any) => s + soldValue(j), 0)
  const byRep = new Map<string, { rep: string; sold: number; deals: number }>()
  for (const j of rows) {
    const o = ownerOf(j)
    const k = o ?? 'nobody'
    const cur = byRep.get(k) || { rep: o ? (nameOf.get(o) || `#${o}`) : 'Nobody on the deal', sold: 0, deals: 0 }
    cur.sold += soldValue(j); cur.deals += 1
    byRep.set(k, cur)
  }
  const local = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
  const line = (j: any) => ({
    job: j.job_id || (j.id ? `#${j.id}` : null), title: j.job_title, customer: j.business_name || j.customer_name || null,
    sold: r2(soldValue(j)), sold_on: j.created_at ? local(j.created_at) : null, status: j.status, rep: ownerOf(j) ? nameOf.get(String(ownerOf(j))) || null : null,
  })
  const notAJob = rows.filter((j: any) => j.not_a_job_yet)
  const unpriced = rows.filter((j: any) => soldValue(j) === 0).length
  const out: any = {
    window: start || end ? `${start || 'the beginning'} to ${end || 'today'}` : 'all time',
    sold: r2(total),
    deals: rows.length,
    jobs: rows.length - notAJob.length,
    by_rep: [...byRep.values()].map((x) => ({ ...x, sold: r2(x.sold) })).sort((a, b) => (a.rep === 'Nobody on the deal' ? 1 : 0) - (b.rep === 'Nobody on the deal' ? 1 : 0) || b.sold - a.sold),
    approved_not_a_job_yet: notAJob.length
      ? { count: notAJob.length, sold: r2(notAJob.reduce((s: number, j: any) => s + soldValue(j), 0)), list: notAJob.map(line), means: 'Approved by the customer but nobody has made the job yet — counted as sold; the work may not be scheduled.' }
      : 'none',
    unpriced_jobs: unpriced,
    largest: [...rows].sort((a: any, b: any) => soldValue(b) - soldValue(a)).slice(0, Math.min(Math.max(Number(opts.limit) || 15, 1), 100)).map(line),
    scope: `Sold = every job created in the window at its own job_total (cancelled/archived excluded, ${unpriced} unpriced counted at $0; recurring visits count — each is billed), plus estimates the customer approved that are not a job yet. One rep per deal (the job's rep, else its lead's), so by_rep adds up to the total. Same figure as the Dashboard's Sales Won and the Sales Performance page. Booked work, not cash.`,
  }
  if (opts.byMonth) {
    const bm: Record<string, { sold: number; deals: number }> = {}
    for (const j of rows) { const k = local(j.created_at).slice(0, 7); bm[k] = bm[k] || { sold: 0, deals: 0 }; bm[k].sold = r2(bm[k].sold + soldValue(j)); bm[k].deals++ }
    out.by_month = Object.fromEntries(Object.entries(bm).sort(([a], [b]) => a.localeCompare(b)))
  }
  return out
}
