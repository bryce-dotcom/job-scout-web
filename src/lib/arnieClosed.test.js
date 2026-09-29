import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { closeDateOf as clientCloseDateOf } from './salesFunnel.js'

// "Closed" means a sale — an estimate the customer approved. It does NOT mean
// jobs.status = 'Closed' (98 of those on the live tenant) or leads.status =
// 'Closed' (61), which are the WORK being finished, usually months after it
// was sold. Answering the first question with either of the others is not a
// rounding error, it is a different number about a different thing.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/arnieClosed.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const convert = read('../../supabase/functions/_shared/estimateConvert.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const funnel = read('./salesFunnel.js')

const load = (s, deps) => { const m = { exports: {} }; new Function('module', 'exports', 'require', transformSync(s, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, (p) => deps[p]); return m.exports }
const rest = (answers) => ({ readRecordList: async (_r, path) => { for (const [k, v] of Object.entries(answers)) if (path.startsWith(k)) return typeof v === 'function' ? v(path) : v; return [] } })
const mod = (answers = {}) => load(src, { './arnieRest.ts': rest(answers), './arnieConfig.ts': {} })

describe('the server uses the page\'s definition, not a second one', () => {
  const { closeDateOf } = mod()
  it('closeDateOf is salesFunnel.closeDateOf, case for case', () => {
    const cases = [
      [{ approved_date: '2026-08-15', created_at: '2026-07-01' }, { created_at: '2026-08-28' }],
      [{ approved_date: '2026-08-15', created_at: '2026-07-01' }, null],
      [{ approved_date: null, created_at: '2026-07-01' }, null],
      [{ approved_date: null, created_at: null }, null],
      [{}, {}],
      [null, null],
    ]
    for (const [q, j] of cases) expect(closeDateOf(q, j)).toBe(clientCloseDateOf(q, j))
  })
  it('the page still defines it — if this moves, the port moves with it', () => {
    expect(funnel).toMatch(/export function closeDateOf\(q, job\) \{\s*return job\?\.created_at \|\| q\?\.approved_date \|\| q\?\.created_at \|\| null/)
    expect(src).toMatch(/return job\?\.created_at \|\| q\?\.approved_date \|\| q\?\.created_at \|\| null/)
  })
  it('a deal is worth the job it became, else the estimate — the funnel\'s rule', () => {
    expect(funnel).toMatch(/Number\.isFinite\(jobTotal\) && jobTotal > 0 \? jobTotal : Number\(q\.quote_amount\) \|\| 0/)
    expect(src).toMatch(/Number\.isFinite\(jobTotal\) && jobTotal > 0 \? jobTotal : Number\(q\.quote_amount\) \|\| 0/)
  })
})

const QUOTES = [
  { id: 1, quote_id: 'EST-1', estimate_name: 'Shop lighting', quote_amount: 9600, status: 'Approved', approved_date: '2026-08-15T00:00:00Z', created_at: '2026-07-02T00:00:00Z', job_id: null, salesperson_id: 7 },
  { id: 2, quote_id: 'EST-2', estimate_name: 'Bays', quote_amount: 13000, status: 'Approved', approved_date: null, created_at: '2026-06-01T00:00:00Z', job_id: 52, salesperson_id: 7 },
  { id: 3, quote_id: 'EST-3', estimate_name: 'Old one', quote_amount: 4000, status: 'Approved', approved_date: null, created_at: '2026-05-04T00:00:00Z', job_id: null, salesperson_id: 8 },
  { id: 4, quote_id: 'EST-4', estimate_name: 'Sept deal', quote_amount: 1000, status: 'Approved', approved_date: '2026-09-09T00:00:00Z', created_at: '2026-09-01T00:00:00Z', job_id: null, salesperson_id: 8 },
]
const JOBS = [{ id: 52, job_id: 'JOB-52', quote_id: 2, created_at: '2026-08-28T00:00:00Z', job_total: 13200, status: 'Closed' }]
const answers = {
  'quotes?select=id,quote_id,estimate_name,quote_amount,status,approved_date': QUOTES,
  'jobs?select=id,job_id,quote_id,created_at,job_total,status': JOBS,
  'employees?select=id,name': [{ id: 7, name: 'Jordan Lee' }, { id: 8, name: 'Mike Sullivan' }],
}

describe('what closed, and when', () => {
  it('a window catches the deal by the day it CLOSED, not the day the estimate was written', async () => {
    const { closedDeals } = mod(answers)
    const aug = await closedDeals({}, 25, { start: '2026-08-01', end: '2026-08-31' })
    expect(aug.closed).toBe(2)
    // EST-2 closed in August by its JOB (created 8/28) though it was written in June.
    expect(aug.deals.map((d) => d.quote).sort()).toEqual(['EST-1', 'EST-2'])
    // And it is worth the job's total, not the estimate's.
    expect(aug.deals.find((d) => d.quote === 'EST-2')).toMatchObject({ value: 13200, dated_by: 'job', job: 'JOB-52' })
    expect(aug.deals.find((d) => d.quote === 'EST-1')).toMatchObject({ value: 9600, dated_by: 'approval', rep: 'Jordan Lee' })
    expect(aug.value).toBe('$22,800.00')
  })
  it('says how many are dated by a proxy, because most of the book has no approval date', async () => {
    const { closedDeals } = mod(answers)
    const all = await closedDeals({}, 25, {})
    expect(all.closed).toBe(4)
    expect(all.dated_by).toEqual({ approval: 2, job: 1, estimate: 1 })
    expect(all.note).toMatch(/dated by/)
    expect(all.note).toMatch(/nothing recorded when it was approved/)
    expect(all.means).toMatch(/an estimate the customer approved/)
  })
  it('one rep only, when they asked about one person', async () => {
    const { closedDeals } = mod(answers)
    const mine = await closedDeals({}, 25, { salespersonId: 8 })
    expect(mine.deals.map((d) => d.quote).sort()).toEqual(['EST-3', 'EST-4'])
  })
  it('an empty month is empty, not the whole book', async () => {
    const { closedDeals } = mod(answers)
    expect((await closedDeals({}, 25, { start: '2026-10-01', end: '2026-10-31' })).closed).toBe(0)
  })
})

describe('Arnie is told which "closed" is which', () => {
  it('the tool says not to answer it from job status', () => {
    expect(chat).toMatch(/name: 'query_closed'/)
    expect(chat).toMatch(/Do NOT use query_jobs with status Closed for this/)
    expect(chat).toMatch(/query_closed/)
  })
  it('query_quotes admits its dates are when the estimate was WRITTEN', () => {
    expect(chat).toMatch(/the dates here are when the estimate was WRITTEN/)
  })
  it('the prompt gives the word one meaning and names the two impostors', () => {
    expect(engine).toMatch(/## "Closed" means a sale, not finished work/)
    expect(engine).toMatch(/job status literally called "Closed"/)
    expect(engine).toMatch(/do not present a proxy figure as exact/)
  })
  it('approving an estimate now records WHEN, so the next month can be counted', () => {
    // 238 of the live tenant's 357 approved estimates have no approved_date:
    // it was only ever a field somebody typed. Every approve path comes
    // through approveEstimate, and it must not overwrite a recorded date.
    expect(convert).toMatch(/if \(!quote\.approved_date\) patch\.approved_date = nowIso\(\)/)
    expect(convert).toMatch(/quotes\?select=id,quote_id,status,lead_id,customer_id,estimate_name,quote_amount,approved_date/)
  })
})
