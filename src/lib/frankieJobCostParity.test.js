// Frankie's job costing has to agree with the Job Costing report.
//
// frankieTools.jobProfitability calls itself "Port of src/lib/reports.js
// jobCosting" and had drifted on four rules: it summed parts receipts with
// the catalog parts they describe, counted a receipt AND the bank row it was
// matched to, omitted crew bonuses, and never fetched the clock. Measured on
// HHH 2026-10-22: the two disagreed on 274 of 464 costed jobs and Frankie was
// $180,328.83 low. This pins the three rules that are now shared, and states
// the one that is not.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { jobCosting } from './reports'
import { execFrankieTool } from '../../supabase/functions/_shared/frankieTools.ts'

const CALLER = { companyId: 3, role: 'admin' }
const REST = { url: 'https://x.supabase.co', key: 'k' }

const products = [
  { id: 400, cost: 5000, material_or_labor: 'material' },
  { id: 401, cost: 1000, material_or_labor: 'labor' },
]
const jobs = [
  { id: 1, job_id: 'J-1', job_title: 'No punches', status: 'Completed', customer_id: null },
  { id: 2, job_id: 'J-2', job_title: 'Has punches', status: 'Completed', customer_id: null },
]
const jobLines = [
  { job_id: 1, item_id: 400, quantity: 1, labor_cost: 0 },
  { job_id: 1, item_id: 401, quantity: 1, labor_cost: 0 },
  { job_id: 2, item_id: 401, quantity: 1, labor_cost: 0 },
]
// A $400 PARTS receipt (the catalog already prices those parts) and a $100
// meal (extra money the job really cost).
const plaid = [
  { id: 70, job_id: 1, amount: 400, is_transfer: false, user_category: 'Materials', ai_category: 'Fuel', date: '2026-10-06' },
  { id: 71, job_id: 1, amount: 100, is_transfer: false, user_category: 'Meals', ai_category: 'Meals', date: '2026-10-06' },
]
// The same $100 as bank row 71, snapped as a receipt and matched to it.
const expenses = [{ id: 90, job_id: 1, amount: 100, category: 'Meals', plaid_transaction_id: 71, date: '2026-10-06' }]
const jobBonuses = [
  { job_id: 1, amount: 250, status: 'accrued' },
  { job_id: 1, amount: 999, status: 'pending' },   // not owed yet — neither side charges it
]
const payments = [{ id: 1, job_id: 1, amount: 10000, date: '2026-10-06' }]
const timeClock = [{ employee_id: 5, job_id: 2, total_hours: 10 }]
const employees = [{ id: 5, hourly_rate: 50 }]

const TABLES = {
  jobs, job_lines: jobLines, payments, invoices: [], expenses, time_clock: timeClock,
  job_bonuses: jobBonuses, plaid_transactions: plaid,
  products_services: products, product_components: [], customers: [],
}

function stubFetch() {
  vi.stubGlobal('fetch', (url, init = {}) => {
    const table = String(url).split('/rest/v1/')[1].split('?')[0]
    const from = Number((init.headers?.Range || '0-999').split('-')[0])
    const rows = from > 0 ? [] : (TABLES[table] ?? [])
    return Promise.resolve(new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}
afterEach(() => vi.unstubAllGlobals())

const report = () => jobCosting({
  jobs, jobLines, payments, invoices: [], products, productComponents: [],
  plaidTransactions: plaid, manualExpenses: expenses, timeClock, employees, jobBonuses, company: null,
})

describe('Frankie agrees with the Job Costing report', () => {
  it('matches it exactly on a job with no punches', async () => {
    stubFetch()
    const f = await execFrankieTool('query_job_profitability', {}, CALLER, REST)
    const fj = f.jobs.find(x => x.job === 'J-1')
    const rj = report().rows.find(x => x.job === 'J-1')
    expect(fj.material).toBe(rj.material)
    expect(fj.labor).toBe(rj.labor)
    expect(fj.tagged_expenses).toBe(rj.tagged_expense)
    expect(fj.bonuses).toBe(rj.bonuses)
    expect(fj.total_cost).toBe(rj.total_cost)
  })

  it('does not add a parts receipt on top of the catalog parts it describes', async () => {
    stubFetch()
    const f = await execFrankieTool('query_job_profitability', {}, CALLER, REST)
    const fj = f.jobs.find(x => x.job === 'J-1')
    // $5,000 of catalog parts and a $400 parts receipt is still $5,000 of
    // parts. Summing them — what this port did — reads $5,400.
    expect(fj.material).toBe(5000)
    expect(fj.material_basis).toBe('estimate')
  })

  it('counts a receipt and the bank row it was matched to once', async () => {
    stubFetch()
    const f = await execFrankieTool('query_job_profitability', {}, CALLER, REST)
    // $100 of meals, not $200: the receipt IS bank row 71.
    expect(f.jobs.find(x => x.job === 'J-1').tagged_expenses).toBe(100)
  })

  it('charges the crew bonus the job owes, and not one still pending', async () => {
    stubFetch()
    const f = await execFrankieTool('query_job_profitability', {}, CALLER, REST)
    expect(f.jobs.find(x => x.job === 'J-1').bonuses).toBe(250)
  })

  it('totals parts + labor + tagged + bonuses', async () => {
    stubFetch()
    const f = await execFrankieTool('query_job_profitability', {}, CALLER, REST)
    expect(f.jobs.find(x => x.job === 'J-1').total_cost).toBe(5000 + 1000 + 100 + 250)
  })
})

describe('the one rule Frankie still cannot apply: clocked labor', () => {
  it('shows the punched hours and says the labor figure is the estimate', async () => {
    stubFetch()
    const f = await execFrankieTool('query_job_profitability', {}, CALLER, REST)
    const fj = f.jobs.find(x => x.job === 'J-2')
    expect(fj.labor_hours_clocked).toBe(10)
    expect(fj.labor_basis).toBe('estimate')
    expect(fj.labor).toBe(1000)                       // the line estimate
  })

  it('the report prices those hours instead, so the two differ by design', async () => {
    const rj = report().rows.find(x => x.job === 'J-2')
    expect(rj.labor_source).toBe('actual')
    expect(rj.labor).toBe(500)                        // 10 h x $50
    expect(rj.labor).not.toBe(1000)
  })

  it('says so in the scope line, so Frankie never quotes it as the job cost', async () => {
    stubFetch()
    const f = await execFrankieTool('query_job_profitability', {}, CALLER, REST)
    expect(f.scope).toMatch(/labor_basis/)
    expect(f.scope).toMatch(/LOW/)
  })
})
