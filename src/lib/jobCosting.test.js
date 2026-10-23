import { describe, it, expect } from 'vitest'
import { jobCosting } from './reports'

// One installed job, paid through its invoice; one service job paid with a
// payment tagged straight to the job; one bundle line whose cost lives in
// its components.
const jobs = [
  { id: 10, job_id: 'J-10', job_title: 'Gym retrofit', status: 'Completed' },
  { id: 11, job_id: 'J-11', job_title: 'Sign repair', status: 'Completed' },
]
const invoices = [{ id: 500, job_id: 10 }]
const jobLines = [{ job_id: 10, item_id: 100, quantity: 10, labor_cost: 0 }]
const products = [
  { id: 100, cost: 0 },
  { id: 101, cost: 300, material_or_labor: 'material' },
  { id: 102, cost: 150, material_or_labor: 'labor' },
]
const productComponents = [
  { parent_product_id: 100, component_product_id: 101, quantity: 1 },
  { parent_product_id: 100, component_product_id: 102, quantity: 1 },
]

describe('job costing follows a payment to its job', () => {
  it('credits a payment recorded on the invoice to the invoice\'s job', () => {
    // The common case: the customer paid the invoice; nobody tagged the
    // payment to the job. Before, this job read as $0 revenue on $4,500 cost.
    const r = jobCosting({
      jobs, invoices, jobLines, products, productComponents,
      payments: [{ id: 1, invoice_id: 500, amount: 10000, date: '2026-08-01' }],
    })
    const gym = r.rows.find(x => x.job === 'J-10')
    expect(gym.revenue).toBe(10000)
    expect(gym.total_cost).toBe(4500)
    expect(gym.profit).toBe(5500)
  })

  it('still honours a payment tagged straight to a job, and never counts one twice', () => {
    const r = jobCosting({
      jobs, invoices, jobLines, products, productComponents,
      payments: [
        { id: 1, invoice_id: 500, job_id: 10, amount: 10000, date: '2026-08-01' },   // carries both — counted once
        { id: 2, job_id: 11, amount: 680, date: '2026-08-02' },
      ],
    })
    expect(r.rows.find(x => x.job === 'J-10').revenue).toBe(10000)
    expect(r.rows.find(x => x.job === 'J-11').revenue).toBe(680)
    expect(r.summary.totalRevenue).toBe(10680)
  })

  it('leaves a payment alone when neither it nor its invoice names a job', () => {
    const r = jobCosting({
      jobs, invoices: [{ id: 501, job_id: null }], jobLines, products, productComponents,
      payments: [{ id: 3, invoice_id: 501, amount: 250, date: '2026-08-03' }],
    })
    expect(r.summary.totalRevenue).toBe(0)
  })
})

describe('a receipt snapped on the job is a cost of that job', () => {
  // The receipt rows live on the expenses table with `date`, not
  // `expense_date`; the window filter used to read only expense_date and
  // dropped every one of them from a dated report.
  const receipt = { id: 7, job_id: 11, amount: 389.42, date: '2026-08-05', receipt_storage_path: 'r.jpg' }

  it('counts the receipt, inside the window, with no bank row yet', () => {
    const r = jobCosting({ jobs, invoices, manualExpenses: [receipt], from: '2026-08-01', to: '2026-08-31' })
    expect(r.rows.find(x => x.job === 'J-11').total_cost).toBe(389.42)
    const out = jobCosting({ jobs, invoices, manualExpenses: [receipt], from: '2026-09-01', to: '2026-09-30' })
    expect(out.rows.find(x => x.job === 'J-11')?.total_cost ?? null).toBeNull()
  })

  it('counts the money once after Books matches the receipt to its bank row', () => {
    const bank = { id: 40, amount: 389.42, date: '2026-08-06', job_id: 11, expense_id: 7 }
    const r = jobCosting({ jobs, invoices, manualExpenses: [{ ...receipt, plaid_transaction_id: 40 }], plaidTransactions: [bank] })
    expect(r.rows.find(x => x.job === 'J-11').total_cost).toBe(389.42)
  })

  it('still counts a matched receipt when the bank row carries no job', () => {
    const bank = { id: 40, amount: 389.42, date: '2026-08-06', expense_id: 7 }
    const r = jobCosting({ jobs, invoices, manualExpenses: [{ ...receipt, plaid_transaction_id: 40 }], plaidTransactions: [bank] })
    expect(r.rows.find(x => x.job === 'J-11').total_cost).toBe(389.42)
  })
})

// ── Parts: the catalog and the receipts describe the same parts ───────────
import { isMaterialSpend } from './reports'

