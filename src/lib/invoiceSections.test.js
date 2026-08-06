import { describe, it, expect } from 'vitest'
import {
  lineAmount, lineInScope, invoiceDiscountBreakout, buildInvoiceSections, incentiveLineLabel,
} from './invoiceSections'

// ─────────────────────────────────────────────────────────────────────────
// CHARACTERIZATION TESTS — the two-section Energy Scout invoice.
//
// This feature has been reported broken more than once (Alayda 07-14 and
// again 07-27, Tracy 07-27) and has been edited by three separate commits
// since it was written, with NO test guarding it. That is the whole reason
// it keeps regressing: nothing describes what "working" means, so any change
// elsewhere can silently break it and nobody finds out until a customer sees
// a wrong invoice.
//
// These lock the behaviour that matters to the business:
//   1. an invoice's sections must always RECONCILE to what the customer owes
//   2. a line flagged out-of-scope must never be counted as in-scope
//   3. the layout must not claim to apply when there's nothing to split
// If a future change breaks one of these, a test fails instead of a client.
// ─────────────────────────────────────────────────────────────────────────

const line = (over = {}) => ({ description: 'Fixture', quantity: 1, price: 100, line_total: 100, ...over })

describe('lineAmount', () => {
  it('prefers the stored line total', () => {
    expect(lineAmount({ line_total: 250, quantity: 2, price: 100 })).toBe(250)
    expect(lineAmount({ total: 175 })).toBe(175)
  })

  it('falls back to qty x price when there is no stored total', () => {
    expect(lineAmount({ quantity: 3, price: 50 })).toBe(150)
    expect(lineAmount({ quantity: 2, unit_price: 25 })).toBe(50)
  })

  it('never returns NaN for junk', () => {
    expect(lineAmount({})).toBe(0)
    expect(lineAmount(null)).toBe(0)
  })
})

describe('lineInScope — an out-of-scope line must NEVER be billed as in-scope', () => {
  it('respects the frozen flag on the line', () => {
    expect(lineInScope({ in_utility_scope: false })).toBe(false)
    expect(lineInScope({ in_utility_scope: true })).toBe(true)
  })

  it('falls back to the product catalog for older lines', () => {
    expect(lineInScope({ item: { in_utility_scope: false } })).toBe(false)
  })

  it('defaults to IN scope when nothing says otherwise', () => {
    // Safer default: an unflagged line belongs to the project, not the add-ons.
    expect(lineInScope({})).toBe(true)
    expect(lineInScope({ item: {} })).toBe(true)
  })

  it('lets the line flag win over a stale catalog flag', () => {
    expect(lineInScope({ in_utility_scope: true, item: { in_utility_scope: false } })).toBe(true)
  })
})

describe('buildInvoiceSections — the contract the invoice UI depends on', () => {
  it('splits lines into project vs add-ons', () => {
    const s = buildInvoiceSections(
      { amount: 1200 },
      [
        line({ description: 'LED retrofit', line_total: 1000 }),
        line({ description: 'Extra fixture', line_total: 200, in_utility_scope: false }),
      ],
    )
    expect(s.inScope).toHaveLength(1)
    expect(s.outScope).toHaveLength(1)
    expect(s.hasOutScope).toBe(true)
    expect(s.outScopeSubtotal).toBe(200)
  })

  it('reports hasOutScope=false when everything is project work', () => {
    // The UI only switches to the two-section layout when this is true, so a
    // regression here silently reverts the whole feature.
    const s = buildInvoiceSections({ amount: 1000 }, [line({ line_total: 1000 })])
    expect(s.hasOutScope).toBe(false)
    expect(s.outScope).toEqual([])
  })

  it('RECONCILES: in-scope net + add-ons - deposit equals what the customer owes', () => {
    const invoice = { amount: 5000, discount_applied: 2000 }
    const lines = [
      line({ description: 'Retrofit', line_total: 4500 }),
      line({ description: 'Permit fee', line_total: 500, in_utility_scope: false }),
    ]
    const s = buildInvoiceSections(invoice, lines)
    const shown = s.netInScope + s.outScopeSubtotal - (s.depositCredit || 0)
    expect(Math.abs(shown - s.customerTotal)).toBeLessThan(0.02)
  })

  it('never shows a negative deduction', () => {
    // The inverse case: billed gross exceeds the itemised lines. A negative
    // "discount" on a customer invoice reads as us adding a surcharge.
    const s = buildInvoiceSections({ amount: 900 }, [line({ line_total: 100 })])
    expect(s.projectDiscount).toBeGreaterThanOrEqual(0)
    expect(s.incentive).toBeGreaterThanOrEqual(0)
  })

  it('self-reports reconciliation, and it holds on a normal invoice', () => {
    // `reconciles` is the lib's own invariant — the sections must add up to
    // what the customer owes. If this ever goes false the invoice is lying.
    const s = buildInvoiceSections(
      { amount: 5000, discount_applied: 2000 },
      [
        line({ description: 'Retrofit', line_total: 4500 }),
        line({ description: 'Permit fee', line_total: 500, in_utility_scope: false }),
      ],
    )
    expect(s.reconciles).toBe(true)
  })

  it('survives an invoice with no lines at all', () => {
    // 57 of 60 sampled production invoices have zero invoice_lines — this must
    // degrade quietly, not throw and take the invoice page down.
    expect(() => buildInvoiceSections({ amount: 500 }, [])).not.toThrow()
    const s = buildInvoiceSections({ amount: 500 }, [])
    expect(s.hasOutScope).toBe(false)
    expect(s.inScope).toEqual([])
  })

  it('survives junk input instead of throwing', () => {
    expect(() => buildInvoiceSections(null, null)).not.toThrow()
    expect(() => buildInvoiceSections({}, undefined)).not.toThrow()
  })
})

