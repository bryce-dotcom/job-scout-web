import { describe, it, expect } from 'vitest'
import {
  reconcileInvoicePair, arReconciles, customerPortion, lineSum,
} from './invoiceReconcile'

// The real case: JOB-MQZGV1FN. Invoices created 1:26:42pm froze the incentive
// at $13,110; the job was edited to $12,849.75 at 1:47:41pm and nothing
// followed. The invoice's own lines summed to $20,155.60 while its amount said
// $17,810.36, so AR came to $17,810.36 on a $20,155.60 job.
const LINES = [
  { line_total: 11620 },
  { line_total: 4410 },
  { line_total: 4125.60 },
]
const INVOICE = { id: 32720, amount: 17810.36, discount_applied: 13110 }
const UTILITY = { id: 118, amount: 13110, incentive_amount: 13110, project_cost: 17810.36, net_cost: 4700.36 }

describe('the job that prompted this', () => {
  const res = reconcileInvoicePair({
    invoice: INVOICE, lines: LINES, utilityInvoice: UTILITY, incentive: 12849.75,
  })

  it('re-anchors the gross to the lines actually on the invoice', () => {
    expect(lineSum(LINES)).toBe(20155.60)
    expect(res.invoicePatch.amount).toBe(20155.60)
  })

  it('moves the incentive to what the user typed', () => {
    expect(res.utilityPatch.amount).toBe(12849.75)
    expect(res.utilityPatch.incentive_amount).toBe(12849.75)
  })

  it('leaves the customer owing the out-of-pocket figure the job shows', () => {
    expect(res.after.customer).toBe(7305.85)   // 20,155.60 − 12,849.75
  })

  it('makes AR equal the job total, which is the whole point', () => {
    expect(res.after.ar).toBe(20155.60)
    expect(res.before.ar).toBe(17810.36)       // what it was
  })
})

describe('deposit credits must survive', () => {
  // discount_applied is a TOTAL deduction. Overwriting it with the incentive
  // re-bills a deposit the customer already paid.
  it('adjusts by the delta, keeping the deposit credit intact', () => {
    const invoice = { amount: 50000, discount_applied: 30000 } // 20k incentive + 10k deposit
    const utility = { amount: 20000, incentive_amount: 20000, project_cost: 50000 }
    const res = reconcileInvoicePair({
      invoice, lines: [{ line_total: 50000 }], utilityInvoice: utility, incentive: 18000,
    })
    // Incentive fell 2,000 → deduction falls 2,000, deposit credit untouched.
    expect(res.invoicePatch.discount_applied).toBe(28000)
    expect(res.after.customer).toBe(22000)
  })

  it('never drives the deduction below zero', () => {
    const invoice = { amount: 1000, discount_applied: 100 }
    const utility = { amount: 500, incentive_amount: 500 }
    const res = reconcileInvoicePair({ invoice, lines: [{ line_total: 1000 }], utilityInvoice: utility, incentive: 0 })
    expect(res.invoicePatch.discount_applied).toBeNull()   // 100 − 500 floored at 0
    expect(res.after.customer).toBe(1000)
  })
})

describe('what it must not touch', () => {
  it('leaves an invoice with no lines alone rather than zeroing it', () => {
    // Deposit and manually-entered invoices legitimately have no lines.
    const invoice = { amount: 35000, discount_applied: 0 }
    const res = reconcileInvoicePair({
      invoice, lines: [], utilityInvoice: null, incentive: 0,
    })
    expect(res.invoicePatch).toBeNull()
    expect(res.changed).toBe(false)
  })

  it('reports no change when everything already reconciles', () => {
    const invoice = { amount: 20155.60, discount_applied: 12849.75 }
    const utility = { amount: 12849.75, incentive_amount: 12849.75, project_cost: 20155.60, net_cost: 7305.85 }
    const res = reconcileInvoicePair({ invoice, lines: LINES, utilityInvoice: utility, incentive: 12849.75 })
    expect(res.changed).toBe(false)
    expect(res.invoicePatch).toBeNull()
    expect(res.utilityPatch).toBeNull()
  })

  it('handles a job with no utility invoice at all', () => {
    const res = reconcileInvoicePair({
      invoice: { amount: 5000, discount_applied: 0 }, lines: [{ line_total: 5000 }],
      utilityInvoice: null, incentive: 0,
    })
    expect(res.utilityPatch).toBeNull()
    expect(res.after.ar).toBe(5000)
  })
})

describe('the legacy net shape', () => {
  it('does not double-deduct an invoice whose amount is already net', () => {
    // Legacy rows store amount = NET with a larger informational discount.
    expect(customerPortion(4700.36, 13110)).toBe(4700.36)
  })

  it('refuses to rewrite a legacy customer invoice', () => {
    // Job 8746 in a dry run: re-anchoring these turned $15,480 of AR into
    // $119,084 on a $67,095 job. The old discount doesn't record how much was
    // incentive vs deposit, so there is no safe automatic conversion.
    const invoice = { amount: 15480.32, discount_applied: 103603.80 }
    const res = reconcileInvoicePair({
      invoice, lines: [{ line_total: 67469.12 }],
      utilityInvoice: { amount: 50000, incentive_amount: 50000 }, incentive: 51603.80,
    })
    expect(res.legacyCustomer).toBe(true)
    expect(res.invoicePatch).toBeNull()
  })

  it('still corrects the utility side of a legacy pair', () => {
    // The incentive the user typed is unambiguous even when the customer
    // invoice can't be touched.
    const res = reconcileInvoicePair({
      invoice: { amount: 100, discount_applied: 5000 }, lines: [{ line_total: 5000 }],
      utilityInvoice: { amount: 4000, incentive_amount: 4000 }, incentive: 3500,
    })
    expect(res.utilityPatch.amount).toBe(3500)
  })
})

describe('arReconciles', () => {
  it('flags the broken pair and clears the fixed one', () => {
    expect(arReconciles({ invoice: INVOICE, utilityInvoice: UTILITY, expected: 20155.60 }).ok).toBe(false)
    expect(arReconciles({
      invoice: { amount: 20155.60, discount_applied: 12849.75 },
      utilityInvoice: { amount: 12849.75 },
      expected: 20155.60,
    }).ok).toBe(true)
  })

  it('reports how far off it is, signed', () => {
    const r = arReconciles({ invoice: INVOICE, utilityInvoice: UTILITY, expected: 20155.60 })
    expect(r.off).toBe(-2345.24)
  })
})
