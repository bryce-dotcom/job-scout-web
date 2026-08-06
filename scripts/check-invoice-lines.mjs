// Print exactly what the invoice PDF will show for a job, from the SAME
// breakout function the PDF renders with. Verification, not assumption —
// the down payment printed inside the utility incentive for five rounds
// because each fix was checked by reading code instead of output.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invoiceDiscountBreakout } from '../src/lib/invoiceSections.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const JOB = process.argv.find(a => a.startsWith('JOB-')) || 'JOB-MQZGV1FN'
const fmt = n => '$' + Number(n || 0).toFixed(2)

const { data: job } = await sb.from('jobs')
  .select('id, job_id, job_total, utility_incentive, down_payment_amount, down_payment_funded_by')
  .eq('company_id', 3).eq('job_id', JOB).maybeSingle()
if (!job) { console.log('no job ' + JOB); process.exit(1) }

const { data: invs } = await sb.from('invoices')
  .select('id, invoice_id, amount, discount_applied, project_discount, down_payment_applied, payment_status')
  .eq('job_id', job.id).neq('payment_status', 'Void').order('created_at')

console.log(`\n  ${job.job_id}: total ${fmt(job.job_total)}, incentive ${fmt(job.utility_incentive)}, down payment ${fmt(job.down_payment_amount)} (${job.down_payment_funded_by})`)

for (const inv of invs || []) {
  // Invoices raised before the breakout column existed carry the down payment
  // silently inside discount_applied; record it so the document can name it.
  if (Number(job.down_payment_amount) > 0 && inv.down_payment_applied == null) {
    await sb.from('invoices').update({ down_payment_applied: job.down_payment_amount }).eq('id', inv.id)
    inv.down_payment_applied = job.down_payment_amount
    console.log(`\n  (backfilled down_payment_applied on ${inv.invoice_id})`)
  }
  const b = invoiceDiscountBreakout(inv, null)
  const net = Math.max(0, Number(inv.amount) - Number(inv.discount_applied || 0))
  console.log(`\n  ${inv.invoice_id} — what the PDF prints:`)
  console.log('    Subtotal:            ' + fmt(inv.amount).padStart(12))
  if (b.projectDiscountField > 0) console.log('    Project Discount:   -' + fmt(b.projectDiscountField).padStart(12))
  console.log('    Utility Incentive:  -' + fmt(b.incentive).padStart(12))
  if (b.downPayment > 0) console.log('    Down Payment:       -' + fmt(b.downPayment).padStart(12))
  console.log('    Balance Due:         ' + fmt(net).padStart(12))
  const sum = Number(inv.amount) - b.incentive - b.downPayment - b.projectDiscountField - b.depositCredit
  console.log('    incentive == job incentive: ' + (Math.abs(b.incentive - Number(job.utility_incentive)) < 0.01))
  console.log('    lines reconcile to balance: ' + (Math.abs(sum - net) < 0.01))
}
