// Utility incentives that have already landed in the bank but still read Pending.
//
// The utility (and its program administrator) pays the incentive by ACH, often
// weeks after the utility invoice is raised. Nothing links the deposit back to
// the invoice, so the money arrives and the invoice keeps saying Pending — the
// incentive stays in utility AR as if the utility still owed it.
//
// This matches on the exact amount, on or after the invoice date, and refuses
// anything ambiguous: if two pending invoices share an amount, or one deposit
// could serve two invoices, it reports and leaves them for a person. Money gets
// no benefit of the doubt.
//
//   npx vite-node scripts/match-incentive-payments.mjs
//   npx vite-node scripts/match-incentive-payments.mjs --write --approve

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
  console.log('\n  --write needs --approve too. This clears receivables; refusing.\n')
  process.exit(1)
}

const CENTS = 0.01

const { data: invoices, error: ie } = await sb.from('utility_invoices')
  .select('id, job_id, customer_name, business_unit, amount, incentive_amount, payment_status, paid_at, created_at, notes')
  .eq('company_id', 3)
if (ie) throw new Error(`utility_invoices: ${ie.message}`)

const tx = []
for (let i = 0; ; i += 1000) {
  const { data, error } = await sb.from('plaid_transactions')
    .select('id, name, amount, date, user_category, is_transfer')
    .eq('company_id', 3).range(i, i + 999)
  if (error) throw new Error(`plaid_transactions: ${error.message}`)
  tx.push(...(data || []))
  if (!data || data.length < 1000) break
}
// Plaid signs money IN as negative.
const deposits = tx.filter(t => parseFloat(t.amount) < 0 && !t.is_transfer)
  .map(t => ({ ...t, abs: Math.abs(parseFloat(t.amount)) }))

const pending = invoices.filter(u => String(u.payment_status || '').toLowerCase() !== 'paid')
const amountOf = (u) => Number(u.incentive_amount ?? u.amount) || 0

const matched = []
const ambiguous = []
const unpaid = []

for (const u of pending) {
  const amt = amountOf(u)
  if (amt <= 0) continue
  const on = String(u.created_at).slice(0, 10)
  const hits = deposits.filter(d => Math.abs(d.abs - amt) < CENTS && d.date >= on)
  // Another pending invoice for the same amount means a deposit cannot be
  // attributed to either one with confidence.
  const rivals = pending.filter(o => o.id !== u.id && Math.abs(amountOf(o) - amt) < CENTS)
  if (hits.length === 0) unpaid.push({ u, amt })
  else if (hits.length > 1 || rivals.length > 0) ambiguous.push({ u, amt, hits, rivals })
  else matched.push({ u, amt, d: hits[0] })
}

const money = (n) => '$' + n.toFixed(2).padStart(11)

console.log(`\n${pending.length} utility invoices are marked Pending\n`)
console.log(`ALREADY IN THE BANK (${matched.length}) — exact amount, on or after the invoice date:`)
matched.forEach(({ u, amt, d }) => console.log(
  `  inv ${String(u.id).padEnd(5)} ${money(amt)}  ${String(u.customer_name || '').slice(0, 26).padEnd(26)}` +
  ` paid ${d.date}  bank #${d.id}  ${String(d.name || '').slice(0, 34)}`))

if (ambiguous.length) {
  console.log(`\nAMBIGUOUS (${ambiguous.length}) — left for a person:`)
  ambiguous.forEach(({ u, amt, hits, rivals }) => console.log(
    `  inv ${String(u.id).padEnd(5)} ${money(amt)}  ${String(u.customer_name || '').slice(0, 26).padEnd(26)}` +
    ` ${hits.length} candidate deposit(s), ${rivals.length} other invoice(s) for the same amount`))
}

console.log(`\nSTILL GENUINELY OWED (${unpaid.length}, ${money(unpaid.reduce((s, x) => s + x.amt, 0)).trim()}):`)
unpaid.forEach(({ u, amt }) => console.log(
  `  inv ${String(u.id).padEnd(5)} ${money(amt)}  ${String(u.customer_name || '').slice(0, 26)}`))

if (WRITE) {
  console.log(`\n  marking ${matched.length} paid:`)
  for (const { u, d } of matched) {
    // Noon UTC, matching every existing paid row — a midnight stamp reads as the
    // previous day for anyone in Mountain time.
    const note = `${u.notes ? u.notes + '\n' : ''}Incentive received ${d.date} — bank txn #${d.id} (${String(d.name || '').slice(0, 60)}).`
    const { error } = await sb.from('utility_invoices')
      .update({ payment_status: 'Paid', paid_at: `${d.date}T12:00:00+00:00`, notes: note })
      .eq('id', u.id).eq('company_id', 3)
    console.log(error ? `  FAILED ${u.id}: ${error.message}` : `  inv ${u.id}  ${u.customer_name} -> Paid ${d.date}`)
  }
  console.log('\n  Done. Ambiguous and unpaid rows were not touched.\n')
} else {
  console.log('\n  Report only. --write --approve to mark the matched ones paid.\n')
}