describe('a parts receipt is not a second set of parts', () => {
  const jobs = [{ id: 20, job_id: 'J-20', status: 'Completed' }]
  const jobLines = [{ job_id: 20, item_id: 200, quantity: 1, labor_cost: 0 }]
  const products = [{ id: 200, cost: 16257, material_or_labor: 'material' }]
  const run = (manualExpenses) => jobCosting({
    jobs, jobLines, products, productComponents: [], payments: [], invoices: [], manualExpenses,
  }).rows.find(r => r.job === 'J-20')

  it('does not add a supplier receipt on top of the catalog parts', () => {
    // $16,257 of catalog parts and a $434 receipt is not $16,691 of parts.
    const r = run([{ job_id: 20, amount: 434, category: 'Materials', date: '2026-10-06' }])
    expect(r.material).toBe(16257)
    expect(r.total_cost).toBe(16257)
  })

  it('keeps the estimate when the receipts are only partly captured', () => {
    const r = run([{ job_id: 20, amount: 434, category: 'Job Materials', date: '2026-10-06' }])
    expect(r.material_source).toBe('estimate')
    expect(r.material_receipts).toBe(434)
    expect(r.material_estimate).toBe(16257)
  })

  it('believes the receipts once they exceed the estimate', () => {
    const r = run([{ job_id: 20, amount: 20000, category: 'Materials', date: '2026-10-06' }])
    expect(r.material).toBe(20000)
    expect(r.material_source).toBe('actual')
  })

  it('still adds spend that is NOT parts', () => {
    const r = run([
      { job_id: 20, amount: 434, category: 'Materials', date: '2026-10-06' },
      { job_id: 20, amount: 120, category: 'Equipment Rental', date: '2026-10-06' },
      { job_id: 20, amount: 40, category: 'Meals', date: '2026-10-06' },
    ])
    expect(r.material).toBe(16257)
    expect(r.tagged_expense).toBe(160)
    expect(r.total_cost).toBe(16417)
  })

  it('costs a job that has only receipts and no catalog lines', () => {
    const r = jobCosting({
      jobs: [{ id: 21, job_id: 'J-21', status: 'Completed' }], jobLines: [], products: [],
      productComponents: [], payments: [], invoices: [],
      manualExpenses: [{ job_id: 21, amount: 900, category: 'Materials', date: '2026-10-06' }],
    }).rows.find(r => r.job === 'J-21')
    expect(r.material).toBe(900)
    expect(r.material_source).toBe('actual')
  })
})

describe('isMaterialSpend', () => {
  it('counts the parts categories', () => {
    for (const c of ['Materials', 'Job Materials', 'materials', 'Parts']) expect(isMaterialSpend(c), c).toBe(true)
  })
  it('leaves consumables, tools and everything else to add on top', () => {
    for (const c of ['Small Tools & Consumables', 'Equipment Rental', 'Meals', 'Supplies', 'Subscriptions', '', null]) {
      expect(isMaterialSpend(c), String(c)).toBe(false)
    }
  })
})

describe('overhead rides on the hours, per person on the job', () => {
  const jobs = [{ id: 30, job_id: 'J-30', status: 'Completed' }]
  const timeClock = [
    { employee_id: 1, job_id: 30, clock_in: '2026-10-06T13:00:00Z', total_hours: 8 },
    { employee_id: 2, job_id: 30, clock_in: '2026-10-06T13:00:00Z', total_hours: 8 },
  ]
  const employees = [{ id: 1, hourly_rate: 20, is_hourly: true }, { id: 2, hourly_rate: 20, is_hourly: true }]

  it('charges every person-hour, so a two-man day carries twice a one-man day', () => {
    const r = jobCosting({ jobs, timeClock, employees, overheadPerHour: 23, payments: [], invoices: [] })
      .rows.find(x => x.job === 'J-30')
    expect(r.labor_hours).toBe(16)
    expect(r.overhead).toBe(16 * 23)
  })

  it('adds nothing when the caller supplies no rate', () => {
    const r = jobCosting({ jobs, timeClock, employees, payments: [], invoices: [] }).rows.find(x => x.job === 'J-30')
    expect(r.overhead).toBe(0)
    expect(r.total_cost).toBe(16 * 20)
  })

  it('charges no overhead to a job nobody clocked into', () => {
    // No hours, no overhead — we have no basis to spread it on.
    const r = jobCosting({
      jobs: [{ id: 31, job_id: 'J-31', status: 'Completed' }],
      jobLines: [{ job_id: 31, item_id: 900, quantity: 1 }],
      products: [{ id: 900, cost: 500, material_or_labor: 'material' }],
      productComponents: [], overheadPerHour: 23, payments: [], invoices: [],
    }).rows.find(x => x.job === 'J-31')
    expect(r.overhead).toBe(0)
    expect(r.total_cost).toBe(500)
  })
})

