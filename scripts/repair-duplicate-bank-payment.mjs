// A bank deposit recorded a second time on the wrong invoice.
//
// Tracy: "INV-MSG82SG7 has a payment attached to it that was for $14,537. This
// was a check that went to INV-MR0TWWLN for Seven Skies. For some reason our
// system automatched to the wrong account."
//
// The check was entered by hand when it arrived, correctly, on Seven Skies.
// When the deposit reached the bank weeks later, the match list excluded any
// invoice already marked Paid — so Seven Skies was not offered and the closest
// OPEN invoice, Ryan Kimball's at $10.03 away, took it. The same money is now
// on two invoices.
//
// This finds bank-match payments that duplicate a hand-entered payment of the
// same amount and date on a DIFFERENT invoice, and repoints the bank row at
// the payment that was already right — deleting the duplicate rather than
// leaving money on a customer who never sent it.
//
//   npx vite-node scripts/repair-duplicate-bank-payment.mjs
//   npx vite-node scripts/repair-duplicate-bank-payment.mjs --write --approve

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
const APPROVE = process.argv.includes('--approve')
if (WRITE && !APPROVE) {
  console.log('\n  --write needs --approve too. This deletes a payment record; refusing.\n')
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

const payments = await page('payments', 'id, invoice_id, amount, date, method, source, source_transaction_id')
const invoices = await page('invoices', 'id, invoice_id, amount, discount_applied, payment_status, customer_id')
const invById = new Map(invoices.map(i => [i.id, i]))

const bank = payments.filter(p => p.source === 'bank_match')
const found = []
for (const b of bank) {
  const twin = payments.find(p =>
    p.id !== b.id &&
    p.source !== 'bank_match' &&
    p.invoice_id !== b.invoice_id &&
    p.date === b.date &&
    Math.abs(Number(p.amount) - Number(b.amount)) < 0.01)
  if (twin) found.push({ bank: b, original: twin })
}

console.log(`\n${bank.length} bank-matched payments; ${found.length} duplicate money already recorded elsewhere\n`)
for (const { bank: b, original } of found) {
  const wrong = invById.get(b.invoice_id)
  const right = invById.get(original.invoice_id)
  console.log(`  $${Number(b.amount).toFixed(2)} on ${b.date}`)
  console.log(`    recorded correctly : ${right?.invoice_id} (payment ${original.id}, ${original.method || 'manual'})`)
  console.log(`    duplicated onto    : ${wrong?.invoice_id} (payment ${b.id}, from bank txn ${b.source_transaction_id})`)
  console.log(`    ${wrong?.invoice_id} currently reads ${wrong?.payment_status}`)
}

if (!WRITE) {
  console.log('\n  Report only. --write --approve to remove the duplicate and link the deposit to the original.\n')
  process.exit(0)
}

for (const { bank: b, original } of found) {
  // 1) the bank row points at the payment that was already right
  const { error: txnErr } = await sb.from('plaid_transactions')
    .update({ matched_invoice_id: original.invoice_id, matched_payment_id: original.id, matched_at: new Date().toISOString() })
    .eq('id', b.source_transaction_id)
  if (txnErr) { console.log(`  FAILED txn ${b.source_transaction_id}: ${txnErr.message}`); continue }

  // 2) the original payment records which deposit settled it
  await sb.from('payments').update({ source_transaction_id: b.source_transaction_id }).eq('id', original.id)

  // 3) the duplicate goes — the customer never sent this money
  const { error: delErr } = await sb.from('payments').delete().eq('id', b.id).eq('company_id', 3)
  if (delErr) { console.log(`  FAILED deleting payment ${b.id}: ${delErr.message}`); continue }

  // 4) the invoice it was wrongly on is no longer paid by it
  const wrong = invById.get(b.invoice_id)
  const remaining = payments.filter(p => p.invoice_id === b.invoice_id && p.id !== b.id)
    .reduce((s, p) => s + Number(p.amount || 0), 0)
  const gross = Number(wrong?.amount) || 0
  const disc = Number(wrong?.discount_applied) || 0
  const owes = disc > gross ? gross : Math.max(0, gross - disc)
  const status = remaining <= 0.01 ? 'Pending' : (remaining + 0.01 < owes ? 'Partially Paid' : 'Paid')
  await sb.from('invoices').update({ payment_status: status }).eq('id', b.invoice_id).eq('company_id', 3)
  console.log(`  $${Number(b.amount).toFixed(2)}: removed from ${wrong?.invoice_id} (now ${status}), deposit linked to payment ${original.id}`)
}
console.log('')
