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