describe('incentiveLineLabel', () => {
  it('names the utility when known and stays generic otherwise', () => {
    expect(incentiveLineLabel('Rocky Mountain Power')).toMatch(/Rocky Mountain Power/)
    expect(typeof incentiveLineLabel(null)).toBe('string')
    expect(incentiveLineLabel(null).length).toBeGreaterThan(0)
  })
})

describe('invoiceDiscountBreakout', () => {
  it('returns numeric components, never undefined', () => {
    const b = invoiceDiscountBreakout({ amount: 1000, discount_applied: 250 })
    expect(Number.isFinite(b.discountApplied)).toBe(true)
    expect(Number.isFinite(b.depositCredit)).toBe(true)
  })

  it('handles a missing invoice without throwing', () => {
    expect(() => invoiceDiscountBreakout(null)).not.toThrow()
  })

  it('separates a down payment from the utility incentive', () => {
    // JOB-MQZGV1FN printed "Utility Incentive -$15,602.85" when $13,652.85
    // was the incentive and $1,950 was a down payment. Everything not
    // otherwise attributed fell into the incentive, so the customer could not
    // follow the arithmetic.
    const b = invoiceDiscountBreakout({
      amount: 18203.80, discount_applied: 15602.85, down_payment_applied: 1950,
    })
    expect(b.downPayment).toBe(1950)
    expect(b.incentive).toBe(13652.85)
    expect(b.depositCredit + b.projectDiscountField + b.downPayment + b.incentive)
      .toBeCloseTo(b.discountApplied, 2)
  })

  it('never lets a down payment exceed what is left to attribute', () => {
    const b = invoiceDiscountBreakout({
      amount: 1000, discount_applied: 100, down_payment_applied: 5000,
    })
    expect(b.downPayment).toBe(100)
    expect(b.incentive).toBe(0)
  })

  it('leaves the incentive alone when there is no down payment', () => {
    const b = invoiceDiscountBreakout({ amount: 1000, discount_applied: 250 })
    expect(b.downPayment).toBe(0)
    expect(b.incentive).toBe(250)
  })
})

describe('the invoice adds up on the page', () => {
  it('shows incentive and down payment as separate deductions', () => {
    // Subtotal − incentive − down payment must equal the balance due, with
    // each deduction named, or the customer has to guess.
    const invoice = { amount: 18203.80, discount_applied: 15602.85, down_payment_applied: 1950 }
    const lines = [
      { line_total: 10723.60, in_utility_scope: true },
      { line_total: 3230.40, in_utility_scope: true },
      { line_total: 4249.80, in_utility_scope: true },
    ]
    const s = buildInvoiceSections(invoice, lines, { utilityIncentive: 13652.85 })
    expect(s.inScopeSubtotal).toBeCloseTo(18203.80, 2)
    expect(s.incentive).toBeCloseTo(13652.85, 2)
    expect(s.downPayment).toBeCloseTo(1950, 2)
    expect(s.projectDiscount).toBeCloseTo(0, 2)
    expect(s.netInScope).toBeCloseTo(2600.95, 2)
    expect(s.reconciles).toBe(true)
  })
})
