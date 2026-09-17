import { describe, it, expect } from 'vitest'
import { depositsHeld } from './depositsHeld'

const invoices = [
  { id: 10, invoice_id: 'INV-DEP-1', invoice_type: 'deposit', job_id: 1 },
  { id: 11, invoice_id: 'INV-1', invoice_type: 'standard', job_id: 1, parent_invoice_id: 10 },  // applies deposit 10
  { id: 20, invoice_id: 'INV-DEP-2', invoice_type: 'deposit', job_id: 2 },                       // still waiting
  { id: 30, invoice_id: 'INV-3', invoice_type: 'standard', job_id: 3 },
]

describe('depositsHeld', () => {
  it('keeps deposits whose deposit invoice has no balance invoice yet, drops applied ones', () => {
    const r = depositsHeld({ invoices, payments: [
      { id: 1, is_deposit: true, amount: 500, invoice_id: 10, date: '2026-08-01' },   // applied via INV-1
      { id: 2, is_deposit: true, amount: 700, invoice_id: 20, date: '2026-09-01' },   // held
      { id: 3, is_deposit: true, amount: 300, job_id: 3, date: '2026-09-02' },        // job 3 already has a final invoice
      { id: 4, is_deposit: true, amount: 250, job_id: 4, date: '2026-09-03' },        // held (no invoice on job 4)
      { id: 5, is_deposit: false, amount: 999, date: '2026-09-03' },                  // not a deposit
      { id: 6, is_deposit: true, amount: 100, invoice_id: 20, status: 'Refunded' },   // refunded
    ] })
    expect(r.rows.map(x => x.id)).toEqual([4, 2])
    expect(r.total).toBe(950)
  })
  it('counts lead deposits until they carry an invoice or their job is invoiced', () => {
    const r = depositsHeld({ invoices, leadPayments: [
      { id: 1, amount: 200, date_created: '2026-09-01', lead_customer_name: 'Dana' },
      { id: 2, amount: 300, date_created: '2026-09-02', invoice_id: 30 },
      { id: 3, amount: 400, date_created: '2026-09-03', job_id: 3 },
      { id: 4, amount: 150, date_created: '2026-09-04', job_id: 2 },
    ] })
    expect(r.rows.map(x => x.id)).toEqual([4, 1])
    expect(r.total).toBe(350)
  })
})
