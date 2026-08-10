// Transactions someone categorised "Transfer" that were never flagged as one.
//
// Reports read is_transfer and nothing else. The category dropdown wrote the
// STRING 'Transfer' and left the flag false, so these rows counted as real
// money in revenue, expenses, the P&L, the dashboard and Frankie's brief.
// (Fixed going forward in _shared/transferRule.ts — both controls now resolve
// to the same field.)
//
// Report only. --write needs --approve AND --ids, because "Transfer" was also
// used as a catch-all for anything that shouldn't count — there are Home Depot
// refunds and a Domino's charge in here, and flagging those would hide real
// spending instead of fixing it. A person decides.
//
//   npx vite-node scripts/repair-transfer-flags.mjs
//   npx vite-node scripts/repair-transfer-flags.mjs --write --approve --ids 1,2,3
//   npx vite-node scripts/repair-transfer-flags.mjs --write --approve --ids clear

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
const idsArg = process.argv.indexOf('--ids')
const IDS_RAW = idsArg >= 0 ? String(process.argv[idsArg + 1] || '') : ''

if (WRITE && !APPROVE) {
  console.log('\n  --write needs --approve too. This moves money in and out of the P&L; refusing.\n')
  process.exit(1)
}
if (WRITE && !IDS_RAW) {
  console.log('\n  --write needs --ids (a list, or the word "clear" for the unambiguous ones only).\n')
  process.exit(1)
}

// Bank wording for moving money between accounts you already own. Deliberately
// narrow: it must name an account or say "transfer", not merely look odd.
const INTERNAL = [
  /\b(from|to)\s+share\s*\d+/i,          // From Share 50, To Share 58
  /\btransfer\s+(from|to)\b/i,           // Transfer from Home 231
  /\bhome\s*banking\b.*\btransfer\b/i,   // Home Banking Withdrawal Transfer To S0050
  /\bstripe\s+payout\b/i,                // Stripe settling into checking
  /\bpayment\s+to\s+(chase|amex|capital\s*one|discover|visa|mastercard)\b/i,  // card payoff
]

const page = async () => {
  const out = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('plaid_transactions')
      .select('id, name, merchant_name, amount, date, confirmed, is_transfer, user_category, ai_category')
      .eq('company_id', 3).range(i, i + 999)
    if (error) throw new Error(`plaid_transactions: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const all = await page()
const rows = all.filter(t =>
  (isTransferCategory(t.user_category) || isTransferCategory(t.ai_category)) && !t.is_transfer)

const describe = (t) => `${t.name || ''} ${t.merchant_name || ''}`.trim()
const clear = rows.filter(t => INTERNAL.some(re => re.test(describe(t))))
const unclear = rows.filter(t => !INTERNAL.some(re => re.test(describe(t))))
const money = (rs) => rs.reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0)

const show = (t) => {
  const a = parseFloat(t.amount) || 0
  return `  ${String(t.id).padStart(7)}  ${t.date}  ${(a < 0 ? '+' : '-')}$${Math.abs(a).toFixed(2).padStart(9)}  ${describe(t).slice(0, 46)}`
}

console.log(`\n${rows.length} transactions say "Transfer" but were never flagged as one`)
console.log(`  they are counted as real money everywhere: $${money(rows).toFixed(2)} total\n`)
console.log(`UNAMBIGUOUS — the bank itself names an account move (${clear.length}, $${money(clear).toFixed(2)})`)
clear.forEach(t => console.log(show(t)))
console.log(`\nNEEDS A HUMAN (${unclear.length}, $${money(unclear).toFixed(2)})`)
console.log('  "Transfer" got used as a catch-all for "don\'t count this". A refund at')
console.log('  Home Depot is not a transfer — it belongs in the books, reducing that')
console.log('  expense. Flagging it would hide real spending.')
unclear.forEach(t => console.log(show(t)))

if (WRITE) {
  const targets = IDS_RAW === 'clear'
    ? clear
    : rows.filter(t => IDS_RAW.split(',').map(s => Number(s.trim())).filter(Boolean).includes(t.id))
  console.log(`\n  flagging ${targets.length} of ${rows.length} reported:`)
  for (const t of targets) {
    // Same shape the app now writes: the flag on, the categories cleared so the
    // row cannot re-enter the P&L through a category filter.
    const { error } = await sb.from('plaid_transactions')
      .update({ is_transfer: true, user_category: null, user_tax_category: null })
      .eq('id', t.id).eq('company_id', 3)
    console.log(error ? `  FAILED ${t.id}: ${error.message}` : `  ${t.id}  ${t.date}  ${describe(t).slice(0, 40)}`)
  }
  console.log('\n  Done. Only the named rows were touched.\n')
} else {
  console.log('\n  Report only. --write --approve --ids <list|clear> to flag them.\n')
}
