#!/usr/bin/env node
// npm run check:payer-split — do the invoice and its utility row agree?
//
// Reports only. Exit 0 when every invariant holds, 1 otherwise.
//
// The utility's debt now lives on the invoice (utility_owes, utility_paid_at,
// utility_provider_id), mirrored from utility_invoices by a trigger until
// that table retires. Two records of the same fact is exactly the shape of
// bug this codebase keeps producing, so this script checks — on live data —
// that they say the same thing, and that receivables read the same under
// the old rule (utility rows only) and the new one (the invoice first).
//
// Run it after any change to the trigger, the backfill, or arHelpers.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { totalCustomerAR, totalUtilityAR, invoiceUtilityBalance } from '../src/lib/arHelpers.js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const num = (v) => Number(v) || 0
const usd = (n) => '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const CENT = 0.01
const same = (a, b) => Math.abs(a - b) < CENT

const page = async (table, select) => {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const invoices = await page('invoices', 'id, invoice_id, company_id, job_id, amount, discount_applied, payment_status, utility_owes, utility_paid_at, utility_provider_id, customer_owes')
const payments = await page('payments', 'id, invoice_id, amount, status, method, paid_by')
const rows = await page('utility_invoices', 'id, company_id, job_id, invoice_id, amount, incentive_amount, payment_status, paid_at, utility_name')

const problems = []
const flag = (s) => problems.push(s)

// ── 1. every carrier has exactly one linked utility row ───────────────────
const carriers = invoices.filter((i) => i.utility_owes != null)
const rowsByInvoice = new Map()
for (const u of rows) {
  if (u.invoice_id == null) continue
  if (!rowsByInvoice.has(u.invoice_id)) rowsByInvoice.set(u.invoice_id, [])
  rowsByInvoice.get(u.invoice_id).push(u)
}
for (const i of carriers) {
  const linked = rowsByInvoice.get(i.id) || []
  if (linked.length !== 1) flag(`invoice ${i.invoice_id ?? i.id} carries a utility debt but has ${linked.length} linked utility row(s)`)
}

// ── 2. every linked row's invoice carries the debt (the trigger fired) ────
const invById = new Map(invoices.map((i) => [i.id, i]))
for (const u of rows) {
  if (u.invoice_id == null) continue
  const i = invById.get(u.invoice_id)
  if (!i) { flag(`utility row ${u.id} links to invoice ${u.invoice_id}, which does not exist`); continue }
  if (i.utility_owes == null) { flag(`utility row ${u.id} links to invoice ${i.invoice_id ?? i.id}, which carries no utility debt — the mirror did not fire`); continue }

  // ── 3. the mirrored figures match the row, under the trigger's rule ──
  const expectOwes = u.payment_status === 'Void' ? 0 : num(u.amount ?? u.incentive_amount)
  if (!same(num(i.utility_owes), expectOwes)) flag(`invoice ${i.invoice_id ?? i.id}: utility_owes ${usd(i.utility_owes)} but its row says ${usd(expectOwes)}`)
  const paid = u.payment_status === 'Paid'
  if (paid && !i.utility_paid_at) flag(`invoice ${i.invoice_id ?? i.id}: row is Paid but utility_paid_at is null`)
  if (!paid && i.utility_paid_at) flag(`invoice ${i.invoice_id ?? i.id}: row is ${u.payment_status} but utility_paid_at is set`)
  if (paid && u.paid_at && i.utility_paid_at && new Date(u.paid_at).getTime() !== new Date(i.utility_paid_at).getTime()) {
    flag(`invoice ${i.invoice_id ?? i.id}: utility_paid_at ${i.utility_paid_at} differs from the row's paid_at ${u.paid_at}`)
  }
  if (paid && !u.paid_at) flag(`utility row ${u.id} is Paid with no paid_at — the mirror had to fall back to updated_at`)
  if (i.utility_provider_id == null) flag(`invoice ${i.invoice_id ?? i.id} carries a utility debt but does not name the utility`)
}

// ── 4. receivables: old rule and new rule, to the cent ────────────────────
const oldUtilityAR = rows
  .filter((u) => u.payment_status !== 'Paid' && u.payment_status !== 'Void')
  .reduce((s, u) => s + num(u.amount || u.incentive_amount), 0)
const newUtilityAR = totalUtilityAR(rows, invoices)
const fromInvoices = carriers.reduce((s, i) => s + invoiceUtilityBalance(i), 0)
const customerAR = totalCustomerAR(invoices, payments)

console.log(`\n  ${rows.length} utility row(s) · ${carriers.length} invoice(s) carry the debt · ${rows.filter((u) => u.invoice_id == null).length} row(s) unlinked`)
console.log('\n  UTILITY RECEIVABLES')
console.log(`    old rule (utility rows only)     ${usd(oldUtilityAR)}`)
console.log(`    new rule (invoice first)         ${usd(newUtilityAR)}   ${same(oldUtilityAR, newUtilityAR) ? 'identical' : '*** DIFFERS by ' + usd(newUtilityAR - oldUtilityAR)}`)
console.log(`      of which read from invoices    ${usd(fromInvoices)}`)
console.log(`      of which still from rows       ${usd(newUtilityAR - fromInvoices)}`)
console.log(`\n  CUSTOMER RECEIVABLES               ${usd(customerAR)}`)
if (!same(oldUtilityAR, newUtilityAR)) flag(`utility AR differs between the old rule (${usd(oldUtilityAR)}) and the new (${usd(newUtilityAR)})`)

const unlinked = rows.filter((u) => u.invoice_id == null)
if (unlinked.length) {
  console.log(`\n  UNLINKED — still counted from the utility row, not the invoice`)
  for (const u of unlinked) console.log(`    utility row ${u.id} · job ${u.job_id} · ${u.payment_status} · ${usd(u.amount || u.incentive_amount)}`)
}

if (problems.length) {
  console.log(`\n  ${problems.length} PROBLEM(S)`)
  for (const p of problems) console.log(`    ${p}`)
  console.log()
  process.exit(1)
}
console.log('\n  every invariant holds\n')
