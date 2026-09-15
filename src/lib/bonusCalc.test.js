import { describe, it, expect } from 'vitest'
import { bonusRowAmount, calculateInvoiceCommissions } from './bonusCalc'


describe('bonusRowAmount — the row shape that crashed FieldScout', () => {
  // Caught in production by the crash log, with breadcrumbs giving the exact
  // repro: click Clock Out -> tap "Bonus Earned This Pay Period" ->
  // "undefined is not an object (evaluating 'ut.bonusAmount.toFixed')".
  // A BLOCKED bonus carries wouldHaveEarned and no bonusAmount at all.
  it('reads a held row from wouldHaveEarned instead of throwing', () => {
    const held = { wouldHaveEarned: 42.5, jobTitle: 'Juan Diego' }
    expect(() => bonusRowAmount(held).amount.toFixed(2)).not.toThrow()
    expect(bonusRowAmount(held)).toEqual({ amount: 42.5, held: true })
  })

  it('shows a held bonus at its REAL value, never zero', () => {
    // Verification is a flag, not a wipe. Showing $0.00 tells a tech the
    // money was taken away when it is only waiting on a photo.
    expect(bonusRowAmount({ wouldHaveEarned: 120 }).amount).toBe(120)
  })

  it('adds the coverage penalty back on a released row', () => {
    expect(bonusRowAmount({ bonusAmount: 30, coveragePenalty: 10 }))
      .toEqual({ amount: 40, held: false })
  })

  it('treats a weighted-out row as held even though it has an amount', () => {
    expect(bonusRowAmount({ bonusAmount: 0, weightedOut: true, wouldHaveEarned: 55 }))
      .toEqual({ amount: 55, held: true })
  })

  it('survives the shapes that would crash a renderer', () => {
    for (const junk of [null, undefined, {}]) {
      const r = bonusRowAmount(junk)
      expect(typeof r.amount).toBe('number')
      expect(() => r.amount.toFixed(2)).not.toThrow()
    }
  })
})

// ── invoice commission measures the customer's share ─────────────────────
// SMC Auto (Tracy, 470cccc5): $32,143.06 project, $30,000 SRP incentive plus a
// $2,143.06 rep discount — the customer owed $0. The gross reported $2,732.16
// of PENDING commission on it (8.5%), and would have paid that on the gross
// the day it read Paid with no payment rows. The utility's $30,000 earns
// through the utility block; the customer's share is what this block measures.
describe('calculateInvoiceCommissions — the customer share, not the gross', () => {
  const rep = { id: 72, is_commission: true, commission_services_rate: 8.5, commission_services_type: 'percent' }
  const job = { id: 23375, salesperson_id: 72, job_title: 'AZ-SMC Auto Repair' }
  const period = { periodStartStr: '2026-09-08', periodEndStr: '2026-09-21', payrollConfig: { commission_trigger: 'payment_received' } }

  it('a fully-covered invoice carries no pending commission and none when it reads Paid without payment rows', () => {
    const smcPending = { id: 32661, invoice_id: 'INV-MRMH8SRI', job_id: 23375, amount: 32143.06, discount_applied: 32143.06, payment_status: 'Pending', created_at: '2026-07-15T00:00:00Z' }
    const r1 = calculateInvoiceCommissions({ employee: rep, jobs: [job], invoices: [smcPending], inPeriodPayments: [], allPaymentsByInvoiceId: new Map(), ...period })
    expect(r1.pending).toBe(0)
    expect(r1.available).toBe(0)
    const smcPaid = { ...smcPending, payment_status: 'Paid', updated_at: '2026-09-14T17:44:09Z' }
    const r2 = calculateInvoiceCommissions({ employee: rep, jobs: [job], invoices: [smcPaid], inPeriodPayments: [], allPaymentsByInvoiceId: new Map(), ...period })
    expect(r2.available).toBe(0)
    expect(r2.pending).toBe(0)
  })

  it('an invoice the customer owes on measures exactly their share', () => {
    // $7,113.77 gross, $5,335.33 incentive → the customer owes $1,778.44.
    const biorge = { id: 32597, invoice_id: 'INV-B', job_id: 23375, amount: 7113.77, discount_applied: 5335.33, payment_status: 'Pending', created_at: '2026-07-15T00:00:00Z' }
    const r = calculateInvoiceCommissions({ employee: rep, jobs: [job], invoices: [biorge], inPeriodPayments: [], allPaymentsByInvoiceId: new Map(), ...period })
    expect(r.pending).toBeCloseTo(1778.44 * 0.085, 2)
    // ...and once it reads Paid with no payment rows, the fallback pays on that share, dated by the invoice.
    const paid = { ...biorge, payment_status: 'Paid', updated_at: '2026-09-14T17:44:09Z' }
    const r2 = calculateInvoiceCommissions({ employee: rep, jobs: [job], invoices: [paid], inPeriodPayments: [], allPaymentsByInvoiceId: new Map(), ...period })
    expect(r2.available).toBeCloseTo(1778.44 * 0.085, 2)
    expect(r2.pending).toBe(0)
  })

  it('an ordinary invoice with no incentive is unchanged — the gross is the customer share', () => {
    const plain = { id: 1, invoice_id: 'INV-P', job_id: 23375, amount: 1000, discount_applied: 0, payment_status: 'Pending', created_at: '2026-07-15T00:00:00Z' }
    const r = calculateInvoiceCommissions({ employee: rep, jobs: [job], invoices: [plain], inPeriodPayments: [], allPaymentsByInvoiceId: new Map(), ...period })
    expect(r.pending).toBeCloseTo(85, 2)
  })
})
