import { describe, it, expect } from 'vitest'
import { deduce, buildHistory, subsetSum, normalizeDescriptor, summarize } from '../../supabase/functions/_shared/booksDeduce.ts'

// Real shapes from HHH, amounts changed. Plaid sign: positive = out, negative = in.
const ctx = {
  openInvoices: [
    { id: 32661, invoice_id: 'INV-MRMH8SRI', customer_id: 1, customer_name: 'Mountain Storage LLC', balance: 0, invoice_date: '2026-08-02' },
    { id: 32717, invoice_id: 'INV-MSGCJWMW', customer_id: 2, customer_name: 'Alpine Cold Storage', balance: 1650, invoice_date: '2026-08-20' },
    { id: 32688, invoice_id: 'INV-MS3Z3YA1', customer_id: 3, customer_name: 'The Ivy at Draper', balance: 23883, invoice_date: '2026-09-01' },
    { id: 30273, invoice_id: 'INV-A', customer_id: 4, customer_name: 'Redman Movers', balance: 2200, invoice_date: '2026-08-15' },
    { id: 30282, invoice_id: 'INV-B', customer_id: 4, customer_name: 'Redman Movers', balance: 5160.1, invoice_date: '2026-08-30' },
    { id: 40001, invoice_id: 'INV-C', customer_id: 5, customer_name: 'Westside Auto Wash', balance: 1200, invoice_date: '2026-09-10' },
    { id: 40002, invoice_id: 'INV-D', customer_id: 6, customer_name: 'Front Range Auto Group', balance: 1200, invoice_date: '2026-06-10' },
  ],
  openClaims: [
    { id: 111, utility_name: 'Salt River Project (SRP)', amount: 30000, invoice_id: 32661, customer_name: 'Mountain Storage LLC' },
    { id: 116, utility_name: 'Salt River Project (SRP)', amount: 26892.68, invoice_id: 32717, customer_name: 'Alpine Cold Storage' },
    { id: 139, utility_name: 'Rocky Mountain Power', amount: 13652.85, customer_name: 'Evergreen' },
  ],
  loans: [{ id: 1, name: 'F-250 loan', lender: 'Ford Credit', monthly_payment: 612.5, match_payee: 'FORD CREDIT', status: 'active' }],
  payrollRuns: [{ id: 13, pay_date: '2026-09-18', total_gross: 33394.33, net_total: 31122.77 }],
  taxLiabilities: [{ id: 9, agency: 'IRS', amount_total: 5399.12, due_date: '2026-09-23', paid_at: null }],
  rules: [{ merchant_pattern: 'nayax vending', assigned_category: 'Repairs & Maintenance', assigned_tax_category: 'Line 12 - Repairs and maintenance', match_type: 'contains', priority: 0 }],
  vendors: [{ id: 5, name: 'Rocky Mountain Electrical Supply', business_name: 'RMES' }],
  categories: [{ name: 'Fuel', type: 'expense', default_tax_category: 'Line 20 - Auto expenses' }, { name: 'Job Materials', type: 'expense', default_tax_category: 'Line 2 - Cost of goods sold' }, { name: 'Sales', type: 'income' }],
  history: buildHistory([
    { id: 1, amount: 88.1, date: '2026-05-01', name: 'MAVERIK #4412', user_category: 'Fuel', ai_tax_category: 'Line 20 - Auto expenses', confirmed: true },
    { id: 2, amount: 91.2, date: '2026-06-01', name: 'MAVERIK #4412', user_category: 'Fuel', confirmed: true },
    { id: 3, amount: 70.0, date: '2026-07-01', name: 'MAVERIK #0021', user_category: 'Fuel', confirmed: true },
    { id: 4, amount: 500, date: '2026-07-01', name: 'Online Banking Transfer to 3032', user_category: 'Transfer', is_transfer: true, confirmed: true },
  ]),
  recentTxns: [
    { id: 900, amount: -2185.56, date: '2026-09-14', name: 'Home banking Deposit Transfer from S0059', connected_account_id: 5 },
    { id: 901, amount: 2185.56, date: '2026-09-14', name: 'Transfer to Checking', connected_account_id: 9 },
  ],
}

const v = (t) => deduce({ connected_account_id: 5, ...t }, ctx)

