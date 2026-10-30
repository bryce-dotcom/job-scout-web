// Sold is one number (Bryce, 2026-10-30: "she gave me a total of 291… the
// dashboard says 287" — "count the recurring visits"). Jenny counted approved
// estimates and missed 37 jobs sold without one; the dashboard counted jobs
// and missed two approved estimates nobody had made into jobs. Now both read
// jobs + approved-not-a-job-yet, $299,044.67 for HHH's October.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { madeInJobScout, approvedNotAJobYet, soldRowsOf, NOT_A_JOB_YET } from '../../supabase/functions/_shared/soldRule.ts'
import { soldByRep, soldJobsInRange, soldValue, fetchApprovedNotAJobYet } from './soldTotals.js'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const est = (id, over = {}) => ({ id, quote_id: `EST-${id}`, status: 'Approved', job_id: null, quote_amount: 1000, created_at: '2026-10-06T15:00:00Z', salesperson_id: 34, ...over })

describe('an approved estimate with no job is sold', () => {
  it('JobScout estimates count; imports never do (their jobs came in unlinked)', () => {
    expect(madeInJobScout({ quote_id: 'EST-MUWSHYJ3' })).toBe(true)
    expect(madeInJobScout({ quote_id: null })).toBe(true)
    for (const q of [{ quote_id: '709' }, { quote_id: 'ST-1270' }, { quote_id: 'EST-1', source_system: 'hcp' }]) expect(madeInJobScout(q)).toBe(false)
  })
  it('not when a job points at it, or it already has one, or it is not approved', () => {
    const rows = approvedNotAJobYet([est(1), est(2, { job_id: 9 }), est(3), est(4, { status: 'Sent' })], [{ quote_id: 3 }])
    expect(rows.map((r) => r.estimate_id)).toEqual([1])
    expect(rows[0]).toMatchObject({ id: null, status: NOT_A_JOB_YET, not_a_job_yet: true, job_total: 1000, salesperson_id: 34, created_at: '2026-10-06T15:00:00Z' })
  })
  it('dated by approval when it was stamped', () => {
    expect(approvedNotAJobYet([est(1, { approved_date: '2026-10-09T00:00:00Z' })])[0].created_at).toBe('2026-10-09T00:00:00Z')
  })
  it('soldRowsOf drops a pending row a listed job points at', () => {
    const pending = approvedNotAJobYet([est(1), est(2)])
    expect(soldRowsOf([{ id: 5, quote_id: 2, created_at: '2026-10-07T00:00:00Z', job_total: 1000, status: 'Scheduled' }], pending).map((r) => r.id ?? `e${r.estimate_id}`)).toEqual([5, 'e1'])
  })
})

describe('HHH October, both ways at once', () => {
  // The shape of the real month: shared estimate jobs, no-estimate jobs
  // (window cleaning, a recurring visit, a $0 service call) and Noah Free's
  // two approved estimates nobody made into jobs.
  const jobs = [
    { id: 1, quote_id: 70, created_at: '2026-10-03T16:00:00Z', job_total: 280474.51, status: 'Scheduled', salesperson_id: 7 },
    { id: 2, quote_id: null, created_at: '2026-10-06T16:00:00Z', job_total: 6948, status: 'Paid', salesperson_id: 8 },
    { id: 3, quote_id: null, created_at: '2026-10-26T16:00:00Z', job_total: 250, status: 'Scheduled', salesperson_id: 8 },
    { id: 4, quote_id: null, created_at: '2026-10-20T16:00:00Z', job_total: 0, status: 'Closed', salesperson_id: 8 },
    { id: 5, quote_id: null, created_at: '2026-10-21T16:00:00Z', job_total: 999, status: 'Cancelled', salesperson_id: 8 },
  ]
  const pending = approvedNotAJobYet([est(5222, { quote_amount: 7974.76 }), est(5223, { quote_amount: 3397.4 })], [])
  it('reads $299,044.67, and the rep rows add up to it', () => {
    const rows = soldRowsOf(jobs, pending)
    const oct = soldJobsInRange(rows, { start: '2026-10-01T06:00:00Z', end: '2026-11-01T06:00:00Z' })
    expect(Math.round(oct.reduce((s, j) => s + soldValue(j), 0) * 100) / 100).toBe(299044.67)
    const byRep = soldByRep(rows, [], { start: '2026-10-01T06:00:00Z', end: '2026-11-01T06:00:00Z', employees: [{ id: 34, name: 'Noah Free' }] })
    expect(byRep.total).toBe(299044.67)
    expect(byRep.rows.find((r) => r.name === 'Noah Free')).toMatchObject({ count: 2, total: 11372.16 })
  })
})

describe('the loader checks every job, not the page\'s window', () => {
  afterEach(() => vi.restoreAllMocks())
  it('reads approved estimates, keeps JobScout ones, and asks the jobs table who points at them', async () => {
    const calls = []
    const chain = (table, data) => {
      const q = { select: () => q, eq: (...a) => (calls.push([table, 'eq', ...a]), q), is: () => q, limit: () => Promise.resolve({ data }), in: (...a) => (calls.push([table, 'in', ...a]), Promise.resolve({ data: table === 'jobs' ? [{ quote_id: 2 }] : [] })) }
      return q
    }
    const supabase = { from: (t) => chain(t, t === 'quotes' ? [est(1), est(2), est(3, { quote_id: '709' })] : []) }
    const rows = await fetchApprovedNotAJobYet(supabase, 3)
    expect(rows.map((r) => r.estimate_id)).toEqual([1])
    expect(calls).toContainEqual(['jobs', 'in', 'quote_id', [1, 2]])
  })
})

describe('every sold figure runs on it', () => {
  it('the dashboard, Sales Performance, the pipeline Sold tile, EOS and Frankie\'s page add the approved estimates', () => {
    expect(read('src/pages/Dashboard.jsx')).toMatch(/const soldRows = soldRowsOf\(jobs, approvedNotAJobYet\)/)
    expect(read('src/pages/SalesPerformance.jsx')).toMatch(/setJobs\(soldRowsOf\(jobRows, pending\)\)/)
    expect(read('src/pages/SalesPipeline.jsx')).toMatch(/soldTotal\(soldRowsOf\(jobRows \|\| \[\], pending\)/)
    expect(read('src/pages/admin/EOS.jsx')).toMatch(/soldRowsOf\(d\.jobs, d\.approvedNotAJobYet\)/)
    expect(read('src/pages/agents/frankie/frankieContext.js')).toMatch(/salesSection\(\{ jobs: soldRowsOf\(jobs, approvedNotAJobYet\(data\.quotes/)
  })
  it('Jenny and Frankie share one server report; Frankie keeps no copy of the rule', () => {
    const chat = read('supabase/functions/arnie-chat/index.ts')
    const frankie = read('supabase/functions/_shared/frankieTools.ts')
    expect(chat).toMatch(/name: 'query_sold'/)
    expect(chat).toMatch(/if \(name === 'query_sold'\) \{\s+if \(!isAdmin\) return \{ restricted:[\s\S]{0,200}return await soldReport\(/)
    expect(frankie).toMatch(/return await soldReport\(r, companyId,/)
    expect(frankie).not.toMatch(/new Set\(\['Archived', 'Cancelled'/)
    expect(read('supabase/functions/_shared/arniePrompt.ts')).toMatch(/## How much was SOLD is one number\n- \*\*Sold, sales, booked, "where are we at sales-wise"[\s\S]{0,80}→ query_sold/)
  })
})
