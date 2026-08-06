// Which leads does the pipeline show, before vs after the Draft fallback?
// Read-only.
//
//   npx vite-node scripts/check-pipeline-visibility.mjs

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

const quotes = await page('quotes', 'id, quote_id, status, quote_amount, lead_id')
const leads = await page('leads', 'id, customer_name, status')

// Mirrors SalesPipeline: these are the only quote statuses that make a card.
const QUOTE_STATUS_MAP = { 'Quote Sent': 'Sent', Negotiation: 'Negotiation', Won: 'Approved', Lost: 'Rejected' }
const STAGED = new Set(Object.values(QUOTE_STATUS_MAP))
const PRE_ESTIMATE = ['New', 'Contacted', 'Appointment Set', 'Qualified']
const STAGES = [...PRE_ESTIMATE, ...Object.keys(QUOTE_STATUS_MAP)]

const byLead = new Map()
for (const q of quotes) {
  if (q.lead_id == null) continue
  const k = String(q.lead_id)
  if (!byLead.has(k)) byLead.set(k, [])
  byLead.get(k).push(q)
}

// Count cards a stage produces, under the old rule and the new one.
const run = (useNewFallback) => {
  const perStage = {}
  for (const stage of STAGES) {
    let n = 0
    for (const lead of leads) {
      const qs = byLead.get(String(lead.id)) || []
      if (PRE_ESTIMATE.includes(stage)) { if (lead.status === stage) n += 1; continue }
      const wanted = QUOTE_STATUS_MAP[stage]
      const fallback = useNewFallback ? !qs.some(q => STAGED.has(q.status)) : qs.length === 0
      if (fallback) { if (lead.status === stage) n += 1; continue }
      n += qs.filter(q => q.status === wanted).length
    }
    perStage[stage] = n
  }
  return perStage
}

const before = run(false)
const after = run(true)

console.log('\nstage              before   after   delta')
let tb = 0, ta = 0
for (const s of STAGES) {
  tb += before[s]; ta += after[s]
  const d = after[s] - before[s]
  console.log(`  ${s.padEnd(18)}${String(before[s]).padStart(5)}${String(after[s]).padStart(8)}${(d > 0 ? '  +' + d : d < 0 ? '  ' + d : '   0').padStart(8)}`)
}
console.log(`  ${'TOTAL'.padEnd(18)}${String(tb).padStart(5)}${String(ta).padStart(8)}${('  +' + (ta - tb)).padStart(8)}`)
console.log('\nNo stage may LOSE a card — this change only rescues leads that showed nowhere.')
const lost = STAGES.filter(s => after[s] < before[s])
console.log(lost.length ? `  REGRESSION in: ${lost.join(', ')}` : '  confirmed: no stage lost a card')
console.log('')
