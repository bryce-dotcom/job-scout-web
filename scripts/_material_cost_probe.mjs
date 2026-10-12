// Is material cost reaching job profit at all, and where does it stop?
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { deliveredJobsInRange } from '../src/lib/jobMetrics.js'
import { getWeekRange } from '../src/lib/eosWeek.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, s = '*', scoped = true) {
  let o = []
  for (let f = 0; ; f += 1000) {
    let q = sb.from(t).select(s).order('id').range(f, f + 999)
    if (scoped) q = q.eq('company_id', C)
    const { data, error } = await q
    if (error) { console.log('ERR', t, error.message); return o }
    o = o.concat(data || []); if (!data || data.length < 1000) break
  }
  return o
}
const [jobs, jobLines, products, comps, st, expenses, plaid] = await Promise.all([
  page('jobs'), page('job_lines', 'id, job_id, item_id, item_name, quantity, labor_cost, price, total, kind'),
  page('products_services', 'id, name, cost, unit_price, material_or_labor, product_category'),
  sb.from('product_components').select('*').then(r => r.data || []),
  sb.from('settings').select('value').eq('company_id', C).eq('key', 'job_statuses').then(r => r.data),
  page('expenses'), page('plaid_transactions'),
])
const live = jobs.filter(j => j.status !== 'Archived')
const jobStatuses = JSON.parse(st?.[0]?.value || '[]')
const money = n => '$' + Math.round(n).toLocaleString()

console.log('=== THE PRICE BOOK ===')
const withCost = products.filter(p => Number(p.cost) > 0)
console.log(`products_services: ${products.length}, with a cost set: ${withCost.length} (${Math.round(withCost.length / products.length * 100)}%)`)
const byCat = {}
for (const p of products) {
  const k = p.product_category || '(none)'
  byCat[k] = byCat[k] || { n: 0, costed: 0 }
  byCat[k].n++; if (Number(p.cost) > 0) byCat[k].costed++
}
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1].n - a[1].n).slice(0, 10))
  console.log(`  ${k.padEnd(34)} ${String(v.n).padStart(4)} products, ${String(v.costed).padStart(4)} costed`)
console.log(`material_or_labor set on: ${products.filter(p => p.material_or_labor).length}`)
console.log(`product_components rows: ${comps.length} (bundles whose cost lives in children)`)

const w = getWeekRange(1)
const done = deliveredJobsInRange(live, jobStatuses, w.start, w.end)
console.log(`\n=== THE ${done.length} JOBS COMPLETED LAST WEEK ===`)
const linesByJob = new Map()
for (const l of jobLines) { const k = String(l.job_id); linesByJob.set(k, [...(linesByJob.get(k) || []), l]) }
const prod = new Map(products.map(p => [p.id, p]))
let noLines = 0, linesNoItem = 0, itemNoCost = 0, costed = 0
for (const j of done) {
  const ls = linesByJob.get(String(j.id)) || []
  if (!ls.length) { noLines++; continue }
  for (const l of ls) {
    if (l.item_id == null) { linesNoItem++; continue }
    const p = prod.get(l.item_id)
    const kids = comps.filter(c => c.parent_product_id === l.item_id)
    const own = Number(p?.cost) || 0
    const kidCost = kids.reduce((s, c) => s + (Number(prod.get(c.component_product_id)?.cost) || 0) * (Number(c.quantity) || 1), 0)
    if (own > 0 || kidCost > 0) costed++; else itemNoCost++
  }
}
console.log(`  jobs with NO lines at all: ${noLines} of ${done.length}`)
console.log(`  lines with no product linked (typed by hand): ${linesNoItem}`)
console.log(`  lines whose product has NO cost in the price book: ${itemNoCost}`)
console.log(`  lines that do carry a cost: ${costed}`)

console.log('\n=== DOUBLE COUNTING RISK: lines AND receipts on the same job ===')
const expByJob = new Map()
for (const e of expenses) if (e.job_id) expByJob.set(String(e.job_id), (expByJob.get(String(e.job_id)) || 0) + (Number(e.amount) || 0))
for (const t of plaid) { const jid = t.job_id || t.ai_job_id; if (jid && Number(t.amount) > 0 && !t.is_transfer) expByJob.set(String(jid), (expByJob.get(String(jid)) || 0) + Number(t.amount)) }
const both = live.filter(j => (linesByJob.get(String(j.id)) || []).some(l => l.item_id != null) && expByJob.get(String(j.id)))
console.log(`jobs carrying BOTH priced lines and tagged spend: ${both.length}`)
for (const j of both.slice(0, 8)) {
  const ls = linesByJob.get(String(j.id)) || []
  const est = ls.reduce((s, l) => {
    const p = prod.get(l.item_id); const kids = comps.filter(c => c.parent_product_id === l.item_id)
    const own = Number(p?.cost) || 0
    const kid = kids.reduce((a, c) => a + (Number(prod.get(c.component_product_id)?.cost) || 0) * (Number(c.quantity) || 1), 0)
    return s + (kid > 0 ? kid : own) * (Number(l.quantity) || 1)
  }, 0)
  console.log(`  ${String(j.job_id).padEnd(16)} catalog parts ${money(est).padStart(9)}  tagged spend ${money(expByJob.get(String(j.id))).padStart(9)}  -> today jobCosting ADDS both = ${money(est + expByJob.get(String(j.id)))}`)
}
