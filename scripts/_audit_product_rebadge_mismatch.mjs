// Sweep every active job_line and recent quote_line whose snapshotted
// item_name disagrees significantly with the CURRENT product name.
// That's the signature of a product-rebadging bug: the row was renamed
// in place after the line was created, so the field crew sees one thing
// in the snapshot and a different thing when they look up the product.
//
// "Significantly" = a token like "8ft", "4ft", "60W", "MES", "SMBE",
// "LEDONE" appears in one but not the other. Pure word-order / casing
// changes are ignored.
//
// Output: a CSV-style report of mismatches grouped by underlying product.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const HHH = 3
const TOKENS = [
  // dimensions
  /\b4\s*['ft]/i, /\b8\s*['ft]/i, /\b2\s*['ft]/i, /\b6\s*['ft]/i,
  // common watt callouts (just the number-W is enough)
  /\b15W\b/i, /\b18W\b/i, /\b24W\b/i, /\b32W\b/i, /\b40W\b/i, /\b50W\b/i, /\b53W\b/i,
  /\b60W\b/i, /\b64W\b/i, /\b68W\b/i, /\b70W\b/i, /\b75W\b/i, /\b80W\b/i, /\b90W\b/i,
  /\b100W\b/i, /\b110W\b/i, /\b150W\b/i, /\b180W\b/i, /\b200W\b/i, /\b220W\b/i,
  // brands
  /\bMES\b/i, /\bSMBE\b/i, /\bLEDONE\b/i, /\bLED ONE\b/i,
  // fixture family
  /\bhighbay\b/i, /\bhigh bay\b/i, /\bwall pack\b/i, /\bwallpack\b/i,
  /\barea light\b/i, /\bcanopy\b/i, /\bflood\b/i,
  /\bstrip\b/i, /\bpanel\b/i, /\btroffer\b/i, /\bwrap\b/i,
]

function tokenSet(s) {
  const out = new Set()
  if (!s) return out
  for (const re of TOKENS) {
    const m = String(s).match(re)
    if (m) out.add(m[0].toUpperCase().replace(/\s+/g, ''))
  }
  return out
}

function mismatch(snapshotName, currentName) {
  const a = tokenSet(snapshotName)
  const b = tokenSet(currentName)
  const inAOnly = [...a].filter(t => !b.has(t))
  const inBOnly = [...b].filter(t => !a.has(t))
  return { aOnly: inAOnly, bOnly: inBOnly, count: inAOnly.length + inBOnly.length }
}

// Build product name cache
const { data: prods } = await sb.from('products_services').select('id, name, active').eq('company_id', HHH)
const nameById = new Map(prods.map(p => [p.id, p.name]))

console.log('=== Audit job_lines (all jobs not Closed/Done) ===')
const { data: jobs } = await sb.from('jobs').select('id, status').eq('company_id', HHH).not('status', 'in', '("Done","Closed","Cancelled")')
const jobIds = jobs.map(j => j.id)
console.log('  Active jobs:', jobIds.length)

// Pull job_lines in chunks
let allJobLines = []
const CHUNK = 200
for (let i = 0; i < jobIds.length; i += CHUNK) {
  const chunk = jobIds.slice(i, i + CHUNK)
  const { data: jl } = await sb.from('job_lines').select('id, job_id, item_id, item_name, quantity, price').in('job_id', chunk).not('item_id', 'is', null)
  if (jl) allJobLines.push(...jl)
}
console.log('  Job_lines with item_id:', allJobLines.length)

const jobMismatches = []
for (const l of allJobLines) {
  const cur = nameById.get(l.item_id)
  if (!cur || !l.item_name) continue // no snapshot or no current = can't compare
  const m = mismatch(l.item_name, cur)
  if (m.count >= 2 || (m.aOnly.length && m.bOnly.length)) {
    jobMismatches.push({ jobId: l.job_id, jobLineId: l.id, itemId: l.item_id, snapshot: l.item_name, current: cur, qty: l.quantity, price: l.price, diff: m })
  }
}

console.log('\\n=== Job_line mismatches:', jobMismatches.length, '===')
for (const m of jobMismatches.slice(0, 50)) {
  console.log(`  job ${m.jobId} | line ${m.jobLineId} | item_id ${m.itemId} | qty ${m.qty}@$${m.price}`)
  console.log(`    snapshot: ${m.snapshot}`)
  console.log(`    current:  ${m.current}`)
  console.log(`    snapshot-only tokens: ${m.diff.aOnly.join(',')}`)
  console.log(`    current-only tokens:  ${m.diff.bOnly.join(',')}`)
}

// Same for unconverted quote_lines created in last 90 days
console.log('\\n=== Audit recent quote_lines (last 90 days, Approved/Draft/Sent quotes only) ===')
const cutoff = new Date(Date.now() - 90*24*60*60*1000).toISOString()
const { data: openQuotes } = await sb.from('quotes').select('id, status').eq('company_id', HHH).in('status', ['Approved','Draft','Sent','Pending'])
const openQuoteIds = openQuotes.map(q => q.id)
let allQuoteLines = []
for (let i = 0; i < openQuoteIds.length; i += CHUNK) {
  const chunk = openQuoteIds.slice(i, i + CHUNK)
  const { data: ql } = await sb.from('quote_lines').select('id, quote_id, item_id, item_name, quantity, price, created_at').in('quote_id', chunk).gte('created_at', cutoff).not('item_id', 'is', null)
  if (ql) allQuoteLines.push(...ql)
}
console.log('  Quote_lines:', allQuoteLines.length)

const qlMismatches = []
for (const l of allQuoteLines) {
  const cur = nameById.get(l.item_id)
  if (!cur || !l.item_name) continue
  const m = mismatch(l.item_name, cur)
  if (m.count >= 2 || (m.aOnly.length && m.bOnly.length)) {
    qlMismatches.push({ quoteId: l.quote_id, quoteLineId: l.id, itemId: l.item_id, snapshot: l.item_name, current: cur, qty: l.quantity, price: l.price, diff: m })
  }
}

console.log('\\n=== Quote_line mismatches:', qlMismatches.length, '===')
for (const m of qlMismatches.slice(0, 50)) {
  console.log(`  quote ${m.quoteId} | line ${m.quoteLineId} | item_id ${m.itemId} | qty ${m.qty}@$${m.price}`)
  console.log(`    snapshot: ${m.snapshot}`)
  console.log(`    current:  ${m.current}`)
}

const fs = await import('node:fs')
fs.writeFileSync('./scripts/_audit_product_rebadge_log.json', JSON.stringify({ jobMismatches, qlMismatches, ranAt: new Date().toISOString() }, null, 2))
console.log(`\\nFull report written to ./scripts/_audit_product_rebadge_log.json`)
console.log(`Total job_line mismatches: ${jobMismatches.length}`)
console.log(`Total quote_line mismatches: ${qlMismatches.length}`)
