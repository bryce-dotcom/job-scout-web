import { describe, it, expect } from 'vitest'
import {
  BASIS_CASH, BASIS_ACCRUAL, invoiceNet, cashRevenue, accrualRevenue, computeRevenue, cashExpenses,
} from './revenueBasis'

// ─────────────────────────────────────────────────────────────────────────
// These functions produce the revenue and expense numbers on the Dashboard
// and in Books. They had NO tests, despite the comments in the source
// recording TWO separate double-counting incidents that already shipped:
//   - a local copy of the legacy-net test counted a fully-covered invoice's
//     whole gross as revenue instead of $0
//   - manual expenses + bank rows were summed together, double-counting
//     every reconciled purchase
// Both are the exact "fixed it, broke it again" pattern. These lock the
// no-double-count rules so a third incident fails a test instead of a report.
// ─────────────────────────────────────────────────────────────────────────

const ALL = () => true
const NONE = () => false

describe('invoiceNet — never double-subtract a deduction', () => {
  it('subtracts the deduction from a normal gross invoice', () => {
    expect(invoiceNet({ amount: 1000, discount_applied: 250 })).toBe(750)
  })

  it('returns $0, not the gross, for a fully-covered invoice', () => {
    // The incident in the source comment: a 100%-utility-funded project was
    // counting its ENTIRE gross as revenue.
    const net = invoiceNet({ amount: 5000, discount_applied: 5000 })
    expect(net).toBe(0)
  })

  it('never goes negative', () => {
    expect(invoiceNet({ amount: 500, discount_applied: 900 })).toBeGreaterThanOrEqual(0)
  })

  it('treats a missing deduction as zero', () => {
    expect(invoiceNet({ amount: 400 })).toBe(400)
  })
})

describe('cashRevenue — only money that actually arrived', () => {
  it('counts collected payments', () => {
    const r = cashRevenue({ payments: [{ amount: 500, date: '2026-07-01' }] }, ALL)
    expect(r).toBe(500)
  })

  it('EXCLUDES trade credit — it draws down credit, it is not cash', () => {
    const r = cashRevenue({
      payments: [
        { amount: 500, date: '2026-07-01' },
        { amount: 300, date: '2026-07-02', method: 'Trade Credit' },
      ],
    }, ALL)
    expect(r).toBe(500)
  })

  it('excludes refunded and voided payments', () => {
    const r = cashRevenue({
      payments: [
        { amount: 500, date: '2026-07-01' },
        { amount: 900, date: '2026-07-01', status: 'Refunded' },
        { amount: 700, date: '2026-07-01', status: 'Voided' },
      ],
    }, ALL)
    expect(r).toBe(500)
  })

  it('counts a utility incentive only once it is PAID', () => {
    const unpaid = cashRevenue({ utilityInvoices: [{ amount: 9000, payment_status: 'Sent', created_at: '2026-07-01' }] }, ALL)
    const paid = cashRevenue({ utilityInvoices: [{ amount: 9000, payment_status: 'Paid', updated_at: '2026-07-01' }] }, ALL)
    expect(unpaid).toBe(0)
    expect(paid).toBe(9000)
  })

  it('respects the date window', () => {
    expect(cashRevenue({ payments: [{ amount: 500, date: '2026-07-01' }] }, NONE)).toBe(0)
  })

  it('returns 0 for empty input rather than NaN', () => {
    expect(cashRevenue({}, ALL)).toBe(0)
  })
})

describe('accrualRevenue', () => {
  it('uses the invoice NET, not the gross', () => {
    const r = accrualRevenue({ invoices: [{ amount: 1000, discount_applied: 400, invoice_date: '2026-07-01' }] }, ALL)
    expect(r).toBe(600)
  })

  it('contributes $0 from a fully-covered invoice', () => {
    const r = accrualRevenue({ invoices: [{ amount: 5000, discount_applied: 5000, invoice_date: '2026-07-01' }] }, ALL)
    expect(r).toBe(0)
  })
})

describe('computeRevenue routes by basis', () => {
  const data = {
    payments: [{ amount: 100, date: '2026-07-01' }],
    invoices: [{ amount: 900, invoice_date: '2026-07-01' }],
  }
  it('cash basis reads payments; accrual reads invoices', () => {
    expect(computeRevenue(BASIS_CASH, data, ALL)).toBe(100)
    expect(computeRevenue(BASIS_ACCRUAL, data, ALL)).toBe(900)
  })

  it('defaults to cash for an unknown basis', () => {
    expect(computeRevenue('nonsense', data, ALL)).toBe(100)
  })
})

describe('cashExpenses — never double-count a reconciled purchase', () => {
  it('counts a bank outflow once', () => {
    const e = cashExpenses({ plaidTransactions: [{ amount: 250, date: '2026-07-01' }] }, ALL)
    expect(e).toBe(250)
  })

  it('does NOT add a manual expense that is already linked to a bank row', () => {
    // The second incident in the source comment.
    const e = cashExpenses({
      plaidTransactions: [{ amount: 250, date: '2026-07-01' }],
      expenses: [{ amount: 250, date: '2026-07-01', plaid_transaction_id: 'tx_1' }],
    }, ALL)
    expect(e).toBe(250)
  })

  it('DOES add an unreconciled manual expense', () => {
    const e = cashExpenses({
      plaidTransactions: [{ amount: 250, date: '2026-07-01' }],
      expenses: [{ amount: 60, date: '2026-07-01' }],
    }, ALL)
    expect(e).toBe(310)
  })

  it('ignores transfers between own accounts', () => {
    const e = cashExpenses({
      plaidTransactions: [
        { amount: 250, date: '2026-07-01' },
        { amount: 5000, date: '2026-07-01', is_transfer: true },
      ],
    }, ALL)
    expect(e).toBe(250)
  })

  it('ignores money coming IN (negative amounts are not expenses)', () => {
    const e = cashExpenses({ plaidTransactions: [{ amount: -800, date: '2026-07-01' }] }, ALL)
    expect(e).toBe(0)
  })
})
