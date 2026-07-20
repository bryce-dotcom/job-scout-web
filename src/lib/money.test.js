// Regression tests for the invoice money model.
//
// These are not here for coverage. Each case is a bug that reached a customer.
// The rules they pin down had drifted into fifteen open-coded copies across the
// app, and the only reason anyone noticed was Alayda opening a PDF. A test
// suite that runs in a second is a cheaper detector than a person.
//
// Run: npm test

import { describe, it, expect } from 'vitest'
import { isLegacyNetShape, invoiceCustomerTotal, invoiceBalance, invoicePaymentStatus } from './arHelpers'
import { buildInvoiceSections, invoiceDiscountBreakout } from './invoiceSections'
import { invoiceNet } from './revenueBasis'

// Real shapes pulled from production, kept as fixtures so the numbers mean
// something to whoever reads a failure.
const SMC_AUTO = {              // job 23375 — utility covers 30k, rep discounts 2143.06
  amount: 32143.06,
  discount_applied: 32143.06,   // 30000 incentive + 2143.06 project discount
  project_discount: 2143.06,
}
const SMC_AUTO_LINES = [
  { line_total: 897.50 }, { line_total: 18791.00 }, { line_total: 2419.56 },
  { line_total: 4755.00 }, { line_total: 5280.00 },  // = 32143.06
]
const AZ_UPARK = { amount: 14162.93, discount_applied: 14162.93, project_discount: null } // utility covers 100%
const LEGACY = { amount: 6159.60, discount_applied: 14478.80 }   // inv 7/8 — amount is already NET
const ORDINARY = { amount: 1000, discount_applied: 250 }

describe('isLegacyNetShape', () => {
  it('is true only when the discount EXCEEDS the amount (a real legacy row)', () => {
    expect(isLegacyNetShape(6159.60, 14478.80)).toBe(true)
  })

  // The bug. discount === amount means "fully covered", NOT "legacy".
  it('is FALSE when the discount exactly equals the amount (fully covered, owes $0)', () => {
    expect(isLegacyNetShape(32143.06, 32143.06)).toBe(false)
    expect(isLegacyNetShape(14162.93, 14162.93)).toBe(false)
  })

  it('is false for ordinary partly-discounted invoices', () => {
    expect(isLegacyNetShape(1000, 250)).toBe(false)
  })

  it('is false when there is no discount at all', () => {
    expect(isLegacyNetShape(1000, 0)).toBe(false)
    expect(isLegacyNetShape(0, 0)).toBe(false)
  })
})

describe('invoiceCustomerTotal', () => {
  it('a fully-covered project bills $0, not its gross', () => {
    // Shipped as $32,143.06 due. The customer owed nothing.
    expect(invoiceCustomerTotal(SMC_AUTO)).toBe(0)
    expect(invoiceCustomerTotal(AZ_UPARK)).toBe(0)
  })

  it('a legacy-net invoice bills its amount (never double-subtract)', () => {
    expect(invoiceCustomerTotal(LEGACY)).toBe(6159.60)
  })

  it('an ordinary invoice bills gross minus the deduction', () => {
    expect(invoiceCustomerTotal(ORDINARY)).toBe(750)
  })

  it('never goes negative', () => {
    expect(invoiceCustomerTotal({ amount: 100, discount_applied: 100 })).toBe(0)
  })
})

describe('invoiceBalance', () => {
  it('a fully-covered invoice has no balance even with no payments', () => {
    expect(invoiceBalance(SMC_AUTO, [])).toBe(0)
  })
  it('subtracts payments applied to THIS invoice', () => {
    const inv = { id: 9, amount: 1000, discount_applied: 250 } // customer owes 750
    expect(invoiceBalance(inv, [{ invoice_id: 9, amount: 300 }])).toBe(450)
  })

  it('ignores payments applied to a different invoice', () => {
    const inv = { id: 9, amount: 1000, discount_applied: 250 }
    expect(invoiceBalance(inv, [{ invoice_id: 10, amount: 300 }])).toBe(750)
  })

  it('never returns a negative balance on an overpayment', () => {
    const inv = { id: 9, amount: 1000, discount_applied: 250 }
    expect(invoiceBalance(inv, [{ invoice_id: 9, amount: 900 }])).toBe(0)
  })
})

