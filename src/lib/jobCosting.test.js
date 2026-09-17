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
