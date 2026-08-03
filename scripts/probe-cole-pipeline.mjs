// Read-only: why does Cole's "All year" sold total look low on the pipeline?
// Measures the same population under each attribution rule the page uses.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3
const YEAR_START = '2026-01-01T00:00:00Z'

const { data: emps } = await sb.from('employees').select('id, name').eq('company_id', CO)
const cole = (emps || []).find(e => /cole/i.test(e.name || ''))
if (!cole) { console.log('no Cole found'); process.exit(0) }
console.log(`Cole = employee ${cole.id} (${cole.name})\n`)
const ID = cole.id

const { data: jobs } = await sb.from('jobs')
  .select('id, job_id, job_title, status, job_total, salesperson_id, pm_id, lead_id, quote_id, created_at')
  .eq('company_id', CO).gte('created_at', YEAR_START)
const { data: leads } = await sb.from('leads')
  .select('id, salesperson_id, lead_owner_id').eq('company_id', CO)
const { data: quotes } = await sb.from('quotes')
  .select('id, lead_id, salesperson_id, quote_amount, status').eq('company_id', CO)

const leadById = new Map((leads || []).map(l => [l.id, l]))
const quotesByLead = new Map()
for (const q of quotes || []) { if (!quotesByLead.has(q.lead_id)) quotesByLead.set(q.lead_id, []); quotesByLead.get(q.lead_id).push(q) }

const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sum = arr => arr.reduce((s, j) => s + (Number(j.job_total) || 0), 0)

// Rule A — what the Won/sold total uses today: job.salesperson_id only.
const ruleA = (jobs || []).filter(j => j.salesperson_id === ID)
// Rule B — what the pipeline COLUMNS use for a job row: job or lead owner.
const ruleB = (jobs || []).filter(j => {
  if (j.salesperson_id === ID) return true
  const l = j.lead_id ? leadById.get(j.lead_id) : null
  return !!l && (l.salesperson_id === ID || l.lead_owner_id === ID)
})
// Rule C — the broadest the page uses anywhere: + quote-level attribution.
const ruleC = (jobs || []).filter(j => {
  if (ruleB.includes(j)) return true
  const l = j.lead_id ? leadById.get(j.lead_id) : null
  if (!l) return false
  return (quotesByLead.get(l.id) || []).some(q => q.salesperson_id === ID)
})

console.log('Jobs created this year attributable to Cole, by rule:')
console.log(`  A  job.salesperson_id only          ${String(ruleA.length).padStart(4)} jobs   ${money(sum(ruleA)).padStart(14)}   <-- the sold/Won total today`)
console.log(`  B  + lead salesperson / lead owner  ${String(ruleB.length).padStart(4)} jobs   ${money(sum(ruleB)).padStart(14)}   <-- what the columns show`)
console.log(`  C  + quote-level attribution        ${String(ruleC.length).padStart(4)} jobs   ${money(sum(ruleC)).padStart(14)}`)

console.log('\nBreakdown of rule C by job status:')
const byStatus = new Map()
for (const j of ruleC) {
  const k = j.status || '(none)'
  if (!byStatus.has(k)) byStatus.set(k, { n: 0, amt: 0, missing: 0 })
  const b = byStatus.get(k); b.n++; b.amt += Number(j.job_total) || 0
  if (!(Number(j.job_total) > 0)) b.missing++
}
for (const [k, v] of [...byStatus.entries()].sort((a, b) => b[1].amt - a[1].amt))
  console.log(`  ${k.padEnd(26)} ${String(v.n).padStart(3)} jobs  ${money(v.amt).padStart(14)}   (${v.missing} with no job_total)`)

// Jobs visible under C but NOT counted by A — the gap.
const missed = ruleC.filter(j => !ruleA.includes(j))
console.log(`\nJobs Cole sold that the total MISSES: ${missed.length}   ${money(sum(missed))}`)
for (const j of missed.slice(0, 15)) {
  const l = j.lead_id ? leadById.get(j.lead_id) : null
  console.log(`  ${String(j.job_id || j.id).padEnd(9)} ${String(j.status || '').padEnd(22)} ${money(j.job_total).padStart(13)}  job.sp=${j.salesperson_id ?? '-'} lead.sp=${l?.salesperson_id ?? '-'} lead.owner=${l?.lead_owner_id ?? '-'}`)
}
if (missed.length > 15) console.log(`  ... and ${missed.length - 15} more`)

// Jobs with no job_total — would count as $0 unless the estimate fills in.
const noTotal = ruleC.filter(j => !(Number(j.job_total) > 0))
console.log(`\nCole jobs with NO job_total (count as $0): ${noTotal.length}`)
for (const j of noTotal.slice(0, 8)) {
  const l = j.lead_id ? leadById.get(j.lead_id) : null
  const qs = l ? (quotesByLead.get(l.id) || []) : []
  const est = qs.reduce((s, q) => Math.max(s, Number(q.quote_amount) || 0), 0)
  console.log(`  ${String(j.job_id || j.id).padEnd(9)} ${String(j.status || '').padEnd(22)} job_total=${j.job_total ?? 'null'}  best estimate=${money(est)}`)
}
