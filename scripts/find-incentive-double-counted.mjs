// Utility incentives recorded a second time as a payment on the customer invoice.
//
// Tracy: "Can you resolve the overpayment to this invoice summary? INV-MPR88I2B"
// and "Invoice summary for invoice #MQ4QEFM6 is showing a huge overpayment."
//
// Both are the same thing. The incentive already lives in two places by design:
// on the invoice as discount_applied (so the customer only owes the net), and on
// the utility invoice (so we can chase the utility for it). cashRevenue counts
// it from the utility invoice — "counts each dollar once".
//
// Entering it AGAIN as a payment on the customer invoice does two harms: the
// invoice reads as overpaid, and the money is counted twice in revenue.
//
//   npx vite-node scripts/find-incentive-double-counted.mjs
//   npx vite-node scripts/find-incentive-double-counted.mjs --write --approve

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isLegacyNetShape } from '../src/lib/arHelpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const WRITE = process.argv.includes('--write')
const APPROVE = process.argv.includes('--approve')
if (WRITE && !APPROVE) {
  console.log('\n  --write needs --approve too. This deletes payment records; refusing.\n')
  process.exit(1)
}
const page = async (t, s) => {
  const o = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(t).select(s).eq('company_id', 3).range(i, i + 999)
    if (error) throw new Error(`${t}: ${error.message}`)
    o.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return o
}

const invoices = await page('invoices', 'id, invoice_id, amount, discount_applied, payment_status, job_id, customer_id')
const payments = await page('payments', 'id, invoice_id, amount, date, method, source, notes')
const utilities = await page('utility_invoices', 'id, job_id, incentive_amount, amount, payment_status, paid_at, customer_name')

const utilByJob = new Map()
for (const u of utilities) if (u.job_id != null) utilByJob.set(String(u.job_id), u)
const payByInvoice = new Map()
for (const p of payments) {
  if (!payByInvoice.has(p.invoice_id)) payByInvoice.set(p.invoice_id, [])
  payByInvoice.get(p.invoice_id).push(p)
}

// A payment is the incentive in disguise when it matches the incentive on the
// SAME job to within a rounding cent or two. Tolerance is deliberately tight:
// $162,789.21 against $162,789.14 is the same money; anything looser starts
// deleting real customer payments.
const CENTS = 0.25
const found = []
for (const inv of invoices) {
  const util = inv.job_id != null ? utilByJob.get(String(inv.job_id)) : null
  if (!util) continue
  const incentive = Number(util.incentive_amount ?? util.amount) || 0
  if (!(incentive > 0)) continue
  const rows = payByInvoice.get(inv.id) || []
  for (const p of rows) {
    if (Math.abs(Number(p.amount) - incentive) > CENTS) continue
    const gross = Number(inv.amount) || 0
    const disc = Number(inv.discount_applied) || 0
    const owes = isLegacyNetShape(gross, disc) ? gross : Math.max(0, gross - disc)
    const paid = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
    found.push({ inv, payment: p, util, incentive, owes, paid, over: paid - owes })
  }
}

console.log(`\n${found.length} payments look like a utility incentive entered on the customer invoice\n`)
let revenue = 0
for (const f of found) {
  console.log(`  ${String(f.inv.invoice_id).padEnd(15)} owes $${f.owes.toFixed(2).padStart(11)}  paid $${f.paid.toFixed(2).padStart(11)}  over $${f.over.toFixed(2).padStart(11)}`)
  console.log(`      payment ${f.payment.id}: $${Number(f.payment.amount).toFixed(2)} ${f.payment.date} ${f.payment.method || ''} ${String(f.payment.notes || '').slice(0, 34)}`)
  console.log(`      utility invoice ${f.util.id}: incentive $${f.incentive.toFixed(2)}, ${f.util.payment_status}${f.util.paid_at ? ' ' + String(f.util.paid_at).slice(0, 10) : ''}`)
  if (f.util.payment_status === 'Paid') revenue += Number(f.payment.amount) || 0
}
console.log(`\n  counted twice in cash revenue (utility invoice already Paid): $${revenue.toFixed(2)}`)

if (!WRITE) {
  console.log('\n  Report only. --write --approve to remove the duplicate payments.\n')
  process.exit(0)
}

for (const f of found) {
  if (f.util.payment_status !== 'Paid') {
    console.log(`  SKIP ${f.inv.invoice_id}: its utility invoice is ${f.util.payment_status}, so the incentive is not recorded elsewhere yet`)
    continue
  }
  // A bank transaction may point at this payment (matched_payment_id is a
  // foreign key). Unmatch it first — the deposit is real and stays in the
  // ledger; it simply no longer claims to have paid the customer invoice.
  await sb.from('plaid_transactions')
    .update({ matched_payment_id: null, matched_invoice_id: null, matched_at: null })
    .eq('matched_payment_id', f.payment.id)
  const { error } = await sb.from('payments').delete().eq('id', f.payment.id).eq('company_id', 3)
  if (error) { console.log(`  FAILED ${f.payment.id}: ${error.message}`); continue }
  const remaining = (payByInvoice.get(f.inv.id) || []).filter(r => r.id !== f.payment.id)
    .reduce((s, r) => s + Number(r.amount || 0), 0)
  const status = remaining <= 0.01 ? 'Pending' : (remaining + 0.01 < f.owes ? 'Partially Paid' : 'Paid')
  await sb.from('invoices').update({ payment_status: status }).eq('id', f.inv.id).eq('company_id', 3)
  console.log(`  ${f.inv.invoice_id}: removed $${Number(f.payment.amount).toFixed(2)} — now $${remaining.toFixed(2)} of $${f.owes.toFixed(2)} (${status})`)
}
console.log('')
