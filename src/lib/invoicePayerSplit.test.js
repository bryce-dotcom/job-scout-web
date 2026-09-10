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
  totalAR,
  invoiceUtilityBalance,
  jobARSnapshot,
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

describe('utility AR reads the invoice, and the utility row only until it is linked', () => {
  // The transition has four kinds of row. Each must answer the way the
  // books already answer today.
  const invoices = [
    { id: 1, job_id: 10, payment_status: 'Pending', utility_owes: 14000, utility_paid_at: null },           // carried, unpaid
    { id: 2, job_id: 20, payment_status: 'Paid',    utility_owes: 9000,  utility_paid_at: '2026-06-18' },   // carried, utility paid
    { id: 3, job_id: 30, payment_status: 'Pending', utility_owes: null,  utility_paid_at: null },           // not carried
    { id: 4, job_id: 40, payment_status: 'Void',    utility_owes: 5000,  utility_paid_at: null },           // void invoice
  ]
  const rows = [
    { id: 101, job_id: 10, invoice_id: 1, amount: 14000, payment_status: 'Pending' },  // linked → not double counted
    { id: 102, job_id: 20, invoice_id: 2, amount: 9000,  payment_status: 'Paid' },
    { id: 103, job_id: 30, invoice_id: null, amount: 6528, payment_status: 'Pending' }, // unlinked → still counts from the row
    { id: 104, job_id: 40, invoice_id: 4, amount: 5000,  payment_status: 'Pending' },
  ]

  it('counts a carried debt from the invoice, an unlinked one from the row, and nothing twice', () => {
    // 14000 (inv 1) + 6528 (row 103). Inv 2 paid, inv 4 void, rows 101/102/104 are linked carriers.
    expect(totalUtilityAR(rows, invoices)).toBeCloseTo(20528, 2)
  })

  it('answers exactly as before when no invoices are passed — an un-updated caller cannot under-report', () => {
    // Old rule: every unpaid, non-void row. 14000 + 6528 + 5000.
    expect(totalUtilityAR(rows)).toBeCloseTo(25528, 2)
    expect(totalUtilityAR(rows, [])).toBeCloseTo(25528, 2)
  })

  it('a paid utility debt is settled the moment utility_paid_at is set', () => {
    expect(invoiceUtilityBalance({ utility_owes: 9000, utility_paid_at: null, payment_status: 'Pending' })).toBe(9000)
    expect(invoiceUtilityBalance({ utility_owes: 9000, utility_paid_at: '2026-06-18', payment_status: 'Pending' })).toBe(0)
  })

  it('a void or cancelled invoice owes nothing on the utility side either', () => {
    expect(invoiceUtilityBalance({ utility_owes: 9000, utility_paid_at: null, payment_status: 'Void' })).toBe(0)
    expect(invoiceUtilityBalance({ utility_owes: 9000, utility_paid_at: null, payment_status: 'Cancelled' })).toBe(0)
  })

  it('an invoice that does not carry the debt contributes nothing itself', () => {
    expect(invoiceUtilityBalance({ id: 3, payment_status: 'Pending' })).toBe(0)
    expect(invoiceUtilityBalance({ utility_owes: null })).toBe(0)
  })

  // The safe omission: a caller whose select forgot utility_owes reads
  // undefined on every invoice, nothing is "carried", and every row counts
  // — the old answer, not a silent zero.
  it('forgetting utility_owes in the select falls back to the old answer', () => {
    const stripped = invoices.map((i) => { const c = { ...i }; delete c.utility_owes; return c })
    expect(totalUtilityAR(rows, stripped)).toBeCloseTo(25528, 2)
  })

  it('totalAR and jobARSnapshot use the same rule', () => {
    expect(totalAR(invoices, rows, [])).toBeCloseTo(totalCustomerAR(invoices, []) + 20528, 2)
    const snap = jobARSnapshot(30, invoices, rows, [])
    expect(snap.utilityBalance).toBeCloseTo(6528, 2)
    expect(jobARSnapshot(20, invoices, rows, []).utilityBalance).toBe(0)
  })

  // The unsafe omission, guarded at the source: the store must keep selecting
  // both columns, or a paid carrier reads as unpaid and utility AR inflates.
  it('the store query that feeds AR selects both utility_owes and utility_paid_at', async () => {
    const { QUERIES } = await import('./schema.js')
    const q = String(QUERIES.invoices)
    const ok = q.startsWith('*') || (/\butility_owes\b/.test(q) && /\butility_paid_at\b/.test(q))
    expect(ok).toBe(true)
  })

  // JobDetail fetches its own rows with explicit column lists and feeds them
  // to jobARSnapshot, which filters by job_id and reads the payer columns.
  // The first time the widget was routed through the helper, neither query
  // selected job_id: every row was filtered out and the widget silently
  // vanished. Only opening the page in a browser caught it. This reads the
  // page source so the omission fails here instead.
  it('JobDetail selects every column jobARSnapshot reads', () => {
    const src = readFileSync(new URL('../pages/JobDetail.jsx', import.meta.url), 'utf8')
    const selects = [...src.matchAll(/\.select\('([^']+)'\)/g)].map((m) => m[1])
    const invoiceSelect = selects.find((s) => /\bpdf_url\b/.test(s) && /\bdiscount_applied\b/.test(s))
    const utilitySelect = selects.find((s) => /\bincentive_amount\b/.test(s) && /\bnet_cost\b/.test(s) && /\butility_name\b/.test(s))
    expect(invoiceSelect, 'the job invoices query').toBeTruthy()
    expect(utilitySelect, 'the job utility invoices query').toBeTruthy()
    for (const col of ['job_id', 'amount', 'discount_applied', 'payment_status', 'utility_owes', 'utility_paid_at']) {
      expect(new RegExp(`\\b${col}\\b`).test(invoiceSelect), `invoices select is missing ${col}`).toBe(true)
    }
    for (const col of ['job_id', 'invoice_id', 'amount', 'incentive_amount', 'payment_status']) {
      expect(new RegExp(`\\b${col}\\b`).test(utilitySelect), `utility_invoices select is missing ${col}`).toBe(true)
    }
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
