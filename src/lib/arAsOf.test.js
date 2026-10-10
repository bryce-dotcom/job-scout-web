import { describe, it, expect } from 'vitest'
import { arAsOf, totalCustomerAR, totalUtilityAR, paymentsByInvoiceIndex } from './arHelpers'

// AR is a balance, so a weekly scorecard has to ask for it AT a date.
// Asking for "now" printed the same figure in both week columns for ever.
//
// The rule these tests pin: an invoice counts once it exists, and stops
// counting as the money actually dated arrives — never by today's status,
// which would erase every week the invoice spent outstanding.

const SUN = '2026-09-20'      // end of the week being graded
const PREV_SUN = '2026-09-13' // end of the week before

describe('arAsOf — customer side', () => {
  const invoice = {
    id: 1, created_at: '2026-09-08T17:00:00Z', amount: 1000,
    discount_applied: 0, payment_status: 'Paid',
  }

  it('counts an invoice that was still unpaid on that day', () => {
    const payments = [{ invoice_id: 1, amount: 1000, date: '2026-09-18' }]
    expect(arAsOf(PREV_SUN, { invoices: [invoice], payments }).customer).toBe(1000)
  })

  it('stops counting it once the payment has arrived', () => {
    const payments = [{ invoice_id: 1, amount: 1000, date: '2026-09-18' }]
    expect(arAsOf(SUN, { invoices: [invoice], payments }).customer).toBe(0)
  })

  it('carries only the unpaid remainder after a part payment', () => {
    const payments = [{ invoice_id: 1, amount: 400, date: '2026-09-10' }]
    expect(arAsOf(SUN, { invoices: [{ ...invoice, payment_status: 'Partially Paid' }], payments }).customer).toBe(600)
  })

  it('ignores an invoice that did not exist yet', () => {
    const later = { ...invoice, id: 2, created_at: '2026-09-19T17:00:00Z', payment_status: 'Pending' }
    expect(arAsOf(PREV_SUN, { invoices: [later], payments: [] }).customer).toBe(0)
    expect(arAsOf(SUN, { invoices: [later], payments: [] }).customer).toBe(1000)
  })

  it('does NOT use today\'s status to erase past weeks', () => {
    // The whole point: this invoice reads Paid now, and was open then.
    const payments = [{ invoice_id: 1, amount: 1000, date: '2026-09-18' }]
    expect(totalCustomerAR([invoice], paymentsByInvoiceIndex(payments))).toBe(0)
    expect(arAsOf(PREV_SUN, { invoices: [invoice], payments }).customer).toBe(1000)
  })

  it('drops an invoice marked paid with nothing dated to explain it', () => {
    // 3 of HHH's 6,542. Carrying them would disagree with the AR every other
    // screen shows today, which is the first thing anyone checks.
    expect(arAsOf(SUN, { invoices: [invoice], payments: [] }).customer).toBe(0)
  })

  it('never counts a void or cancelled invoice', () => {
    for (const payment_status of ['Void', 'Cancelled']) {
      expect(arAsOf(SUN, { invoices: [{ ...invoice, payment_status }], payments: [] }).customer).toBe(0)
    }
  })

  it('bills the customer their net share, not the gross project', () => {
    // A $14,162.93 job fully covered by the incentive: the customer owes $0.
    const covered = { id: 9, created_at: '2026-09-01T00:00:00Z', amount: 14162.93, discount_applied: 14162.93, payment_status: 'Paid' }
    expect(arAsOf(SUN, { invoices: [covered], payments: [] }).customer).toBe(0)
  })

  it('a utility payment on the same invoice does not settle the customer', () => {
    const payments = [{ invoice_id: 1, amount: 1000, date: '2026-09-10', paid_by: 'utility' }]
    expect(arAsOf(SUN, { invoices: [{ ...invoice, payment_status: 'Pending' }], payments }).customer).toBe(1000)
  })
})

describe('arAsOf — utility side', () => {
  const carrier = {
    id: 5, created_at: '2026-09-01T00:00:00Z', amount: 20000, discount_applied: 20000,
    payment_status: 'Paid', utility_owes: 20000, utility_paid_at: '2026-09-17T00:00:00Z',
  }

  it('the rebate is owed until the utility actually settles', () => {
    expect(arAsOf(PREV_SUN, { invoices: [carrier] }).utility).toBe(20000)
    expect(arAsOf(SUN, { invoices: [carrier] }).utility).toBe(0)
  })

  it('an unsettled rebate keeps counting', () => {
    expect(arAsOf(SUN, { invoices: [{ ...carrier, utility_paid_at: null }] }).utility).toBe(20000)
  })

  it('counts a utility row whose invoice does not carry the debt', () => {
    const rows = [{ id: 77, invoice_id: null, created_at: '2026-09-02T00:00:00Z', amount: 3000, payment_status: 'Pending', paid_at: null }]
    expect(arAsOf(SUN, { utilityInvoices: rows }).utility).toBe(3000)
  })

  it('does not count the same rebate twice when the invoice carries it', () => {
    const rows = [{ id: 78, invoice_id: 5, created_at: '2026-09-02T00:00:00Z', amount: 20000, payment_status: 'Pending' }]
    const both = arAsOf(PREV_SUN, { invoices: [carrier], utilityInvoices: rows })
    expect(both.utility).toBe(20000)
  })

  it('falls back to the row status when there is no settlement date', () => {
    const rows = [{ id: 79, invoice_id: null, created_at: '2026-09-02T00:00:00Z', amount: 500, payment_status: 'Paid', paid_at: null }]
    expect(arAsOf(SUN, { utilityInvoices: rows }).utility).toBe(0)
  })
})

describe('arAsOf — agreeing with the live number', () => {
  // The newest week must match what Books and the Dashboard show today,
  // or nobody will believe either of them.
  const invoices = [
    { id: 1, created_at: '2026-09-01T00:00:00Z', amount: 1000, discount_applied: 0, payment_status: 'Pending' },
    { id: 2, created_at: '2026-09-02T00:00:00Z', amount: 500, discount_applied: 0, payment_status: 'Paid' },
    { id: 3, created_at: '2026-09-03T00:00:00Z', amount: 2000, discount_applied: 0, payment_status: 'Void' },
  ]
  const payments = [{ invoice_id: 2, amount: 500, date: '2026-09-05' }]
  const utilityInvoices = [{ id: 9, invoice_id: null, created_at: '2026-09-01T00:00:00Z', amount: 700, payment_status: 'Pending' }]

  it('matches totalCustomerAR + totalUtilityAR once every payment has landed', () => {
    const live = totalCustomerAR(invoices, paymentsByInvoiceIndex(payments)) + totalUtilityAR(utilityInvoices, invoices)
    expect(arAsOf(SUN, { invoices, utilityInvoices, payments }).total).toBe(live)
    expect(live).toBe(1700)
  })

  it('total is customer plus utility', () => {
    const r = arAsOf(SUN, { invoices, utilityInvoices, payments })
    expect(r.total).toBe(r.customer + r.utility)
  })

  it('returns zeros rather than throwing on junk', () => {
    expect(arAsOf('', {})).toEqual({ customer: 0, utility: 0, total: 0 })
    expect(arAsOf(null)).toEqual({ customer: 0, utility: 0, total: 0 })
    expect(arAsOf(SUN, {})).toEqual({ customer: 0, utility: 0, total: 0 })
  })
})
