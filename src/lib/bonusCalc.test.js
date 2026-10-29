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

// ── a voided claim is not pay ────────────────────────────────────────────────
// Intercon paid HHH once for the Fairfield project, but the office had recorded
// the same incentive twice as phases (utility invoices 143 and 149) and a third
// time as a consolidated final (145). Voiding a duplicate has to take its
// commission with it: a voided row is not Paid, so it fell through to the
// pending bucket and carried $9,334.87 of commission nobody would ever be paid.
describe('calculateInvoiceCommissions — a voided utility claim earns nothing', () => {
  const rep = { id: 17, is_commission: true, commission_services_rate: 5, commission_services_type: 'percent' }
  const job = { id: 23593, salesperson_id: 17, job_title: 'Intercon Phase 1' }
  const period = { periodStartStr: '2026-10-16', periodEndStr: '2026-10-31', payrollConfig: { commission_trigger: 'payment_received' } }
  const base = { employee: rep, jobs: [job], invoices: [], inPeriodPayments: [], allPaymentsByInvoiceId: new Map(), ...period }
  const claim = { id: 143, job_id: 23593, utility_name: 'Intercon', incentive_amount: 51176.73 }

  it('an open claim is pending commission; the same claim voided is nothing at all', () => {
    const open = calculateInvoiceCommissions({ ...base, utilityInvoices: [{ ...claim, payment_status: 'Pending' }] })
    expect(open.pending).toBeCloseTo(51176.73 * 0.05, 2)

    for (const dead of ['Void', 'Cancelled']) {
      const r = calculateInvoiceCommissions({ ...base, utilityInvoices: [{ ...claim, payment_status: dead }] })
      expect(r.pending, `${dead} still earned`).toBe(0)
      expect(r.available, `${dead} still earned`).toBe(0)
      expect(r.details).toEqual([])
    }
  })

  it('a claim the utility really paid in the period still earns — the rule only drops voids', () => {
    const paid = calculateInvoiceCommissions({ ...base, utilityInvoices: [{ ...claim, payment_status: 'Paid', paid_at: '2026-10-26T00:00:00Z' }] })
    expect(paid.available).toBeCloseTo(51176.73 * 0.05, 2)
    expect(paid.pending).toBe(0)
  })

  it('the processor earns nothing on a voided claim either', () => {
    const processor = { id: 15, is_commission: true, commission_processor_rate: 1, commission_processor_type: 'percent' }
    const pBase = { ...base, employee: processor, jobs: [] }
    const open = calculateInvoiceCommissions({ ...pBase, utilityInvoices: [{ ...claim, payment_status: 'Pending', processor_id: 15 }] })
    expect(open.pending).toBeCloseTo(511.77, 2)
    const voided = calculateInvoiceCommissions({ ...pBase, utilityInvoices: [{ ...claim, payment_status: 'Void', processor_id: 15 }] })
    expect(voided.pending).toBe(0)
    expect(voided.details).toEqual([])
  })
})
