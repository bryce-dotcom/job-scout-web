#!/usr/bin/env node
// npm run backfill:payer-split — which invoices disagree with their utility row?
//
// A report. It was the step-two backfill that first wrote utility_owes and
// utility_provider_id onto the customer invoice; the step-three migration
// (20260911100000_utility_settlement_mirror) handed those columns to a
// trigger that mirrors every write to utility_invoices onto its linked
// invoice, so this script no longer writes anything. Fix the utility row and
// the invoice follows. Two writers would be the same rule in two places.
//
// What it still does, on live data:
//
//   1. Asserts the generated customer_owes column equals
//      arHelpers.invoiceCustomerTotal for every invoice — the SQL and the
//      JavaScript are the same rule in two languages and must not part.
//   2. Names every invoice that structurally disagrees with its utility row
//      about the job, with the dollars involved. Those are real money and a
//      person's decision; nothing here resolves them.
//
// For the linkage and receivables invariants, see check-payer-split.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { invoiceCustomerTotal, totalCustomerAR, totalUtilityAR } from '../src/lib/arHelpers.js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)


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

// ── receivables as the books read them right now (for context) ─────────────
const ar = { customer: totalCustomerAR(invoices, payments), utility: totalUtilityAR(utilities) }
console.log('\n  RECEIVABLES')
console.log(`    customer  ${usd(ar.customer)}`)
console.log(`    utility   ${usd(ar.utility)}`)

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

console.log(`\n  ${plan.length} invoice(s) agree with their utility row · ${skipped.length} skipped · ${disputed.length} disputed`)
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

console.log('\n  AGREE')
for (const p of plan.slice(0, 6)) {
  console.log(`    ${p.invoice.invoice_id ?? p.invoice.id}  utility owes ${usd(p.utility_owes)}  customer owes ${usd(p.invoice.customer_owes)}  provider ${p.utility_provider_id ?? 'NONE'}`)
}
if (plan.length > 6) console.log(`    … and ${plan.length - 6} more`)

const noProvider = plan.filter((p) => p.utility_provider_id == null)
if (noProvider.length) {
  console.log(`\n  ${noProvider.length} row(s) have no provider match — the books cannot name who owes.`)
}

console.log('\n  (report only — the mirror trigger owns the columns; see check-payer-split for the invariants)\n')
process.exit(disputed.length || noProvider.length ? 1 : 0)
