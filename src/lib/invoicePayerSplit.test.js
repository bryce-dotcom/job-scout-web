// The payer split: one invoice, two debtors.
//
// A rebate job bills two parties. utility_owes is stored on the invoice; what
// the customer owes is DERIVED by a Postgres generated column. That means the
// same rule now exists in two languages, which is precisely the shape of bug
// this codebase keeps producing — so these tests pin the two together and fail
// if either moves.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  invoiceCustomerTotal,
  invoiceBalance,
  paymentsByInvoiceIndex,
  totalCustomerAR,
  totalUtilityAR,
} from './arHelpers.js'

const MIGRATION = new URL('../../supabase/migrations/20260910190000_customer_owes_generated.sql', import.meta.url)

// A JavaScript transliteration of the SQL the generated column runs. Kept
// deliberately literal — coalesce as `?? 0`, greatest as Math.max — so it can
// be read side by side with the migration.
function sqlCustomerOwes(amount, discountApplied) {
  const amt = amount ?? 0
  const disc = discountApplied ?? 0
  if (disc > 0 && disc > amt) return amt
  return Math.max(0, amt - disc)
}

// Every shape a real invoice takes, named.
const SHAPES = [
  { name: 'modern: gross with the incentive as a credit', amount: 20000, discount_applied: 14000, owes: 6000 },
  { name: 'modern: no credits at all (HHH window cleaning)', amount: 1250.75, discount_applied: 0, owes: 1250.75 },
  { name: 'legacy: amount ALREADY net, no credit recorded (job 12814)', amount: 4677.58, discount_applied: 0, owes: 4677.58 },
  { name: 'legacy: informational credit larger than the net amount', amount: 100, discount_applied: 200, owes: 100 },
  { name: 'the incentive covers the project exactly — customer owes nothing', amount: 14162.93, discount_applied: 14162.93, owes: 0 },
  { name: 'empty shell invoice', amount: 0, discount_applied: 0, owes: 0 },
  { name: 'null amount', amount: null, discount_applied: null, owes: 0 },
  { name: 'credit slightly exceeds a zero invoice', amount: 0, discount_applied: 50, owes: 0 },
]

describe('invoiceCustomerTotal — the one rule for what the customer owes', () => {
  for (const s of SHAPES) {
    it(s.name, () => {
      expect(invoiceCustomerTotal({ amount: s.amount, discount_applied: s.discount_applied })).toBeCloseTo(s.owes, 2)
    })
  }

  // The distinction that once billed a customer the entire project: an invoice
  // whose credits exactly cover it is MODERN and owes $0, not legacy owing the
  // full gross. Only a strictly larger credit means the legacy shape.
  it('treats credit == amount as fully covered, not as the legacy shape', () => {
    expect(invoiceCustomerTotal({ amount: 5000, discount_applied: 5000 })).toBe(0)
    expect(invoiceCustomerTotal({ amount: 5000, discount_applied: 5000.01 })).toBe(5000)
  })
})

describe('the generated column and the helper cannot drift', () => {
  it('agree on every named invoice shape', () => {
    for (const s of SHAPES) {
      expect(sqlCustomerOwes(s.amount, s.discount_applied))
        .toBeCloseTo(invoiceCustomerTotal({ amount: s.amount, discount_applied: s.discount_applied }), 2)
    }
  })

  it('agree across a wide sweep of amounts and credits', () => {
    for (let amount = 0; amount <= 20000; amount += 617) {
      for (let disc = 0; disc <= 25000; disc += 911) {
        expect(sqlCustomerOwes(amount, disc))
          .toBeCloseTo(invoiceCustomerTotal({ amount, discount_applied: disc }), 2)
      }
    }
  })

  // If someone edits the migration, this fails and they have to come back and
  // re-check the transliteration above rather than letting the two silently part.
  it('the migration still contains the expression these tests mirror', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/\s+/g, ' ').toLowerCase()
    expect(sql).toContain('generated always as')
    expect(sql).toContain('stored')
    expect(sql).toContain('when coalesce(discount_applied, 0) > 0')
    expect(sql).toContain('and coalesce(discount_applied, 0) > coalesce(amount, 0)')
    expect(sql).toContain('then coalesce(amount, 0)')
    expect(sql).toContain('else greatest(0, coalesce(amount, 0) - coalesce(discount_applied, 0))')
  })

  it('the guard above actually fails when the expression changes', () => {
    const mangled = 'generated always as ( case when coalesce(discount_applied, 0) >= 0 then 1 end ) stored'
    expect(mangled).not.toContain('when coalesce(discount_applied, 0) > 0 ')
  })
})

