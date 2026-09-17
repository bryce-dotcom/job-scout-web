import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invoicePaymentStatus } from './arHelpers.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const m = read('../../supabase/functions/_shared/arniePayment.ts')
const page = read('../pages/InvoiceDetail.jsx')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')

const prepare = m.slice(m.indexOf('export async function preparePayment'), m.indexOf('export async function applyPayment'))
const apply = m.slice(m.indexOf('export async function applyPayment'), m.indexOf('async function sendReceipt'))
const rollback = m.slice(m.indexOf('export async function rollbackPayment'))

// The Deno status rule, evaluated here so it can be run against the JS one.
const denoStatus = (() => {
  const src = m.slice(m.indexOf('export const utilityHasPaid'), m.indexOf('/** What the customer has paid'))
    .replace(/export /g, '').replace(/: any/g, '').replace(/: number/g, '').replace(/: string/g, '')
  return new Function(`${src}; return paymentStatus`)()
})()

describe('the status is the one rule, not a second copy', () => {
  const cases = [
    { amount: 1000, discount_applied: 0, credit_card_fee: 0, paid: 0 },
    { amount: 1000, discount_applied: 0, credit_card_fee: 0, paid: 400 },
    { amount: 1000, discount_applied: 0, credit_card_fee: 0, paid: 999.995 },
    { amount: 1000, discount_applied: 0, credit_card_fee: 19, paid: 1000 },
    { amount: 7113.77, discount_applied: 5335.33, credit_card_fee: 0, paid: 1778.44 },   // Biorge 32597 — net paid in full
    { amount: 5000, discount_applied: 5000, credit_card_fee: 0, paid: 0 },                 // incentive covers it, nothing in yet
    { amount: 5000, discount_applied: 5000, credit_card_fee: 0, paid: 0, utility_owes: 5000, utility_paid_at: '2026-09-01' },
    { amount: 1200, discount_applied: 1500, credit_card_fee: 0, paid: 1200 },              // legacy net shape
    { amount: 0, discount_applied: 0, credit_card_fee: 0, paid: 0 },
  ]
  it.each(cases)('agrees with arHelpers for %j', (c) => {
    const gross = Number(c.amount) || 0, disc = Number(c.discount_applied) || 0
    const customer_owes = (disc > 0 && disc > gross ? gross : Math.max(0, gross - disc)) + (Number(c.tax_amount) || 0)   // the generated column (incl. sales tax)
    const inv = { ...c, customer_owes }
    expect(denoStatus(inv, c.paid)).toBe(invoicePaymentStatus(inv, c.paid, c.credit_card_fee))
  })
})

describe('the page\'s write, carried over', () => {
  it('the row has the page\'s shape with source arnie and status Completed', () => {
    expect(page).toMatch(/source: 'manual'/)
    expect(apply).toMatch(/amount: c\.amount, date: c\.date, method: c\.method, status: 'Completed', source: 'arnie'/)
  })
  it('the utility\'s money is never counted as the customer\'s', () => {
    expect(m).toMatch(/rows\.filter\(\(p: any\) => p\.paid_by !== 'utility'\)/)
  })
  it('an amount equal to the unpaid incentive is refused with the page\'s reason', () => {
    expect(page).toMatch(/That is the utility incentive, not a customer payment/)
    expect(prepare).toMatch(/is the utility incentive on .* not a customer payment/)
    expect(prepare).toMatch(/util > 0 && !inv\.utility_paid_at && Math\.abs\(amount - util\) < 0\.01/)
  })
  it('card payments go through the page when the fee is on — no fee arithmetic here', () => {
    expect(page).toMatch(/invoice_cc_fee_enabled', true\) && getInvoiceSetting\('invoice_accept_credit_card', false\)/)
    expect(m).toMatch(/get\('invoice_cc_fee_enabled', true\) && get\('invoice_accept_credit_card', false\)/)
    expect(prepare).toMatch(/method === 'Credit Card' && await ccFeeOn/)
    expect(m).not.toMatch(/ccFeePercent|\* \(.*\/ 100\)/)
  })
  it('overpaying is refused, not trimmed', () => {
    expect(prepare).toMatch(/if \(amount > balance \+ 0\.01\)/)
    expect(prepare).not.toMatch(/Math\.min\(amount, balance\)/)
  })
})

describe('who, when, and undo', () => {
  it('admin only, at draft and in the registry', () => {
    expect(prepare).toMatch(/if \(caller\.level < 3\) return \{ ok: false as const, error: 'Recording money in is an admin/)
    expect(create).toMatch(/payment: \{[\s\S]*?minLevel: 3/)
  })
  it('apply refuses if the invoice moved since the draft', () => {
    expect(apply).toMatch(/Math\.abs\(paidNow - Number\(c\.paid_before\)\) > 0\.005 \|\| String\(inv\.payment_status \?\? ''\) !== String\(c\.status_before \?\? ''\)/)
    expect(apply).toMatch(/stale: true/)
  })
  it('the receipt address comes from the invoice or the customer, and the card says it cannot be unsent', () => {
    expect(prepare).toMatch(/\[inv\.sent_to_email, cust\?\.email\]/)
    expect(prepare).toMatch(/on approve — that part cannot be undone/)
  })
  it('rollback deletes only its own unrefunded row and re-derives the status', () => {
    expect(rollback).toMatch(/if \(p\.source !== 'arnie'\) return \{ ok: false/)
    expect(rollback).toMatch(/if \(Number\(p\.refunded_amount\) > 0\) return \{ ok: false/)
    expect(rollback).toMatch(/payment_status: paymentStatus\(inv, await customerPaid\(r, companyId, inv\.id\)\)/)
  })
  it('the card says Record, and the prompt forbids "recorded" before approval', () => {
    expect(create).toMatch(/payment: \{[\s\S]*?verb: 'Record'/)
    expect(engine).toMatch(/never "recorded" or "marked paid"/)
  })
})
