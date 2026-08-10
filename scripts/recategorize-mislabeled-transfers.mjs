// The rows that said "Transfer" but are not transfers.
//
// When the category dropdown offered no honest option, "Transfer" got used as a
// catch-all for "don't count this". repair-transfer-flags.mjs flagged the real
// account moves; what is left is ordinary business activity wearing the wrong
// label — Home Depot refunds, a Domino's charge, and one ACH deposit that is a
// customer paying for several jobs at once.
//
// Nothing here is hardcoded. Each row is categorised the way THIS company has
// already categorised that same merchant, taken from its confirmed history, so
// a refund lands back on the account its purchase came out of. Rows whose
// merchant has no history are reported and left alone.
//
//   npx vite-node scripts/recategorize-mislabeled-transfers.mjs
//   npx vite-node scripts/recategorize-mislabeled-transfers.mjs --write --approve

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTransferCategory } from '../supabase/functions/_shared/transferRule.ts'

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
  console.log('\n  --write needs --approve too. This moves money into the P&L; refusing.\n')
  process.exit(1)
}

// How confident the merchant history has to be before it decides on its own.
const MIN_PEERS = 3
const MIN_SHARE = 0.6

const page = async () => {
  const out = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('plaid_transactions')
      .select('id, name, merchant_name, amount, date, confirmed, is_transfer, user_category, user_tax_category')
      .eq('company_id', 3).range(i, i + 999)
    if (error) throw new Error(`plaid_transactions: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const all = await page()
const stragglers = all.filter(t => isTransferCategory(t.user_category) && !t.is_transfer)

/** The merchant, as this bank writes it. Falls back to the description. */
const merchantOf = (t) => String(t.merchant_name || t.name || '').trim()

/** Longest sensible key first: a real merchant name, else the leading words of
 *  the description, which is how ACH deposits identify their payer. */
const keysFor = (t) => {
  const keys = []
  const m = String(t.merchant_name || '').trim()
  if (m) keys.push(m)
  const words = String(t.name || '').split(/\s+/).filter(Boolean)
  if (words.length >= 2) keys.push(words.slice(0, 2).join(' '))
  return keys
}

/** What this company already calls transactions like this one. */
const conventionFor = (t) => {
  for (const key of keysFor(t)) {
    const k = key.toLowerCase()
    const peers = all.filter(p => p.id !== t.id && p.user_category && !p.is_transfer
      && !isTransferCategory(p.user_category)
      && (String(p.merchant_name || '').toLowerCase().includes(k)
        || String(p.name || '').toLowerCase().includes(k)))
    if (peers.length < MIN_PEERS) continue
    const tally = {}
    for (const p of peers) {
      const kk = JSON.stringify([p.user_category, p.user_tax_category || null])
      tally[kk] = (tally[kk] || 0) + 1
    }
    const [best, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
    if (n / peers.length < MIN_SHARE) continue
    const [category, taxCategory] = JSON.parse(best)
    return { category, taxCategory, n, of: peers.length, key }
  }
  return null
}

const decided = []
const undecided = []
for (const t of stragglers) {
  const c = conventionFor(t)
  ;(c ? decided : undecided).push({ t, c })
}

const line = ({ t, c }) => {
  const a = parseFloat(t.amount) || 0
  return `  ${String(t.id).padStart(6)}  ${t.date}  ${a < 0 ? 'in  +' : 'out -'}$${Math.abs(a).toFixed(2).padStart(9)}  ` +
    `${merchantOf(t).slice(0, 26).padEnd(26)}${c ? `-> ${c.category} / ${c.taxCategory}  (${c.n} of ${c.of} past "${c.key}")` : '-> no history'}`
}

console.log(`\n${stragglers.length} rows still labelled "Transfer" that are not transfers\n`)
console.log(`THIS COMPANY ALREADY DECIDED THESE (${decided.length}) — using its own history:`)
decided.forEach(d => console.log(line(d)))
if (undecided.length) {
  console.log(`\nNO HISTORY TO GO ON (${undecided.length}) — left alone:`)
  undecided.forEach(d => console.log(line(d)))
}

if (WRITE) {
  console.log(`\n  recategorising ${decided.length}:`)
  for (const { t, c } of decided) {
    const { error } = await sb.from('plaid_transactions')
      .update({ user_category: c.category, user_tax_category: c.taxCategory, is_transfer: false })
      .eq('id', t.id).eq('company_id', 3)
    console.log(error ? `  FAILED ${t.id}: ${error.message}` : `  ${t.id}  ${merchantOf(t).slice(0, 24).padEnd(24)} -> ${c.category}`)
  }
  console.log('\n  Done. Rows with no history were not touched.\n')
} else {
  console.log('\n  Report only. --write --approve to apply.\n')
}
