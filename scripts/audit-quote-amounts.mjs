// How many quotes have a stored quote_amount that disagrees with their own
// line items? EST-MOUH4ST4 stores $732,220.44 against $111,405.64 of lines.
// Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3
const money = n => '$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})

async function all(table, select, extra = q => q) {
  const out = []
  for (let f = 0; ; f += 1000) {
    let q = sb.from(table).select(select).order('id').range(f, f + 999)
    q = extra(q)
    const { data, error } = await q
    if (error) { console.log(table, error.message); break }
    out.push(...(data || [])); if (!data || data.length < 1000) break
  }
  return out
}

const quotes = await all('quotes', 'id, quote_id, lead_id, quote_amount, status, created_at', q => q.eq('company_id', CO))
const lines = await all('quote_lines', 'id, quote_id, quantity, price, line_total, total')

const byQuote = new Map()
for (const l of lines) {
  // quote_lines has BOTH line_total and total; total is null on most rows.
  // Summing only total reported every quote as $0 of lines.
  const t = Number(l.line_total ?? l.total ?? 0) || 0
  byQuote.set(l.quote_id, (byQuote.get(l.quote_id) || 0) + t)
}

const withLines = quotes.filter(q => byQuote.has(q.id))
let match = 0
const bad = []
for (const q of withLines) {
  const lineSum = byQuote.get(q.id)
  const stored = Number(q.quote_amount) || 0
  if (Math.abs(stored - lineSum) < 0.02) { match++; continue }
  bad.push({ q, lineSum, stored, delta: stored - lineSum })
}

console.log(`quotes: ${quotes.length}   with line items: ${withLines.length}`)
console.log(`  stored amount MATCHES their lines: ${match}`)
console.log(`  stored amount DISAGREES:           ${bad.length}`)
const over = bad.filter(b => b.delta > 0), under = bad.filter(b => b.delta < 0)
console.log(`     overstated: ${over.length}   by ${money(over.reduce((s,b)=>s+b.delta,0))}`)
console.log(`     understated:${under.length}   by ${money(under.reduce((s,b)=>s+b.delta,0))}`)

console.log('\nWorst 15 overstatements — these inflate every pipeline total:')
for (const b of bad.sort((a,c)=>c.delta-a.delta).slice(0,15)) {
  console.log(`  ${String(b.q.quote_id).padEnd(16)} stored ${money(b.stored).padStart(14)}   lines ${money(b.lineSum).padStart(14)}   off by ${money(b.delta).padStart(14)}   ${b.q.status||''}`)
}

// Open (not lost/rejected) ones matter most — they're on the board now.
const openBad = bad.filter(b => !/reject|lost|void/i.test(b.q.status || ''))
console.log(`\nOpen quotes with a wrong stored amount: ${openBad.length}`)
console.log(`  total overstatement sitting on the board: ${money(openBad.filter(b=>b.delta>0).reduce((s,b)=>s+b.delta,0))}`)
