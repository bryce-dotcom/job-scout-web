import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

// Frankie's estimates tool reported a "win rate" of approved ÷ (approved +
// rejected). Almost nobody marks an estimate Rejected — it just goes quiet —
// so HHH read 94% while the Sales Performance page said 28%. The tool now
// carries the page's rule: of the estimates sent in the range, the share that
// closed (approved, or became a job). This holds the two side by side.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/frankieTools.ts')
const funnel = read('./salesFunnel.js')

const load = () => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, () => ({}))
  return m.exports
}

const QUOTES = [
  { id: 1, status: 'Approved', quote_amount: 9600, customer_id: 1, job_id: null, created_at: '2026-09-02T00:00:00Z' },
  { id: 2, status: 'Sent', quote_amount: 13000, customer_id: 1, job_id: 52, created_at: '2026-09-05T00:00:00Z' },     // became a job (linked on the quote)
  { id: 3, status: 'Sent', quote_amount: 4000, customer_id: 2, job_id: null, created_at: '2026-09-07T00:00:00Z' },    // became a job (linked on the job only)
  { id: 4, status: 'Sent', quote_amount: 1000, customer_id: 2, job_id: null, created_at: '2026-09-09T00:00:00Z' },    // still out
  { id: 5, status: 'Rejected', quote_amount: 700, customer_id: 2, job_id: null, created_at: '2026-09-10T00:00:00Z' }, // sent, lost
  { id: 6, status: 'Draft', quote_amount: 999, customer_id: 2, job_id: null, created_at: '2026-09-11T00:00:00Z' },    // never sent
]

function stubRest() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url)
    let rows = []
    if (u.includes('/rest/v1/quotes?')) rows = QUOTES
    else if (u.includes('/rest/v1/customers?')) rows = [{ id: 1, name: 'Metro' }, { id: 2, name: 'Cedar' }]
    else if (u.includes('/rest/v1/jobs?')) rows = u.includes('quote_id=in.(3') || u.includes(',3,') || u.includes(',3)') ? [{ quote_id: 3 }] : []
    return { ok: true, json: async () => rows }
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe("Frankie's close rate is the page's cohort rule", () => {
  it('of the estimates sent, the share that closed: 3 of 5 = 60% (the draft is not sent, the rejected one is)', async () => {
    stubRest()
    const { execFrankieTool } = load()
    const out = await execFrankieTool('query_estimates', { status: 'all' }, { role: 'admin', companyId: 25 }, { url: 'http://x', key: 'k' })
    expect(out.error).toBeUndefined()
    expect(out.close_rate).toBe('60%')
    expect(out.close_rate_means).toMatch(/3 of 5 estimates sent/)
    expect(out.win_rate_of_decided).toBeUndefined()
  })
  it('the source no longer divides approved by rejected, and the page still owns the rule', () => {
    expect(src).not.toMatch(/win_rate_of_decided/)
    expect(src).toMatch(/q\.status === 'Approved' \|\| q\.job_id != null \|\| became\.has\(String\(q\.id\)\)/)
    expect(funnel).toMatch(/export function closeRateOf/)
  })
})
