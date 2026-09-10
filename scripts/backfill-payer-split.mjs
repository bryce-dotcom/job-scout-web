#!/usr/bin/env node
// npm run backfill:payer-split [-- --write]
//
// Step two of retiring the separate utility invoice: put both obligations on
// the one customer invoice. Reports by default; --write applies.
//
// WHAT IT WRITES
//
//   utility_owes         = utility_invoices.amount || incentive_amount
//   utility_provider_id  = the provider matching utility_invoices.utility_name
//
// and NOTHING ELSE. customer_owes is a generated column — Postgres derives it
// from amount and discount_applied, so there is nothing to backfill and no
// way for it to drift. This script instead ASSERTS that the generated column
// agrees with arHelpers.invoiceCustomerTotal for every invoice in the
// database. If the SQL and the JavaScript ever disagree, that assertion fails
// here rather than showing two different balances on two different screens.
//
// WHY RECEIVABLES CANNOT MOVE
//
// utility_owes is copied from the figure arHelpers.totalUtilityAR already
// sums, and nothing reads the new columns yet. The script measures customer
// and utility AR before and after and exits non-zero if either moved by a
// cent.
//
// WHAT IT REFUSES TO TOUCH
//
// A utility row whose own three figures do not reconcile
// (npm run check:utility-split), and an invoice that structurally disagrees
// with its utility row. Both are named on screen with the dollars involved.
// Migrating a wrong number is how it becomes permanent.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { invoiceCustomerTotal, totalCustomerAR, totalUtilityAR } from '../src/lib/arHelpers.js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--write')

const num = (v) => Number(v) || 0
const usd = (n) => '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const CENT = 0.01

// Unpaged PostgREST queries stop at 1000 rows and say nothing about it. An
// earlier version of this analysis read 9 of 25 rows and looked clean.
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

const INVOICE_COLS = 'id, invoice_id, company_id, job_id, amount, discount_applied, project_discount, down_payment_applied, payment_status, utility_owes, customer_owes, utility_provider_id'
const invoices = await page('invoices', INVOICE_COLS)
const payments = await page('payments', 'id, invoice_id, amount, status, method, paid_by')
const utilities = await page('utility_invoices', 'id, company_id, job_id, invoice_id, amount, incentive_amount, project_cost, net_cost, payment_status, utility_name')

// ── the generated column must equal the JavaScript, for every row ──────────
const drift = invoices.filter((i) => Math.abs(num(i.customer_owes) - invoiceCustomerTotal(i)) > CENT)
console.log('\n  GENERATED customer_owes vs arHelpers.invoiceCustomerTotal')
if (drift.length) {
  console.log(`    ${drift.length} of ${invoices.length} invoice(s) DISAGREE — the SQL and the JS have diverged:`)
  for (const i of drift.slice(0, 10)) {
    console.log(`      ${i.invoice_id ?? i.id}  column ${usd(i.customer_owes)}  vs  helper ${usd(invoiceCustomerTotal(i))}`)
  }
  console.log('\n    refusing to go further\n')
  process.exit(1)
}
console.log(`    all ${invoices.length} invoices agree`)

// ── receivables as the books read them right now ───────────────────────────
const arBefore = { customer: totalCustomerAR(invoices, payments), utility: totalUtilityAR(utilities) }
console.log('\n  RECEIVABLES BEFORE')
console.log(`    customer  ${usd(arBefore.customer)}`)
console.log(`    utility   ${usd(arBefore.utility)}`)

// ── which utility rows are internally consistent ───────────────────────────
// Same rules as check-utility-split: a row it refuses is a row we do not migrate.
const rejected = (u) => {
  const p = num(u.project_cost), i = num(u.incentive_amount), n = num(u.net_cost)
  if (p < 0 || i < 0 || n < 0) return 'a negative figure'
  if (p === 0 && i === 0 && n === 0) return 'all three figures zero'
  if (Math.abs(p - (i + n)) > CENT) return 'does not reconcile'
  return null
}

