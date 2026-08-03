// Exhaustive: find EVERY route by which a 2026 sale could belong to Cole.
// Paginates (PostgREST caps at 1000) and reports exact counts. Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3, ID = 16, YEAR = '2026-01-01'
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function all(table, select, tweak = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).eq('company_id', CO).range(from, from + 999)
    q = tweak(q)
    const { data, error } = await q
    if (error) { console.log(`  ${table} ERROR: ${error.message}`); break }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const jobs = await all('jobs', 'id, job_id, status, job_total, utility_incentive, created_at, start_date, salesperson_id, pm_id, lead_id, quote_id')
const leads = await all('leads', 'id, salesperson_id, lead_owner_id, salesperson_ids')
const quotes = await all('quotes', 'id, quote_id, lead_id, salesperson_id, quote_amount, status, approved_date, created_at')

console.log(`TOTALS (paginated): jobs=${jobs.length}  leads=${leads.length}  quotes=${quotes.length}\n`)

const leadById = new Map(leads.map(l => [l.id, l]))
const coleLead = l => !!l && (l.salesperson_id === ID || l.lead_owner_id === ID ||
  (Array.isArray(l.salesperson_ids) && l.salesperson_ids.map(String).includes(String(ID))))

const quoteById = new Map(quotes.map(q => [q.id, q]))
const isColeJob = j => {
  if (j.salesperson_id === ID) return 'job.salesperson_id'
  const l = j.lead_id ? leadById.get(j.lead_id) : null
  if (coleLead(l)) return 'lead'
  const q = j.quote_id ? quoteById.get(j.quote_id) : null
  if (q?.salesperson_id === ID) return 'quote'
  return null
}

const inYear = d => (d || '') >= YEAR
const amt = j => Number(j.job_total) || 0

const coleJobs = jobs.map(j => ({ j, via: isColeJob(j) })).filter(x => x.via)
const coleJobs2026 = coleJobs.filter(x => inYear(x.j.created_at))

console.log('COLE — jobs attributable to him, ANY route:')
console.log(`  all time            ${String(coleJobs.length).padStart(4)}   ${money(coleJobs.reduce((s, x) => s + amt(x.j), 0)).padStart(15)}`)
console.log(`  created in 2026     ${String(coleJobs2026.length).padStart(4)}   ${money(coleJobs2026.reduce((s, x) => s + amt(x.j), 0)).padStart(15)}`)

const viaCount = {}
for (const x of coleJobs2026) viaCount[x.via] = (viaCount[x.via] || 0) + 1
console.log('  2026 attribution route:', JSON.stringify(viaCount))

console.log('\n  2026 jobs by status:')
const by = new Map()
for (const { j } of coleJobs2026) {
  const k = j.status || '(none)'
  if (!by.has(k)) by.set(k, { n: 0, a: 0 })
  const b = by.get(k); b.n++; b.a += amt(j)
}
for (const [k, v] of [...by.entries()].sort((a, b) => b[1].a - a[1].a))
  console.log(`    ${k.padEnd(24)} ${String(v.n).padStart(3)}  ${money(v.a).padStart(15)}`)

// Estimates approved in 2026 attributable to Cole
const coleQuotes = quotes.filter(q => q.salesperson_id === ID || coleLead(leadById.get(q.lead_id)))
const approved2026 = coleQuotes.filter(q => inYear(q.approved_date))
const jobQuoteIds = new Set(jobs.map(j => j.quote_id).filter(Boolean))
const approvedNoJob = approved2026.filter(q => !jobQuoteIds.has(q.id))
console.log(`\n  estimates APPROVED in 2026        ${String(approved2026.length).padStart(4)}   ${money(approved2026.reduce((s, q) => s + (Number(q.quote_amount) || 0), 0)).padStart(15)}`)
console.log(`    ...of which never became a job  ${String(approvedNoJob.length).padStart(4)}   ${money(approvedNoJob.reduce((s, q) => s + (Number(q.quote_amount) || 0), 0)).padStart(15)}`)

// Sold measured by APPROVAL date rather than job creation
const soldByApproval = new Map()
for (const q of approved2026) soldByApproval.set(q.id, Number(q.quote_amount) || 0)
for (const { j } of coleJobs2026) if (!j.quote_id || !soldByApproval.has(j.quote_id)) soldByApproval.set(`job-${j.id}`, amt(j))
console.log(`\n  UNION (approved-2026 estimates + 2026 jobs, de-duped by quote):`)
console.log(`    ${String(soldByApproval.size).padStart(4)} deals   ${money([...soldByApproval.values()].reduce((s, v) => s + v, 0)).padStart(15)}`)

const withIncent = coleJobs2026.filter(x => Number(x.j.utility_incentive) > 0)
console.log(`\n  2026 jobs carrying a utility_incentive: ${withIncent.length}   incentive sum ${money(withIncent.reduce((s, x) => s + Number(x.j.utility_incentive), 0))}`)
console.log(`  (job_total + incentive would total ${money(coleJobs2026.reduce((s, x) => s + amt(x.j) + (Number(x.j.utility_incentive) || 0), 0))})`)