describe('deduce — money in', () => {
  it('ties the $57,372.68 check deposit to two SRP claims plus one customer check', () => {
    const r = v({ id: 10, amount: -57372.68, date: '2026-09-14', name: 'Check Deposit' })
    // 30,000 + 26,892.68 = 56,892.68; + 480 would be the CK#661 — not an open invoice here, so claims alone fail…
    expect(r.kind).not.toBe('stripe_payout')
    const r2 = v({ id: 11, amount: -56892.68, date: '2026-09-14', name: 'Check Deposit' })
    expect(r2.kind).toBe('utility_incentive')
    expect(r2.matches.map(m => m.id).sort()).toEqual([111, 116])
    expect(r2.confidence).toBeGreaterThanOrEqual(0.9)
    expect(r2.evidence[0]).toMatch(/30,000.00 \+ .*26,892.68/)
  })
  it('a claim plus one customer invoice in one deposit', () => {
    const r = v({ id: 12, amount: -(13652.85 + 1200), date: '2026-09-18', name: 'Ach Deposit' })
    expect(r.kind).toBe('utility_incentive')
    expect(r.matches.map(m => m.type)).toEqual(['utility_invoice', 'invoice'])
    expect(r.confidence).toBeGreaterThanOrEqual(0.85)
  })
  it('a named customer with the exact open balance is near-certain', () => {
    const r = v({ id: 13, amount: -23883, date: '2026-09-17', name: 'The Ivy Deposit' })
    expect(r).toMatchObject({ kind: 'customer_payment', category: 'Sales', confidence: 0.97 })
    expect(r.matches[0].id).toBe(32688)
  })
  it('one customer, two invoices summing to the deposit', () => {
    const r = v({ id: 14, amount: -7360.1, date: '2026-09-14', name: 'Redman Deposit' })
    expect(r.kind).toBe('customer_payment')
    expect(r.matches.map(m => m.id).sort()).toEqual([30273, 30282])
  })
  it('never builds a set across customers: two customers at $1,200 → unsure, both offered', () => {
    const r = v({ id: 15, amount: -1200, date: '2026-09-20', name: 'Mobile Deposit' })
    expect(r.kind).toBe('customer_payment')
    expect(r.confidence).toBeLessThan(0.7)
    expect(r.needs_model).toBe(true)
    expect(r.candidates.invoices.map(i => i.id).sort()).toEqual([40001, 40002])
    expect(r.matches[0].id).toBe(40001)   // nearest by date leads
  })
  it('an invoice marked Paid by hand with no payment row still explains the deposit, and says so', () => {
    const c2 = { ...ctx, openInvoices: [...ctx.openInvoices, { id: 50001, invoice_id: 'INV-PH', customer_id: 9, customer_name: 'Summit Medical Plaza', balance: 3850, invoice_date: '2026-09-01', phantom: true }] }
    const r = deduce({ id: 18, amount: -3850, date: '2026-09-20', name: 'Check Deposit', connected_account_id: 5 }, c2)
    expect(r).toMatchObject({ kind: 'customer_payment', confidence: 0.93 })
    expect(r.matches[0].id).toBe(50001)
    expect(r.evidence.join(' ')).toMatch(/marked Paid by hand with no payment recorded/)
  })
  it('a Stripe deposit is a payout transfer, and a same-amount opposite row is a transfer pair', () => {
    expect(v({ id: 16, amount: -2114.87, date: '2026-09-14', name: 'Transfer from Stripe' })).toMatchObject({ kind: 'stripe_payout', is_transfer: true })
    const pair = v({ id: 900, amount: -2185.56, date: '2026-09-14', name: 'Home banking Deposit Transfer from S0059' })
    expect(pair).toMatchObject({ kind: 'transfer', is_transfer: true, confidence: 0.96 })
    expect(pair.matches[0]).toMatchObject({ type: 'transfer_pair', id: 901 })
  })
  it('an unexplained deposit is unknown with candidates, not a guess', () => {
    const r = v({ id: 17, amount: -4321, date: '2026-09-22', name: 'Mobile Deposit' })
    expect(r.kind).toBe('unknown')
    expect(r.confidence).toBeLessThan(0.5)
    expect(r.candidates.categories).toEqual(['Sales'])
  })
})

