// Cash basis is ONE rule for Books and for Frankie's / Arnie's query_pnl
// (Bryce, 2026-10-28, "go through books month by month"). query_pnl kept its
// own copy: customer payments only — every utility incentive missing ($648k at
// HHH May–Oct) — and every linked receipt added on top of its bank row. Jenny
// read "$973k out against $514k in" while the bank showed about break-even.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { collectedIncentives, incentiveReceivedAt, isCashPayment, isUnlinkedExpense } from '../../supabase/functions/_shared/cashBasis.ts'
import * as revenueBasis from './revenueBasis'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const frankie = read('supabase/functions/_shared/frankieTools.ts')
const pnl = frankie.slice(frankie.indexOf('async function pnl('), frankie.indexOf('async function invoices('))

describe('the shared rule', () => {
  it('a payment is cash unless refunded, voided or trade credit', () => {
    expect(isCashPayment({ amount: 10 })).toBe(true)
    expect(isCashPayment({ status: 'Completed', method: 'Check' })).toBe(true)
    expect(isCashPayment({ status: 'Refunded' })).toBe(false)
    expect(isCashPayment({ status: 'Voided' })).toBe(false)
    expect(isCashPayment({ method: 'Trade Credit' })).toBe(false)
  })
  it('a receipt linked to a bank row is that bank row', () => {
    expect(isUnlinkedExpense({ plaid_transaction_id: 812 })).toBe(false)
    expect(isUnlinkedExpense({ plaid_transaction_id: null })).toBe(true)
  })
  it('the app reads the same functions', () => {
    expect(revenueBasis.collectedIncentives).toBe(collectedIncentives)
    expect(revenueBasis.incentiveReceivedAt).toBe(incentiveReceivedAt)
    const src = read('src/lib/revenueBasis.js')
    expect(src).toMatch(/isCashPayment\(p\)/)
    expect(src).toMatch(/isUnlinkedExpense\(e\)/)
    expect(src).not.toMatch(/const isCollected/)
  })
})

describe('query_pnl counts money in and out the way Books does', () => {
  it('incentives collected are revenue, dated the day they arrived', () => {
    expect(pnl).toMatch(/utility_invoices\?\$\{co\}&select=[^`]*paid_at[^`]*&payment_status=eq\.Paid/)
    expect(pnl).toMatch(/const at = incentiveReceivedAt\(u\); if \(inRange\(at\)\) addIn\('incentives', collectedIncentives\(\[u\]\)/)
    expect(pnl).toMatch(/utility_incentives_collected/)
  })
  it('payments are cash only, and lead deposits count', () => {
    expect(pnl).toMatch(/if \(isCashPayment\(p\)\) addIn\('customers'/)
    expect(pnl).toMatch(/lead_payments\?/)
  })
  it('a linked receipt is not added on top of its bank row', () => {
    expect(pnl).toMatch(/expenses\?\$\{co\}&select=[^`]*plaid_transaction_id/)
    expect(pnl).toMatch(/v > 0 && isUnlinkedExpense\(e\)/)
  })
})
