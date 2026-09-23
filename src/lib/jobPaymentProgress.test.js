import { describe, it, expect } from 'vitest'
import { jobPaymentProgress } from './arHelpers'

// Alayda (0776c1db): the Jobs card read jobs.invoice_status, which only ever
// holds Not Invoiced / Invoiced / Paid — nothing in that column means "some
// of it has come in", so a job with half its money collected looked exactly
// like one with none.

const inv = (id, job_id, amount, extra = {}) => ({ id, job_id, amount, discount_applied: 0, tax_amount: null, payment_status: 'Pending', ...extra })
const pay = (invoice_id, amount) => ({ invoice_id, amount, paid_by: 'customer' })

describe('where a job stands on getting paid', () => {
  it('says nothing when the job has never been invoiced', () => {
    expect(jobPaymentProgress(7, [], [])).toMatchObject({ state: 'none', billed: 0, paid: 0, count: 0 })
    expect(jobPaymentProgress(7, [inv(1, 99, 500)], [])).toMatchObject({ state: 'none' })
  })

  it('invoiced and nothing collected', () => {
    expect(jobPaymentProgress(7, [inv(1, 7, 500)], [])).toMatchObject({ state: 'unpaid', billed: 500, paid: 0 })
  })

  it('part of it has come in', () => {
    expect(jobPaymentProgress(7, [inv(1, 7, 500)], [pay(1, 200)]))
      .toMatchObject({ state: 'partial', billed: 500, paid: 200 })
  })

  it('all of it has come in', () => {
    expect(jobPaymentProgress(7, [inv(1, 7, 500)], [pay(1, 500)]))
      .toMatchObject({ state: 'paid', billed: 500, paid: 500 })
  })

  it('two invoices, one settled and one not, is partial — not paid', () => {
    const rows = [inv(1, 7, 500, { payment_status: 'Paid' }), inv(2, 7, 300)]
    expect(jobPaymentProgress(7, rows, [pay(1, 500)]))
      .toMatchObject({ state: 'partial', billed: 800, paid: 500, count: 2 })
  })

  it('a job the utility paid in full reads paid, not unpaid (the customer owed nothing)', () => {
    // The whole invoice is covered by the incentive, and the utility has
    // settled — the same case that left SMC Auto reading "open" on the
    // dashboard. invoicePaymentStatus is the rule; this just agrees with it.
    const covered = inv(1, 7, 32143.06, { discount_applied: 32143.06, utility_owes: 30000, utility_paid_at: '2026-09-14' })
    expect(jobPaymentProgress(7, [covered], [])).toMatchObject({ state: 'paid', billed: 0 })
  })

  it('the same invoice with the utility still owing is not paid', () => {
    const covered = inv(1, 7, 32143.06, { discount_applied: 32143.06, utility_owes: 30000, utility_paid_at: null })
    expect(jobPaymentProgress(7, [covered], [])).toMatchObject({ state: 'unpaid' })
  })

  it('ignores Void and Cancelled invoices — nobody expects that money', () => {
    const rows = [inv(1, 7, 500, { payment_status: 'Void' }), inv(2, 7, 200)]
    expect(jobPaymentProgress(7, rows, [pay(2, 200)])).toMatchObject({ state: 'paid', billed: 200, count: 1 })
    expect(jobPaymentProgress(7, [inv(1, 7, 500, { payment_status: 'Cancelled' })], [])).toMatchObject({ state: 'none' })
  })

  it('counts only the customer\'s own payments', () => {
    const utilityPayment = { invoice_id: 1, amount: 500, paid_by: 'utility' }
    expect(jobPaymentProgress(7, [inv(1, 7, 500)], [utilityPayment])).toMatchObject({ state: 'unpaid', paid: 0 })
  })
})
