// Bring existing invoice pairs back in line with their job.
//
// Report-only unless --write. Uses lib/invoiceReconcile — the same rule the
// JobDetail incentive field now applies on edit — so the repair and the app
// can never disagree.
//
// Skips PAID and VOID documents: that money is settled and rewriting a settled
// document is how a ledger stops matching the bank. Flags already-sent
// invoices separately, because correcting one means resending it.
//
//   node scripts/repair-invoice-ar.mjs
//   node scripts/repair-invoice-ar.mjs --write --approve

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reconcileInvoicePair, arReconciles } from '../src/lib/invoiceReconcile.js'
import { downPaymentEffect } from '../src/lib/downPayment.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const COMPANY_ID = 3
const WRITE = process.argv.includes('--write')
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`

async function all(table, select) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select)
      .eq('company_id', COMPANY_ID).order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

const [jobs, invoices, utilities, lines] = await Promise.all([
  all('jobs', 'id, job_id, job_total, utility_incentive, down_payment_amount, down_payment_funded_by'),
  all('invoices', 'id, invoice_id, job_id, amount, discount_applied, invoice_type, payment_status, last_sent_at'),
  all('utility_invoices', 'id, job_id, amount, incentive_amount, project_cost, net_cost, payment_status'),
  all('invoice_lines', 'invoice_id, line_total'),
])
const linesByInvoice = new Map()
for (const l of lines) {
  if (!linesByInvoice.has(l.invoice_id)) linesByInvoice.set(l.invoice_id, [])
  linesByInvoice.get(l.invoice_id).push(l)
}
const settled = (s) => s === 'Paid' || s === 'Void' || s === 'Cancelled'

const plans = []
const duplicates = []
const needsReview = []
for (const job of jobs) {
  const jobInvoices = invoices.filter(i => i.job_id === job.id && i.invoice_type !== 'deposit' && !settled(i.payment_status))
  const jobUtilities = utilities.filter(u => u.job_id === job.id && !settled(u.payment_status))
  if (!jobInvoices.length && !jobUtilities.length) continue

  // More than one live customer invoice on a job is a duplicate, not a drift.
  // Never guess which to void — that is a business decision.
  if (jobInvoices.length > 1) {
    duplicates.push({ job, invoices: jobInvoices })
    continue
  }

  const invoice = jobInvoices[0] || null
  const utility = jobUtilities[0] || null
  const incentive = Number(job.utility_incentive) || 0
  const res = reconcileInvoicePair({
    invoice, lines: linesByInvoice.get(invoice?.id) || [], utilityInvoice: utility, incentive,
  })
  if (!res.changed) continue

  // Only propose a write that actually ACHIEVES the invariant. A "fix" that
  // leaves AR still disagreeing with the job total is not a fix — it just
  // moves the wrong number somewhere else, and on a first dry run several of
  // these made AR far worse. Anything that doesn't land exactly goes to a
  // review list for a human instead.
  // A job with no total gives nothing to verify against, so it cannot be
  // auto-repaired either — JOB-MMTJN98Y would otherwise have had $11,285 of
  // AR written against a $0 job.
  //
  // A down payment is NOT receivable from anyone: if the customer paid it the
  // money is already in, and if JobScout covered it it is a discount. Either
  // way it comes off the expected AR, or every job carrying one looks broken.
  const dp = downPaymentEffect(job)
  const target = Math.max(0, (Number(job.job_total) || 0) - dp.customerCredit)
  if (target <= 0 || Math.abs(res.after.ar - target) > 0.01) {
    needsReview.push({ job, invoice, utility, res, target })
    continue
  }
  plans.push({ job, invoice, utility, res })
}

console.log(`\n  ${plans.length} job(s) whose invoices have drifted from the job.\n`)
console.log('  job              AR now        AR after     job total     what changes')
console.log('  ' + '-'.repeat(96))
for (const p of plans) {
  const check = arReconciles({ invoice: p.invoice, utilityInvoice: p.utility, expected: p.job.job_total })
  const bits = []
  if (p.res.invoicePatch) bits.push(`inv ${p.invoice.invoice_id}: amount→${money(p.res.invoicePatch.amount)}, deduction→${money(p.res.invoicePatch.discount_applied)}`)
  if (p.res.utilityPatch) bits.push(`utility→${money(p.res.utilityPatch.amount)}`)
  if (p.invoice?.last_sent_at) bits.push('ALREADY SENT — needs resending')
  console.log('  ' + String(p.job.job_id).padEnd(16),
    money(check.ar).padStart(12), money(p.res.after.ar).padStart(13),
    money(p.job.job_total).padStart(13), '  ' + bits.join(' · '))
}

if (needsReview.length) {
  console.log(`\n  ${needsReview.length} job(s) where no automatic change reconciles — NOT touched:`)
  for (const r of needsReview) {
    const why = r.res.legacyCustomer ? 'legacy net-shape invoice (amount already net)'
      : r.target <= 0 ? 'job has no total to verify against'
      : 'job total disagrees with the documents'
    console.log(`    ${String(r.job.job_id).padEnd(16)} job total ${money(r.target).padStart(12)}  best AR ${money(r.res.after.ar).padStart(12)}  — ${why}`)
  }
}

if (duplicates.length) {
  console.log(`\n  ${duplicates.length} job(s) with MORE THAN ONE live customer invoice — not touched, needs a human:`)
  for (const d of duplicates) {
    console.log(`    ${d.job.job_id}  (job total ${money(d.job.job_total)})`)
    for (const i of d.invoices) {
      const n = (linesByInvoice.get(i.id) || []).length
      console.log(`      ${i.invoice_id.padEnd(17)} amount ${money(i.amount).padStart(12)}  deduction ${money(i.discount_applied).padStart(12)}  ${String(n).padStart(2)} lines  ${i.payment_status}${i.last_sent_at ? '  SENT' : ''}`)
    }
  }
}

if (!WRITE) {
  console.log('\n  Report only. Re-run with --write --approve to apply the drift fixes above.\n')
  process.exit(0)
}
if (!process.argv.includes('--approve')) {
  console.log('\n  --write needs --approve too. These are invoices; refusing.\n')
  process.exit(1)
}

for (const p of plans) {
  if (p.res.invoicePatch) {
    const { error } = await sb.from('invoices')
      .update({ ...p.res.invoicePatch, updated_at: new Date().toISOString() }).eq('id', p.invoice.id)
    console.log(error ? `  FAILED ${p.invoice.invoice_id}: ${error.message}` : `  updated ${p.invoice.invoice_id}`)
  }
  if (p.res.utilityPatch) {
    const { error } = await sb.from('utility_invoices')
      .update({ ...p.res.utilityPatch, updated_at: new Date().toISOString() }).eq('id', p.utility.id)
    console.log(error ? `  FAILED utility ${p.utility.id}: ${error.message}` : `  updated utility invoice ${p.utility.id}`)
  }
}
console.log('\n  Done. Duplicates above were deliberately left alone.\n')