describe('deduce — money out', () => {
  it('payroll by run date + amount, and by descriptor near a pay date', () => {
    const r = v({ id: 20, amount: 31122.77, date: '2026-09-18', name: 'Draft Withdrawal Draft #8821' })
    expect(r).toMatchObject({ kind: 'payroll', category: 'Payroll', confidence: 0.97 })
    expect(r.matches[0]).toMatchObject({ type: 'payroll_run', id: 13 })
    const g = v({ id: 21, amount: 1500, date: '2026-09-19', name: 'GUSTO FEE' })
    expect(g.kind).toBe('payroll')
    expect(g.confidence).toBe(0.92)
  })
  it('tax deposits match an open liability', () => {
    const r = v({ id: 22, amount: 5399.12, date: '2026-09-22', name: 'IRS USATAXPYMT' })
    expect(r).toMatchObject({ kind: 'tax_deposit', category: 'Payroll Taxes', confidence: 0.97 })
    expect(r.matches[0].id).toBe(9)
  })
  it('loan payments: payee + amount is certain, amount alone is likely', () => {
    expect(v({ id: 23, amount: 612.5, date: '2026-09-15', name: 'FORD CREDIT PAYMENT' })).toMatchObject({ kind: 'loan_payment', confidence: 0.97 })
    expect(v({ id: 24, amount: 612.5, date: '2026-09-15', name: 'HOME DEPOT' })).toMatchObject({ kind: 'loan_payment', confidence: 0.88 })
  })
  it("the owner's rule beats history and the AI guess", () => {
    const r = v({ id: 25, amount: 12, date: '2026-09-02', name: 'NAYAX VENDING 44', ai_category: 'Meals' })
    expect(r).toMatchObject({ kind: 'expense', category: 'Repairs & Maintenance', confidence: 0.96 })
  })
  it('history: a descriptor confirmed before gets its category, more confirmations = surer', () => {
    const r = v({ id: 26, amount: 95.4, date: '2026-09-03', name: 'MAVERIK #4412' })
    expect(r).toMatchObject({ kind: 'expense', category: 'Fuel', tax_category: 'Line 20 - Auto expenses', confidence: 0.9 })
    expect(r.needs_model).toBe(false)
  })
  it('a descriptor-only transfer with no pair stays below the bar', () => {
    const r = v({ id: 27, amount: 900, date: '2026-09-03', name: 'Online Banking Transfer to 3032' })
    expect(r).toMatchObject({ kind: 'transfer', is_transfer: true, confidence: 0.92 })
  })
  it('a known vendor without history is a materials guess that needs the model', () => {
    const r = v({ id: 28, amount: 1840, date: '2026-09-05', name: 'ROCKY MOUNTAIN ELECTRICAL SUPPLY' })
    expect(r).toMatchObject({ kind: 'expense', category: 'Job Materials', confidence: 0.7, needs_model: true })
    expect(r.matches[0]).toMatchObject({ type: 'vendor', id: 5 })
    expect(r.candidates.categories).toContain('Fuel')
  })
  it('keeps a confident AI job tag on an expense', () => {
    const r = v({ id: 29, amount: 300, date: '2026-09-05', name: 'ROCKY MOUNTAIN ELECTRICAL SUPPLY', ai_job_id: 77, ai_job_confidence: 0.9 })
    expect(r.job_id).toBe(77)
  })
})

describe('helpers', () => {
  it('normalizeDescriptor strips numbers and filler', () => {
    expect(normalizeDescriptor('MAVERIK #4412 POS DEBIT 09/03')).toBe('maverik')
    expect(normalizeDescriptor('Online Banking Transfer to 3032')).toBe('banking transfer')
  })
  it('subsetSum finds up to four parts within a dollar, largest first', () => {
    const items = [{ amount: 100 }, { amount: 250 }, { amount: 400.5 }, { amount: 49.9 }, { amount: 2000 }]
    expect(subsetSum(items, 350).map(i => i.amount)).toEqual([250, 100])
    expect(subsetSum(items, 800.4).map(i => i.amount).sort()).toEqual([100, 250, 400.5, 49.9].sort())
    expect(subsetSum(items, 333)).toBeNull()
  })
  it('summarize counts kinds, confidence bands and matched dollars', () => {
    const s = summarize([
      v({ id: 13, amount: -23883, date: '2026-09-17', name: 'The Ivy Deposit' }),
      v({ id: 17, amount: -4321, date: '2026-09-22', name: 'Mobile Deposit' }),
    ])
    expect(s).toMatchObject({ total: 2, confidence: { sure: 1, likely: 0, unsure: 1 }, matchedAmount: 23883, needsModel: 1 })
    expect(s.byKind.customer_payment.n).toBe(1)
  })
})
