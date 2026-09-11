import { describe, it, expect } from 'vitest'
import {lineAmount, lineInScope, invoiceDiscountBreakout, buildInvoiceSections, incentiveLineLabel, buildInvoicePages, whoPaysWhat, invoiceUtilityName } from './invoiceSections'

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

// ─────────────────────────────────────────────────────────────────────────
// Two-page composition. Alayda sends page one to the utility on its own, so
// the project has to stand alone — but the two pages must still add back to
// exactly the same grand total the single page produced. This suite exists
// because this invoice has been broken more than once by presentation work.
// ─────────────────────────────────────────────────────────────────────────
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

describe('buildInvoicePages', () => {
  const lines = (inScope, outScope) => [
    ...inScope.map((amt, i) => ({ id: 100 + i, line_total: amt, in_utility_scope: true })),
    ...outScope.map((amt, i) => ({ id: 200 + i, line_total: amt, in_utility_scope: false })),
  ]
  const pagesFor = (invoice, rows, opts) =>
    buildInvoicePages(buildInvoiceSections(invoice, rows, opts))

  // THE invariant. If this ever fails, the customer is billed a different
  // number than before, which is the failure mode we are guarding against.
  const composesBack = (invoice, rows, opts) => {
    const s = buildInvoiceSections(invoice, rows, opts)
    const p = buildInvoicePages(s)
    expect(p.reconciles).toBe(true)
    expect(
      round2(p.pageOne.total + p.pageTwo.addOnsSubtotal - p.pageTwo.downPayment - p.pageTwo.depositCredit),
    ).toBeCloseTo(s.customerTotal, 2)
    return p
  }

  it('page one plus page two equals the single-page grand total', () => {
    composesBack({ amount: 10000, discount_applied: 3000 }, lines([8000], [2000]))
  })

  it('holds when there is an incentive, a down payment and a discount at once', () => {
    composesBack(
      { amount: 29963, discount_applied: 12000, project_discount: 500, down_payment_applied: 1500 },
      lines([20000, 8000], [1963]),
    )
  })

  it('holds with no add-ons at all', () => {
    const p = composesBack({ amount: 5000, discount_applied: 1000 }, lines([5000], []))
    expect(p.twoPage).toBe(false)
  })

  it('holds when the incentive exceeds the add-ons', () => {
    composesBack({ amount: 50000, discount_applied: 40000 }, lines([49000], [1000]))
  })

  it('holds when the billed amount sits below the sum of the lines', () => {
    // The delicate shape from invoices 32598/32612/32423 — a negotiated cut
    // living in the gap between `amount` and the itemized lines.
    composesBack({ amount: 9000, discount_applied: 2000 }, lines([9500, 500], [1000]))
  })

  it('holds with a deposit credit from a parent invoice', () => {
    composesBack(
      { amount: 12000, discount_applied: 4000 },
      lines([10000], [2000]),
      { parentInvoice: { amount: 1000, payment_status: 'Paid' } },
    )
  })

  it('page one carries the project only — no deposit, no payments', () => {
    const p = pagesFor(
      { amount: 12000, discount_applied: 3000, down_payment_applied: 1000 },
      lines([10000], [2000]),
    )
    expect(p.pageOne).not.toHaveProperty('downPayment')
    expect(p.pageOne).not.toHaveProperty('depositCredit')
    expect(p.pageOne.total).toBeCloseTo(
      round2(p.pageOne.subtotal - p.pageOne.incentive - p.pageOne.projectDiscount), 2,
    )
  })

  it('page two opens with page one total and adds the add-ons to it', () => {
    const p = pagesFor({ amount: 10000, discount_applied: 2000 }, lines([8000], [2000]))
    expect(p.pageTwo.broughtForward).toBeCloseTo(p.pageOne.total, 2)
    expect(p.pageTwo.subtotal).toBeCloseTo(round2(p.pageOne.total + p.pageTwo.addOnsSubtotal), 2)
  })

  it('puts every in-scope line on page one and every add-on on page two', () => {
    const p = pagesFor({ amount: 10000, discount_applied: 0 }, lines([5000, 3000], [2000]))
    expect(p.pageOne.lines).toHaveLength(2)
    expect(p.pageTwo.lines).toHaveLength(1)
    expect(p.pageOne.lines.every(l => l.in_utility_scope)).toBe(true)
  })

  it('does not paginate a legacy-net invoice', () => {
    // Legacy shapes keep their flat display; their math is not to be touched.
    // legacy-net = discount strictly greater than gross (arHelpers.isLegacyNetShape)
    const p = pagesFor({ amount: 5000, discount_applied: 6000 }, lines([5000], [1000]))
    expect(p.twoPage).toBe(false)
  })

  it('survives an empty invoice without throwing', () => {
    const p = buildInvoicePages(buildInvoiceSections({ amount: 0 }, []))
    expect(p.twoPage).toBe(false)
    expect(p.pageTwo.grandTotal).toBe(0)
  })
})

