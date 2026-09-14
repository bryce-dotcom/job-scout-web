import { describe, it, expect } from 'vitest'
import { statementModel } from './customerStatement'

// Vernal Hay Company as it stood on 2026-09-13: one February invoice paid in
// full whose only payment row is a legacy 'Open' import, one invoice with
// three payments and $616.32 to go. The old statement said $4,749.24.
const vernalInvoices = [
  { id: 17156, invoice_id: '8617', amount: 4132.92, discount_applied: null, payment_status: 'Paid', created_at: '2026-02-13', job_description: 'Hay barn lighting' },
  { id: 17149, invoice_id: '8624', amount: 3697.46, discount_applied: 0, payment_status: 'Partially Paid', created_at: '2026-02-17', job_description: 'Shop lighting' },
]
const vernalPayments = [
  { id: 17149, invoice_id: 17156, amount: 4132.92, status: 'Open', date: '2026-03-07', paid_by: 'customer' },
  { id: 28553, invoice_id: 17149, amount: 1232.15, status: 'Completed', date: '2026-03-16', paid_by: 'customer' },
  { id: 28598, invoice_id: 17149, amount: 1232.66, status: 'Completed', date: '2026-05-26', paid_by: 'customer' },
  { id: 28680, invoice_id: 17149, amount: 616.33, status: 'Completed', date: '2026-07-13', paid_by: 'customer' },
]

describe('Vernal Hay: the balance is what they actually owe', () => {
  it('is $616.32, not the sum of invoices minus Completed rows', () => {
    const m = statementModel(vernalInvoices, vernalPayments)
    expect(m.balanceDue).toBeCloseTo(616.32, 2)
  })
  it('lists only the open invoice by default, with its own paid/balance', () => {
    const m = statementModel(vernalInvoices, vernalPayments)
    expect(m.lines.map(l => l.number)).toEqual(['8624'])
    expect(m.lines[0].paid).toBeCloseTo(3081.14, 2)
    expect(m.lines[0].balance).toBeCloseTo(616.32, 2)
    expect(m.hiddenPaidCount).toBe(1)
    expect(m.payments).toHaveLength(3)
  })
  it('full history lists both, and the Paid one carries no balance whatever its rows say', () => {
    const m = statementModel(vernalInvoices, vernalPayments, { outstandingOnly: false })
    expect(m.lines.map(l => l.number)).toEqual(['8617', '8624'])
    expect(m.lines[0].balance).toBe(0)
    expect(m.lines[0].paid).toBeCloseTo(4132.92, 2)
    expect(m.balanceDue).toBeCloseTo(616.32, 2)
    expect(m.totalPaid).toBeCloseTo(7830.38 - 616.32, 2)
    expect(m.payments).toHaveLength(4)
  })
})

describe('Jan Pro: 180 invoices, twelve owed', () => {
  const invoices = Array.from({ length: 180 }, (_, i) => ({
    id: i + 1, invoice_id: `INV-${i + 1}`, amount: 145, discount_applied: null,
    payment_status: i < 168 ? 'Paid' : 'Pending', created_at: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
  }))
  it('shows the twelve, and says how many paid ones were left off', () => {
    const m = statementModel(invoices, [])
    expect(m.lines).toHaveLength(12)
    expect(m.hiddenPaidCount).toBe(168)
    expect(m.balanceDue).toBe(12 * 145)
    expect(m.openCount).toBe(12)
  })
})

describe('what never belongs on a customer statement', () => {
  it('the utility incentive is not the customer\'s to pay', () => {
    const inv = [{ id: 1, invoice_id: 'A', amount: 10000, discount_applied: 7500, payment_status: 'Pending', created_at: '2026-01-01' }]
    const m = statementModel(inv, [])
    expect(m.lines[0].total).toBe(2500)
    expect(m.balanceDue).toBe(2500)
  })
  it('a utility\'s payment on the shared invoice does not settle the customer', () => {
    const inv = [{ id: 1, invoice_id: 'A', amount: 10000, discount_applied: 7500, payment_status: 'Pending', created_at: '2026-01-01' }]
    const pay = [{ id: 9, invoice_id: 1, amount: 7500, status: 'Completed', paid_by: 'utility', date: '2026-02-01' }]
    const m = statementModel(inv, pay)
    expect(m.balanceDue).toBe(2500)
    expect(m.payments).toHaveLength(0)
  })
  it('void invoices are gone from both modes', () => {
    const inv = [{ id: 1, invoice_id: 'V', amount: 100, payment_status: 'Void', created_at: '2026-01-01' }]
    expect(statementModel(inv, []).lines).toHaveLength(0)
    expect(statementModel(inv, [], { outstandingOnly: false }).lines).toHaveLength(0)
  })
})