describe('paid_by — a utility payment must not settle the customer balance', () => {
  const inv = { id: 7, amount: 20000, discount_applied: 14000, payment_status: 'Pending' }

  it('counts customer payments, as it always has', () => {
    const pays = [{ invoice_id: 7, amount: 2000, paid_by: 'customer' }]
    expect(invoiceBalance(inv, pays)).toBeCloseTo(4000, 2)
    expect(invoiceBalance(inv, paymentsByInvoiceIndex(pays))).toBeCloseTo(4000, 2)
  })

  it('ignores a utility payment on the same invoice', () => {
    const pays = [
      { invoice_id: 7, amount: 2000, paid_by: 'customer' },
      { invoice_id: 7, amount: 14000, paid_by: 'utility' },
    ]
    expect(invoiceBalance(inv, pays)).toBeCloseTo(4000, 2)
    expect(invoiceBalance(inv, paymentsByInvoiceIndex(pays))).toBeCloseTo(4000, 2)
  })

  // The omitted-select trap, in the safe direction. A caller that forgets
  // paid_by reads undefined; the payment must still count, so the omission
  // leaves today's numbers alone instead of silently zeroing them.
  it('still counts a payment whose paid_by was never selected', () => {
    const pays = [{ invoice_id: 7, amount: 2000 }]
    expect(invoiceBalance(inv, pays)).toBeCloseTo(4000, 2)
    expect(invoiceBalance(inv, paymentsByInvoiceIndex(pays))).toBeCloseTo(4000, 2)
  })
})

describe('adding the payer split does not move receivables', () => {
  const invoices = [
    { id: 1, amount: 20000, discount_applied: 14000, payment_status: 'Pending' },
    { id: 2, amount: 1250.75, discount_applied: 0, payment_status: 'Partially Paid' },
    { id: 3, amount: 9000, discount_applied: 9000, payment_status: 'Pending' },
    { id: 4, amount: 5000, discount_applied: 0, payment_status: 'Paid' },
  ]
  const payments = [
    { invoice_id: 1, amount: 1000 },
    { invoice_id: 2, amount: 250.75 },
  ]
  const utilityRows = [
    { amount: 14000, incentive_amount: 14000, payment_status: 'Pending' },
    { amount: 9000, incentive_amount: 9000, payment_status: 'Paid' },
  ]

  // Same rows, now carrying the new columns. The totals must be identical —
  // this is the property the production backfill asserted against live data.
  const withSplit = invoices.map((i, n) => ({
    ...i,
    utility_owes: utilityRows[n]?.amount ?? null,
    customer_owes: invoiceCustomerTotal(i),
    utility_provider_id: 116,
  }))
  const paymentsWithPayer = payments.map((p) => ({ ...p, paid_by: 'customer' }))

  it('customer AR is the same with the columns present', () => {
    expect(totalCustomerAR(withSplit, paymentsWithPayer))
      .toBeCloseTo(totalCustomerAR(invoices, payments), 2)
  })

  it('utility AR is the same', () => {
    expect(totalUtilityAR(utilityRows)).toBeCloseTo(14000, 2)
  })

  it('customer AR counts only what is genuinely open', () => {
    // inv 1: 6000 − 1000 = 5000. inv 2: 1250.75 − 250.75 = 1000.
    // inv 3 is fully covered by the incentive → 0. inv 4 is Paid → excluded.
    expect(totalCustomerAR(invoices, payments)).toBeCloseTo(6000, 2)
  })
})