const byId = new Map(invoices.map((i) => [i.id, i]))
const byJob = new Map()
for (const i of invoices) {
  if (!i.job_id) continue
  if (!byJob.has(i.job_id)) byJob.set(i.job_id, [])
  byJob.get(i.job_id).push(i)
}

const providers = await page('utility_providers', 'id, provider_name')
const providerId = (name) => providers.find(
  (p) => String(p.provider_name).trim().toLowerCase() === String(name || '').trim().toLowerCase()
)?.id ?? null

const plan = [], skipped = [], disputed = []
for (const u of utilities) {
  const bad = rejected(u)
  if (bad) { skipped.push({ u, why: bad }); continue }

  // Prefer the explicit link; else the job's one real invoice.
  let inv = u.invoice_id ? byId.get(u.invoice_id) : null
  if (!inv) {
    const candidates = (byJob.get(u.job_id) || []).filter((i) => num(i.amount) > 0)
    if (candidates.length === 1) inv = candidates[0]
    else { skipped.push({ u, why: candidates.length ? `${candidates.length} candidate invoices on the job` : 'no customer invoice' }); continue }
  }

  // ── does the customer invoice agree with the utility row about the job? ──
  //
  // The coherent shape is: the invoice's gross covers at least the in-scope
  // project (anything above it is out-of-scope add-ons), and the credits on
  // it are at least the incentive the utility is paying.
  //
  //   grossGap = amount - project_cost           should be >= 0
  //   discGap  = discount_applied - incentive    should be >= 0
  //
  // This is a stronger test than comparing customer_owes to net_cost, and
  // catches a case that one misses: an invoice crediting the customer LESS
  // than the incentive looks like it simply has add-ons.
  //
  // Note a negative grossGap cannot be add-ons — the invoice's gross is BELOW
  // the in-scope project, so there is nothing extra on it to explain.
  const grossGap = num(inv.amount) - num(u.project_cost)
  const discGap = num(inv.discount_applied) - num(u.incentive_amount)

  // The legacy NET shape is not a disagreement. Some invoices store `amount`
  // already net of the incentive with no discount recorded at all (job 12814).
  // Both gaps are then exactly -incentive, and the money is still right:
  // customer_owes lands on net_cost. Recognise it rather than flagging it.
  const legacyNet = Math.abs(grossGap + num(u.incentive_amount)) < CENT
    && Math.abs(discGap + num(u.incentive_amount)) < CENT
    && Math.abs(invoiceCustomerTotal(inv) - num(u.net_cost)) < CENT

  if (!legacyNet && (grossGap < -CENT || discGap < -CENT)) {
    // What the customer would owe if the invoice matched the utility row,
    // allowing for credits the invoice legitimately breaks out.
    const expected = num(u.net_cost) - num(inv.project_discount) - num(inv.down_payment_applied)
    disputed.push({ u, inv, grossGap, discGap, expected, actual: invoiceCustomerTotal(inv) })
    continue
  }

  plan.push({
    invoice: inv,
    utility_owes: num(u.amount || u.incentive_amount),
    utility_provider_id: providerId(u.utility_name),
    from: u.id,
  })
}

console.log(`\n  ${plan.length} invoice(s) to backfill · ${skipped.length} skipped · ${disputed.length} disputed`)
for (const s of skipped) console.log(`    skip utility ${s.u.id} (job ${s.u.job_id}) — ${s.why}`)

if (disputed.length) {
  console.log('\n  THE INVOICE AND THE UTILITY ROW DISAGREE — not migrated, needs a decision')
  let under = 0, over = 0
  for (const d of disputed) {
    const delta = d.actual - d.expected
    if (delta < 0) under += -delta; else over += delta
    console.log(`\n    ${d.inv.invoice_id} · job ${d.u.job_id} · utility row ${d.u.id}`)
    console.log(`      utility row : project ${usd(d.u.project_cost)}  incentive ${usd(d.u.incentive_amount)}  customer's share ${usd(d.u.net_cost)}`)
    console.log(`      invoice     : gross ${usd(d.inv.amount)} (${usd(d.grossGap)} vs project)  credits ${usd(d.inv.discount_applied)} (${usd(d.discGap)} vs incentive)`)
    console.log(`      customer is billed ${usd(d.actual)}, the utility row says ${usd(d.expected)} — ${delta < 0 ? 'UNDER' : 'OVER'} by ${usd(Math.abs(delta))}`)
  }
  console.log(`\n    under-billed ${usd(under)} · over-billed ${usd(over)} across ${disputed.length} job(s)`)
}

