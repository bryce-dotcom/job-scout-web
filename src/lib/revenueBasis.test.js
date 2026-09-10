import { describe, it, expect } from 'vitest'
import {
  BASIS_CASH, BASIS_ACCRUAL, invoiceNet, cashRevenue, accrualRevenue, computeRevenue, cashExpenses,
  incentiveReceivedAt, collectedIncentives,
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

describe('incentive revenue is dated by when the money ARRIVED', () => {
  const inMonth = (ym) => (d) => !!d && String(d).slice(0, 7) === ym

  // The incident this pins: a data fix on 2026-09-10 named the utility on
  // every row, which stamped updated_at = today on all of them, and every
  // incentive collected since March — $432,847.96 — landed in September's
  // revenue. The receipt date is a fact about the money, not about the last
  // person to touch the record.
  it('an incentive paid in June stays in June after the row is edited in September', () => {
    const row = { amount: 162789.14, payment_status: 'Paid', paid_at: '2026-06-18T00:00:00Z', updated_at: '2026-09-10T20:01:00Z', created_at: '2026-05-01' }
    expect(collectedIncentives([row], inMonth('2026-06'))).toBeCloseTo(162789.14, 2)
    expect(collectedIncentives([row], inMonth('2026-09'))).toBe(0)
    expect(cashRevenue({ utilityInvoices: [row] }, inMonth('2026-09'))).toBe(0)
  })

  it('falls back to updated_at only for a row marked Paid before paid_at existed', () => {
    expect(incentiveReceivedAt({ paid_at: null, updated_at: '2026-04-02', created_at: '2026-03-01' })).toBe('2026-04-02')
    expect(incentiveReceivedAt({ updated_at: null, created_at: '2026-03-01' })).toBe('2026-03-01')
    expect(incentiveReceivedAt({})).toBeNull()
  })

  it('never counts an unpaid incentive, whatever its dates say', () => {
    expect(collectedIncentives([{ amount: 9000, payment_status: 'Pending', paid_at: '2026-06-01' }], ALL)).toBe(0)
  })

  it('the dashboard tile and cash revenue read the same rule', () => {
    const rows = [
      { amount: 1000, payment_status: 'Paid', paid_at: '2026-07-03' },
      { amount: 2000, payment_status: 'Paid', paid_at: '2026-08-03' },
      { amount: 4000, payment_status: 'Open', paid_at: null },
    ]
    expect(collectedIncentives(rows, inMonth('2026-07'))).toBe(1000)
    expect(cashRevenue({ utilityInvoices: rows }, inMonth('2026-07'))).toBe(1000)
  })

  // The rule is only as good as the query behind it. If the store ever stops
  // selecting paid_at, every row reads undefined, the fallback to updated_at
  // kicks in, and the September incident quietly returns while this file
  // stays green. A column omitted from .select() reading as undefined has
  // bitten this codebase repeatedly.
  it('the store query that feeds the dashboard still selects paid_at', async () => {
    const { QUERIES } = await import('./schema.js')
    const q = String(QUERIES.utilityInvoices)
    expect(q === '*' || /\bpaid_at\b/.test(q)).toBe(true)
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