describe('overhead by revenue instead of hours', () => {
  const jobs = [{ id: 40, job_id: 'J-40', status: 'Completed', job_total: 10000 }]
  const timeClock = [{ employee_id: 1, job_id: 40, clock_in: '2026-10-06T13:00:00Z', total_hours: 10 }]
  const employees = [{ id: 1, hourly_rate: 20, is_hourly: true }]
  const run = (opts) => jobCosting({ jobs, timeClock, employees, payments: [], invoices: [], ...opts })
    .rows.find(r => r.job === 'J-40')

  it('carries a share of the pool proportional to what the job was worth', () => {
    expect(run({ overheadPctOfRevenue: 6 }).overhead).toBe(600)
  })

  it('uses the job total, not the cash collected — a job invoiced next week still carries its share', () => {
    const r = jobCosting({
      jobs, timeClock, employees, invoices: [], payments: [], overheadPctOfRevenue: 6,
    }).rows.find(x => x.job === 'J-40')
    expect(r.revenue).toBe(0)        // nothing paid yet
    expect(r.overhead).toBe(600)     // still carries its overhead
  })

  it('a percentage wins over an hourly rate when both are passed', () => {
    const r = run({ overheadPctOfRevenue: 6, overheadPerHour: 68 })
    expect(r.overhead).toBe(600)     // not 10 x 68
  })

  it('falls back to the hourly rate when no percentage is given', () => {
    expect(run({ overheadPerHour: 68 }).overhead).toBe(680)
  })

  it('charges an unpriced job nothing by revenue, where by the hour it paid', () => {
    const free = [{ id: 41, job_id: 'J-41', status: 'Completed', job_total: 0 }]
    const punch = [{ employee_id: 1, job_id: 41, clock_in: '2026-10-06T13:00:00Z', total_hours: 10 }]
    const byRev = jobCosting({ jobs: free, timeClock: punch, employees, payments: [], invoices: [], overheadPctOfRevenue: 6 })
      .rows.find(r => r.job === 'J-41')
    expect(byRev.overhead).toBe(0)
  })
})

describe('overhead never stands in for a cost nobody recorded', () => {
  it('a job with no parts, hours or receipts stays uncosted even with overhead on', () => {
    const r = jobCosting({
      jobs: [{ id: 50, job_id: 'J-50', status: 'Completed', job_total: 9000 }],
      payments: [], invoices: [], overheadPctOfRevenue: 15,
    }).rows.find(x => x.job === 'J-50')
    // Nothing is known about this job's cost; a slice of rent does not change
    // that, and it must not read as a 85%-margin job.
    expect(r).toBeUndefined()
  })

  it('a job that IS costed carries its overhead share', () => {
    const r = jobCosting({
      jobs: [{ id: 51, job_id: 'J-51', status: 'Completed', job_total: 9000 }],
      jobLines: [{ job_id: 51, item_id: 1, quantity: 1 }],
      products: [{ id: 1, cost: 100, material_or_labor: 'material' }],
      productComponents: [], payments: [], invoices: [], overheadPctOfRevenue: 15,
    }).rows.find(x => x.job === 'J-51')
    expect(r.overhead).toBe(1350)
    expect(r.total_cost).toBe(1450)
  })
})

// ── A guess is not a cost ─────────────────────────────────────────────────
// HHH, 2026-10-22: exactly one bank row platform-wide reached job costing on
// the matcher's guess alone — $26.39 of "Subscriptions" on The Breakfast Club
// at 0.50 confidence. jobCosting read `job_id || ai_job_id`, so the job paid
// for it, and lib/overhead read the same expression, so the pool lost it at
// the same time: one unreviewed guess, two reports moving opposite ways.
describe('an AI job guess does not charge the job', () => {
  const guessJobs = [{ id: 30, job_id: 'J-30', status: 'Completed' }]
  const run = (plaidTransactions) => jobCosting({
    jobs: guessJobs, jobLines: [], products: [], productComponents: [],
    payments: [], invoices: [], plaidTransactions,
  }).rows.find(r => r.job === 'J-30')

  it('charges a bank row a person tagged to the job', () => {
    const r = run([{ id: 60, amount: 26.39, date: '2026-08-01', job_id: 30, ai_category: 'Subscriptions' }])
    expect(r.tagged_expense).toBe(26.39)
    expect(r.total_cost).toBe(26.39)
  })

  it('leaves the job alone when only the matcher named it', () => {
    const r = run([{ id: 61, amount: 26.39, date: '2026-08-01', job_id: null, ai_job_id: 30, ai_job_confidence: 0.5, ai_category: 'Subscriptions' }])
    expect(r ?? null).toBeNull()
  })

  it('ignores a near-certain guess too — confidence is not consent', () => {
    const r = run([{ id: 62, amount: 4000, date: '2026-08-01', job_id: null, ai_job_id: 30, ai_job_confidence: 0.99 }])
    expect(r ?? null).toBeNull()
  })

  it('counts it the moment someone confirms the row onto the job', () => {
    // Confirming promotes ai_job_id into job_id (Books.jsx), which is why
    // holding the guess back costs nothing: review the row and it lands.
    const r = run([{ id: 63, amount: 26.39, date: '2026-08-01', job_id: 30, ai_job_id: 30, confirmed: true }])
    expect(r.tagged_expense).toBe(26.39)
  })

  it('stays off the job when a person cleared it on a confirmed row', () => {
    const r = run([{ id: 64, amount: 26.39, date: '2026-08-01', job_id: null, ai_job_id: 30, confirmed: true }])
    expect(r ?? null).toBeNull()
  })
})