console.log('\n  PLAN')
for (const p of plan.slice(0, 6)) {
  console.log(`    ${p.invoice.invoice_id ?? p.invoice.id}  utility owes ${usd(p.utility_owes)}  customer owes ${usd(p.invoice.customer_owes)}  provider ${p.utility_provider_id ?? 'NONE'}`)
}
if (plan.length > 6) console.log(`    … and ${plan.length - 6} more`)

const noProvider = plan.filter((p) => p.utility_provider_id == null)
if (noProvider.length) {
  console.log(`\n  ${noProvider.length} row(s) have no provider match — the books could not name who owes. Refusing.`)
  if (APPLY) process.exit(1)
}

if (!APPLY) { console.log('\n  (report only — pass --write)\n'); process.exit(0) }

writeFileSync(
  new URL(`../../payer-split-backup-${Date.now()}.json`, import.meta.url),
  JSON.stringify(plan.map((p) => ({
    id: p.invoice.id, invoice_id: p.invoice.invoice_id,
    utility_owes: p.invoice.utility_owes, utility_provider_id: p.invoice.utility_provider_id,
  })), null, 1)
)

let wrote = 0
for (const p of plan) {
  const { error } = await sb.from('invoices').update({
    utility_owes: p.utility_owes,
    utility_provider_id: p.utility_provider_id,
  }).eq('id', p.invoice.id)
  if (error) { console.log(`    ERR invoice ${p.invoice.id}: ${error.message}`); continue }
  wrote++
}
console.log(`\n  wrote ${wrote} of ${plan.length}`)

// ── re-read and prove receivables did not move ─────────────────────────────
const invAfter = await page('invoices', INVOICE_COLS)
const payAfter = await page('payments', 'id, invoice_id, amount, status, method, paid_by')
const utilAfter = await page('utility_invoices', 'id, amount, incentive_amount, payment_status')
const arAfter = { customer: totalCustomerAR(invAfter, payAfter), utility: totalUtilityAR(utilAfter) }

const same = (a, b) => Math.abs(a - b) < CENT
console.log('\n  RECEIVABLES AFTER')
console.log(`    customer  ${usd(arAfter.customer)}  ${same(arAfter.customer, arBefore.customer) ? 'unchanged' : '*** MOVED'}`)
console.log(`    utility   ${usd(arAfter.utility)}  ${same(arAfter.utility, arBefore.utility) ? 'unchanged' : '*** MOVED'}`)

// The stored utility_owes must reproduce utility AR exactly on the rows that
// carry it — that is the whole point of the column.
const carried = invAfter.filter((i) => i.utility_owes != null)
const carriedTotal = carried.reduce((s, i) => s + num(i.utility_owes), 0)
const sourceTotal = plan.reduce((s, p) => s + p.utility_owes, 0)
console.log(`\n  ${carried.length} invoice(s) now name a utility debt, totalling ${usd(carriedTotal)}`)
console.log(`    source rows totalled ${usd(sourceTotal)}  ${same(carriedTotal, sourceTotal) ? 'matches' : '*** MISMATCH'}`)

const moved = !same(arAfter.customer, arBefore.customer) || !same(arAfter.utility, arBefore.utility) || !same(carriedTotal, sourceTotal)
console.log(moved ? '\n  *** SOMETHING MOVED — investigate before going further\n' : '\n  receivables unchanged, as required\n')
process.exit(moved ? 1 : 0)