describe('whoPaysWhat — page one names both parties', () => {
  const pageOne = { subtotal: 20000, incentive: 14560, projectDiscount: 0, total: 5440 }

  it('names the utility and the customer with the figures printed above them', () => {
    const w = whoPaysWhat({ utilityName: 'Rocky Mountain Power', pageOne, twoPage: true })
    expect(w.utility.name).toBe('Rocky Mountain Power')
    expect(w.utility.amount).toBe(14560)
    expect(w.customer.amount).toBe(5440)
    expect(w.customer.note).toMatch(/page 2/)
  })

  it('says "your portion" when the invoice is one page', () => {
    const w = whoPaysWhat({ utilityName: 'Rocky Mountain Power', pageOne, twoPage: false })
    expect(w.customer.note).not.toMatch(/page 2/)
  })

  // Every non-rebate invoice must print exactly as it does today.
  it('returns null when there is no incentive to split', () => {
    expect(whoPaysWhat({ utilityName: 'X', pageOne: { ...pageOne, incentive: 0 }, twoPage: true })).toBeNull()
    expect(whoPaysWhat({ utilityName: 'X', pageOne: {}, twoPage: false })).toBeNull()
    expect(whoPaysWhat({})).toBeNull()
  })

  it('falls back to "Utility" rather than printing a blank name', () => {
    expect(whoPaysWhat({ utilityName: '  ', pageOne, twoPage: true }).utility.name).toBe('Utility')
  })

  it('uses the page figure, never a recomputation', () => {
    // If the page says the incentive is 14560, the block says 14560 — even if
    // some other record disagrees. Agreement with the lines above is the point.
    const w = whoPaysWhat({ utilityName: 'RMP', pageOne: { ...pageOne, incentive: 14560.004 }, twoPage: true })
    expect(w.utility.amount).toBe(14560)
  })
})

describe('invoiceUtilityName — the invoice is the record', () => {
  const providers = [{ id: 116, provider_name: 'Rocky Mountain Power' }, { id: 7, provider_name: 'SRP' }]

  it('resolves the invoice\'s own provider link first', () => {
    expect(invoiceUtilityName({ utility_provider_id: 116 }, providers, { utility_name: 'Something Else' })).toBe('Rocky Mountain Power')
  })

  it('falls back to the linked utility row when the invoice has no link', () => {
    expect(invoiceUtilityName({ utility_provider_id: null }, providers, { utility_name: 'SRP' })).toBe('SRP')
  })

  it('tolerates a string id from the store', () => {
    expect(invoiceUtilityName({ utility_provider_id: '116' }, providers, null)).toBe('Rocky Mountain Power')
  })

  it('returns null when nothing names the utility', () => {
    expect(invoiceUtilityName({}, [], null)).toBeNull()
    expect(invoiceUtilityName({ utility_provider_id: 999 }, providers, null)).toBeNull()
  })
})

describe('utility shortfall — the gap is named, never mislabelled as a discount', () => {
  // The demo invoice after a $500 short-pay: $22,800 in-scope, $2,000 add-ons,
  // claimed $8,000, the utility paid $7,500.
  const lines = [
    { line_total: 15000, in_utility_scope: true },
    { line_total: 7800, in_utility_scope: true },
    { line_total: 2000, in_utility_scope: false },
  ]
  const received = 7500

  it('company absorbs it: the gap prints under its own name, not as a project discount', () => {
    const inv = { amount: 24800, discount_applied: 8000, shortfall_borne_by: 'company', utility_shortfall: 500 }
    const s = buildInvoiceSections(inv, lines, { utilityIncentive: received })
    expect(s.incentive).toBe(7500)
    expect(s.utilityShortfall).toBe(500)
    expect(s.projectDiscount).toBe(0)
    expect(s.customerTotal).toBe(16800)
    expect(s.reconciles).toBe(true)
    const p = buildInvoicePages(s)
    expect(p.pageOne.utilityShortfall).toBe(500)
    expect(p.pageOne.total).toBe(14800)
    expect(p.reconciles).toBe(true)
  })

  it('customer covers it: their credit already dropped, so there is no gap and no line', () => {
    const inv = { amount: 24800, discount_applied: 7500, shortfall_borne_by: 'customer', utility_shortfall: 500 }
    const s = buildInvoiceSections(inv, lines, { utilityIncentive: received })
    expect(s.incentive).toBe(7500)
    expect(s.utilityShortfall).toBe(0)
    expect(s.projectDiscount).toBe(0)
    expect(s.customerTotal).toBe(17300)
    expect(buildInvoicePages(s).pageOne.total).toBe(15300)
  })

  it('with no decision recorded the old behaviour stands — the gap is a project discount', () => {
    const inv = { amount: 24800, discount_applied: 8000 }
    const s = buildInvoiceSections(inv, lines, { utilityIncentive: received })
    expect(s.utilityShortfall).toBe(0)
    expect(s.projectDiscount).toBe(500)
  })

  it('a real project discount and an absorbed shortfall are shown separately', () => {
    // $300 genuine discount on top of the $500 the company absorbed.
    const inv = { amount: 24800, discount_applied: 8300, project_discount: 300, shortfall_borne_by: 'company', utility_shortfall: 500 }
    const s = buildInvoiceSections(inv, lines, { utilityIncentive: received })
    expect(s.incentive).toBe(7500)
    expect(s.utilityShortfall).toBe(500)
    expect(s.projectDiscount).toBe(300)
    expect(s.reconciles).toBe(true)
  })

  it('is capped by what is actually left — it can never invent a deduction', () => {
    // Claims a $900 shortfall but the credit only leaves $500 unexplained.
    const inv = { amount: 24800, discount_applied: 8000, shortfall_borne_by: 'company', utility_shortfall: 900 }
    const s = buildInvoiceSections(inv, lines, { utilityIncentive: received })
    expect(s.utilityShortfall).toBe(500)
    expect(s.projectDiscount).toBe(0)
    expect(s.reconciles).toBe(true)
  })

  it('the customer total is untouched by any of this', () => {
    for (const inv of [
      { amount: 24800, discount_applied: 8000, shortfall_borne_by: 'company', utility_shortfall: 500 },
      { amount: 24800, discount_applied: 8000 },
    ]) {
      expect(buildInvoiceSections(inv, lines, { utilityIncentive: received }).customerTotal).toBe(16800)
    }
  })
})
