// Void duplicate customer invoices that are inflating AR.
//
// Report-only unless --write --approve. Each decision is named explicitly
// below rather than inferred, because voiding an invoice is a business action
// and "probably the newer one" is not a good enough reason to touch money.
//
// Measured before this ran: 4 jobs carried more than one money-carrying open
// customer invoice, overstating AR by $128,707.71.
//
// Rules applied to pick the duplicate:
//   - never voids an invoice that has been SENT while an unsent alternative
//     exists (the customer has the sent one)
//   - never voids an invoice that has payments against it
//   - prefers voiding the copy with NO line items, since it documents nothing
//   - requires the survivor to reconcile against the job
//
// 8747 is deliberately excluded: both of its invoices were sent, both have no
// lines, and together they exceed the job total. That is either phased billing
// or a real error, and only a human knows which.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const WRITE = process.argv.includes('--write')
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`

// invoice_id -> why it is the duplicate. Explicit on purpose.
const TO_VOID = {
  'INV-MQ5HAVMP': 'JOB-MP2WMEBT — no line items, never sent, re-bills the full $56,450 project that INV-MQ4QEFM6 already covers (that one is settled)',
  'INV-MRCLC8V4': 'JOB-MOJ71Y1R — carries no incentive deduction and exceeds the job total; INV-MR2GMCF9 plus the utility invoice equal the job total exactly',
  'INV-MSG82SG7': 'JOB-MRUVH1Q1 — identical copy of INV-MSG82KFQ created the same day; the other one was sent, this was not',
}

const { data: invoices, error } = await sb.from('invoices')
  .select('id, invoice_id, job_id, amount, discount_applied, payment_status, last_sent_at')
  .eq('company_id', 3).in('invoice_id', Object.keys(TO_VOID))
if (error) { console.log('read failed:', error.message); process.exit(1) }

const { data: pays } = await sb.from('payments')
  .select('invoice_id, amount').in('invoice_id', invoices.map(i => i.id))
const paid = new Map()
for (const p of pays || []) paid.set(p.invoice_id, (paid.get(p.invoice_id) || 0) + (Number(p.amount) || 0))

console.log(`\n  ${invoices.length} invoice(s) to void:\n`)
const safe = []
for (const inv of invoices) {
  const gross = Number(inv.amount) || 0
  const disc = Number(inv.discount_applied) || 0
  const customer = disc > gross ? gross : Math.max(0, gross - disc)
  const collected = paid.get(inv.id) || 0

  // Refuse anything with money against it, whatever the list says.
  const blocked = collected > 0 ? `has ${money(collected)} in payments`
    : inv.payment_status === 'Paid' ? 'already Paid'
    : inv.payment_status === 'Void' ? 'already Void'
    : null

  console.log(`  ${inv.invoice_id.padEnd(16)} balance ${money(customer).padStart(12)}  ${inv.payment_status}${inv.last_sent_at ? '  SENT' : ''}`)
  console.log(`      ${TO_VOID[inv.invoice_id]}`)
  if (blocked) console.log(`      SKIPPED — ${blocked}`)
  else safe.push({ inv, customer })
  console.log('')
}
console.log(`  AR removed if applied: ${money(safe.reduce((s, x) => s + x.customer, 0))}`)
console.log('  Left alone: 8747 — both invoices sent, both without lines, together over the job total.\n')

if (!WRITE) { console.log('  Report only. Re-run with --write --approve to apply.\n'); process.exit(0) }
if (!process.argv.includes('--approve')) { console.log('  --write needs --approve too. Refusing.\n'); process.exit(1) }

for (const { inv } of safe) {
  const { error: e } = await sb.from('invoices').update({
    payment_status: 'Void',
    notes: `Voided as a duplicate: ${TO_VOID[inv.invoice_id]}`,
    updated_at: new Date().toISOString(),
  }).eq('id', inv.id)
  console.log(e ? `  FAILED ${inv.invoice_id}: ${e.message}` : `  voided ${inv.invoice_id}`)
}
console.log('\n  Reversible: set payment_status back to Pending to restore any of these.\n')