describe('invoicePaymentStatus', () => {
  // Biorge inv 32597 — the ticket. $7,113.77 gross, $5,335.33 incentive, so the
  // customer owes $1,778.44, which they paid in full. Must read "Paid", not
  // "Partially Paid" (which kept Damien's commission off payroll).
  const BIORGE = { amount: 7113.77, discount_applied: 5335.33 } // customer owes 1778.44
  it('marks an Energy Scout invoice Paid once the NET portion is covered', () => {
    expect(invoicePaymentStatus(BIORGE, 1778.44)).toBe('Paid')
  })
  it('does not require the gross amount to be paid', () => {
    expect(invoicePaymentStatus(BIORGE, 7113.77)).toBe('Paid') // overpay still Paid
  })
  it('is Partially Paid when less than the net portion is in', () => {
    expect(invoicePaymentStatus(BIORGE, 1000)).toBe('Partially Paid')
  })
  it('is Pending with nothing paid', () => {
    expect(invoicePaymentStatus(BIORGE, 0)).toBe('Pending')
  })
  it('an ordinary (no-discount) HHH invoice still needs its full amount', () => {
    const HHH = { amount: 1000, discount_applied: 0 }
    expect(invoicePaymentStatus(HHH, 999)).toBe('Partially Paid')
    expect(invoicePaymentStatus(HHH, 1000)).toBe('Paid')
  })
  it('adds a CC fee on top of the net total', () => {
    // owes 750 + 25 fee = 775
    expect(invoicePaymentStatus({ amount: 1000, discount_applied: 250 }, 750, 25)).toBe('Partially Paid')
    expect(invoicePaymentStatus({ amount: 1000, discount_applied: 250 }, 775, 25)).toBe('Paid')
  })
  it('nothing owed + nothing collected stays Pending (do not auto-Paid $0/fully-covered)', () => {
    // Guards two things: 850+ empty $0 shell invoices, and the bonusCalc
    // "Paid + no payments" fallback that would pay commission on the gross.
    expect(invoicePaymentStatus(SMC_AUTO, 0)).toBe('Pending')          // fully incentive-covered, uncollected
    expect(invoicePaymentStatus({ amount: 0, discount_applied: 0 }, 0)).toBe('Pending') // empty shell
  })
  it('nothing owed but money did come in reads Paid', () => {
    expect(invoicePaymentStatus(SMC_AUTO, 50)).toBe('Paid')
  })
})

describe('invoiceNet (revenue basis) agrees with invoiceCustomerTotal', () => {
  // These are separate functions on separate surfaces. They must not diverge —
  // revenueBasis had its own `>=` copy that counted a fully-covered invoice's
  // whole gross as accrual revenue.
  for (const [name, inv] of Object.entries({ SMC_AUTO, AZ_UPARK, LEGACY, ORDINARY })) {
    it(name, () => {
      expect(invoiceNet(inv)).toBe(invoiceCustomerTotal(inv))
    })
  }
})

describe('invoiceDiscountBreakout', () => {
  it('splits the rep discount out of the incentive when project_discount is set', () => {
    const b = invoiceDiscountBreakout(SMC_AUTO)
    expect(b.projectDiscountField).toBe(2143.06)
    expect(b.incentive).toBe(30000)
    expect(b.isLegacyNet).toBe(false)
  })

  it('attributes everything to the incentive when project_discount is null', () => {
    // This is WHY the creation path must write project_discount: without it the
    // PDF folds the rep's discount into the "Utility Incentive" line.
    const b = invoiceDiscountBreakout({ ...SMC_AUTO, project_discount: null })
    expect(b.projectDiscountField).toBe(0)
    expect(b.incentive).toBe(32143.06)
  })
})

describe('buildInvoiceSections — the customer-facing breakdown', () => {
  const sections = buildInvoiceSections(SMC_AUTO, SMC_AUTO_LINES, { utilityIncentive: 30000 })

  it('renders both deductions as separate lines and lands on $0 due', () => {
    expect(sections.inScopeSubtotal).toBe(32143.06)
    expect(sections.projectDiscount).toBe(2143.06)
    expect(sections.incentive).toBe(30000)
    expect(sections.customerTotal).toBe(0)
  })

  it('reconciles by construction', () => {
    expect(sections.reconciles).toBe(true)
  })

  it('stays applicable for a fully-covered invoice (does not fall back to the flat layout)', () => {
    // `applicable === false` is what made the PDF print the whole project.
    expect(sections.applicable).toBe(true)
  })

  it('subtotal minus both deductions equals the net project', () => {
    expect(sections.inScopeSubtotal - sections.projectDiscount - sections.incentive)
      .toBeCloseTo(sections.netInScope, 2)
  })

  it('legacy invoices keep the flat layout untouched', () => {
    const s = buildInvoiceSections(LEGACY, [{ line_total: 14478.80 }], {})
    expect(s.applicable).toBe(false)
    expect(s.customerTotal).toBe(6159.60)
  })
})
