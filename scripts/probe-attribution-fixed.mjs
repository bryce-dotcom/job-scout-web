// REDO of the attribution probe. The previous one paginated with .range()
// and NO .order(), so Postgres was free to return rows in a different order
// per page — silently dropping and duplicating rows. That is why it reported
// "0 recoverable from lead/quote" when job 8739's lead plainly carries
// salesperson_id 17. Always ORDER BY when paginating.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Paginate with a stable sort. Verifies the count matches what the server says.
async function all(table, select) {
  const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('company_id', CO)
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select)
      .eq('company_id', CO).order('id', { ascending: true }).range(from, from + 999)
    if (error) { console.log(`${table}: ${error.message}`); break }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const ids = new Set(out.map(r => r.id))
  console.log(`  ${table}: fetched ${out.length}, unique ${ids.size}, server count ${count}` +
    (ids.size === count ? '  OK' : '  *** MISMATCH ***'))
  return out
}

console.log('Fetching with a stable sort:')
const jobs = await all('jobs', 'id, job_id, job_title, job_total, created_at, salesperson_id, lead_id, quote_id, business_unit')
const leads = await all('leads', 'id, salesperson_id, lead_owner_id, salesperson_ids')
const quotes = await all('quotes', 'id, lead_id, salesperson_id')
const emps = await all('employees', 'id, name')

const em = new Map(emps.map(e => [e.id, e.name]))
const lm = new Map(leads.map(l => [String(l.id), l]))
const qm = new Map(quotes.map(q => [String(q.id), q]))
const leadRep = l => l && (l.salesperson_id || l.lead_owner_id ||
  (Array.isArray(l.salesperson_ids) && l.salesperson_ids.length ? l.salesperson_ids[0] : null)) || null

const y2026 = jobs.filter(j => (j.created_at || '') >= '2026-01-01')
const noSp = y2026.filter(j => !j.salesperson_id)
const amt = j => Number(j.job_total) || 0

console.log(`\n2026 jobs: ${y2026.length}   without salesperson_id: ${noSp.length}   ${money(noSp.reduce((s, j) => s + amt(j), 0))}`)

let viaLead = 0, viaQuote = 0, none = 0, recAmt = 0
const byOwner = new Map()
for (const j of noSp) {
  const l = j.lead_id ? lm.get(String(j.lead_id)) : null
  const q = j.quote_id ? qm.get(String(j.quote_id)) : null
  const rep = leadRep(l) || q?.salesperson_id || null
  if (rep) {
    if (leadRep(l)) viaLead++; else viaQuote++
    recAmt += amt(j)
    if (!byOwner.has(rep)) byOwner.set(rep, { n: 0, a: 0 })
    const b = byOwner.get(rep); b.n++; b.a += amt(j)
  } else none++
}
console.log(`  RECOVERABLE via lead:  ${viaLead}`)
console.log(`  RECOVERABLE via quote: ${viaQuote}`)
console.log(`  genuinely unattributed:${none}`)
console.log(`  recoverable value:     ${money(recAmt)}`)
console.log('\n  recovered work belongs to:')
for (const [k, v] of [...byOwner.entries()].sort((a, b) => b[1].a - a[1].a))
  console.log(`    ${String(em.get(k) || k).padEnd(24)}${String(v.n).padStart(4)}  ${money(v.a).padStart(15)}`)

// TRUE 2026 totals per rep, counting job.salesperson_id OR the lead/quote.
const owner = j => j.salesperson_id || leadRep(j.lead_id ? lm.get(String(j.lead_id)) : null) ||
  (j.quote_id ? qm.get(String(j.quote_id))?.salesperson_id : null) || null
const tot = new Map()
for (const j of y2026) {
  const o = owner(j) ?? 'STILL UNATTRIBUTED'
  if (!tot.has(o)) tot.set(o, { n: 0, a: 0 })
  const b = tot.get(o); b.n++; b.a += amt(j)
}
console.log('\nTRUE 2026 sold by rep (job OR lead OR quote):')
for (const [k, v] of [...tot.entries()].sort((a, b) => b[1].a - a[1].a))
  console.log(`  ${String(em.get(k) || k).padEnd(24)}${String(v.n).padStart(4)}  ${money(v.a).padStart(15)}`)
