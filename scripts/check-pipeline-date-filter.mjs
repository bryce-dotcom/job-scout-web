// How many OPEN-stage cards each date range keeps, now that open stages
// respect it by last activity. Read-only.
//
//   npx vite-node scripts/check-pipeline-date-filter.mjs

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

const leads = await page('leads', 'id, customer_name, status, created_at, updated_at, salesperson_id')
const quotes = await page('quotes', 'id, lead_id, updated_at, created_at')

const qByLead = new Map()
for (const q of quotes) {
  if (q.lead_id == null) continue
  const k = String(q.lead_id)
  if (!qByLead.has(k)) qByLead.set(k, [])
  qByLead.get(k).push(q)
}

const OPEN = ['New', 'Contacted', 'Appointment Set', 'Qualified', 'Quote Sent', 'Negotiation']
const open = leads.filter(l => OPEN.includes(l.status))

// Same cutoffs SalesPipeline.getDateCutoff produces.
const now = new Date()
const cutoffs = {
  mtd: new Date(now.getFullYear(), now.getMonth(), 1),
  ytd: new Date(now.getFullYear(), 0, 1),
  last30: new Date(now.getTime() - 30 * 86400000),
  last90: new Date(now.getTime() - 90 * 86400000),
  all: null,
}

const activityOf = (l) => [
  l.updated_at,
  ...(qByLead.get(String(l.id)) || []).flatMap(q => [q.updated_at, q.created_at]),
  l.created_at,
].filter(Boolean)

console.log(`\nOPEN-stage cards on the board: ${open.length}\n`)
console.log('range      kept   hidden   what a rep sees')
for (const [name, cut] of Object.entries(cutoffs)) {
  if (!cut) { console.log(`  ${name.padEnd(8)}${String(open.length).padStart(5)}${'0'.padStart(9)}   everything`); continue }
  const iso = cut.toISOString()
  const kept = open.filter(l => activityOf(l).some(d => d >= iso)).length
  console.log(`  ${name.padEnd(8)}${String(kept).padStart(5)}${String(open.length - kept).padStart(9)}   ${((kept / open.length) * 100).toFixed(0)}% of the board`)
}

// The point of the change: cards nobody has touched in a year.
const yearAgo = new Date(now.getTime() - 365 * 86400000).toISOString()
const dormant = open.filter(l => !activityOf(l).some(d => d >= yearAgo))
console.log(`\nuntouched for over a year: ${dormant.length}`)
const byStage = {}
for (const l of dormant) byStage[l.status] = (byStage[l.status] || 0) + 1
console.log('  ' + Object.entries(byStage).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '))
console.log('')
