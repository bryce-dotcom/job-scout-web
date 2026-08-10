// Estimates whose stored quote_amount does not match their own line items.
//
// Report only. --write needs --approve, because these numbers are what the
// pipeline, the dashboard and every rep's board read.
//
// Cause (fixed in EstimateDetail): the total was summed from the Zustand
// store, which after adding a line can hold only that line. EST 4567 is a
// $41,491 job written down to $500 the second a $500 out-of-scope fee was
// added.
//
//   npx vite-node scripts/repair-quote-amounts.mjs
//   npx vite-node scripts/repair-quote-amounts.mjs --write --approve

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
  console.log('\n  --write needs --approve too. These drive the pipeline and dashboard; refusing.\n')
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

const quotes = await page('quotes', 'id, quote_id, quote_amount, status, business_unit')
// quote_lines has no company_id — page it by hand.
const lines = []
for (let i = 0; ; i += 1000) {
  const { data, error } = await sb.from('quote_lines').select('quote_id, line_total, total, in_utility_scope').range(i, i + 999)
  if (error) throw new Error(`quote_lines: ${error.message}`)
  lines.push(...(data || []))
  if (!data || data.length < 1000) break
}

const byQuote = new Map()
for (const l of lines) {
  const k = String(l.quote_id)
  if (!byQuote.has(k)) byQuote.set(k, [])
  byQuote.get(k).push(l)
}

const rows = []
for (const q of quotes) {
  const ls = byQuote.get(String(q.id)) || []
  if (ls.length === 0) continue                 // nothing to reconcile against
  const sum = ls.reduce((s, l) => s + (Number(l.line_total ?? l.total) || 0), 0)
  if (sum <= 0) continue                        // unpriced lines — leave alone
  const stored = Number(q.quote_amount) || 0
  if (Math.abs(stored - sum) < 1) continue
  const outOfScope = ls.filter(l => l.in_utility_scope === false)
    .reduce((s, l) => s + (Number(l.line_total ?? l.total) || 0), 0)
  rows.push({ q, stored, sum, lines: ls.length, outOfScope, delta: sum - stored })
}

rows.sort((a, b) => b.delta - a.delta)
const under = rows.filter(r => r.delta > 0)
const over = rows.filter(r => r.delta < 0)

console.log(`\n${rows.length} estimates disagree with their own line items`)
console.log(`  understated: ${under.length}  ($${under.reduce((s, r) => s + r.delta, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} missing from the board)`)
console.log(`  overstated : ${over.length}  ($${Math.abs(over.reduce((s, r) => s + r.delta, 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })} too high)\n`)
console.log('  est     stored        lines      delta   n  smoking gun')
for (const r of rows.slice(0, 25)) {
  // stored == the out-of-scope total is the signature of the bug
  const gun = r.outOfScope > 0 && Math.abs(r.stored - r.outOfScope) < 1 ? 'stored == the out-of-scope fee' : ''
  console.log(`  ${String(r.q.id).padEnd(7)}$${String(r.stored.toFixed(0)).padStart(9)}  $${String(r.sum.toFixed(0)).padStart(9)}  ${(r.delta > 0 ? '+' : '') + r.delta.toFixed(0).padStart(9)}  ${String(r.lines).padStart(2)}  ${gun}`)
}
if (rows.length > 25) console.log(`  ... and ${rows.length - 25} more`)

if (WRITE) {
  console.log('')
  for (const r of rows) {
    const { error } = await sb.from('quotes')
      .update({ quote_amount: Math.round(r.sum * 100) / 100, updated_at: new Date().toISOString() })
      .eq('id', r.q.id).eq('company_id', 3)
    console.log(error ? `  FAILED ${r.q.id}: ${error.message}` : `  ${r.q.id}: $${r.stored.toFixed(0)} -> $${r.sum.toFixed(0)}`)
  }
  console.log('\n  Done. Every value now equals the sum of that estimate\'s own lines.\n')
} else {
  console.log('\n  Report only. Re-run with --write --approve to set each to its line sum.\n')
}
