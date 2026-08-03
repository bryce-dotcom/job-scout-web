// Do Payroll/My Pay and the Sales Pipeline now credit the SAME jobs to the
// same rep? Mirrors both rules exactly and reports every disagreement.
// Read-only.
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

async function all(table, select) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select)
      .eq('company_id', CO).order('id', { ascending: true }).range(from, from + 999)
    if (error) { console.log(`${table}: ${error.message}`); break }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const jobs = await all('jobs', 'id, job_id, job_title, job_total, created_at, salesperson_id, lead_id, pm_id, job_lead_id')
const leads = await all('leads', 'id, salesperson_id, lead_owner_id, salesperson_ids')
const emps = await all('employees', 'id, name')
const em = new Map(emps.map(e => [String(e.id), e.name]))
const leadIndex = new Map(leads.map(l => [String(l.id), l]))
const leadOf = j => (j.lead_id ? leadIndex.get(String(j.lead_id)) : null) || null

// ── lib/jobOwnership 'credit' — what Payroll and My Pay use ──
const creditIds = (j) => {
  const s = new Set()
  if (j.salesperson_id != null) s.add(String(j.salesperson_id))
  const l = leadOf(j)
  if (l) {
    if (l.salesperson_id != null) s.add(String(l.salesperson_id))
    if (Array.isArray(l.salesperson_ids)) for (const id of l.salesperson_ids) if (id != null) s.add(String(id))
  }
  return s
}

// ── SalesPipeline — a JOB card matches on the card's salesperson_id
//    (job's own, else primaryOwnerId) OR its lead_owner_id (= pm_id /
//    job_lead_id, i.e. the installer or project manager). ──
const primaryOwner = (j) => {
  if (j.salesperson_id != null) return String(j.salesperson_id)
  const l = leadOf(j)
  if (!l) return null
  if (l.salesperson_id != null) return String(l.salesperson_id)
  if (Array.isArray(l.salesperson_ids) && l.salesperson_ids.length) {
    const f = l.salesperson_ids.find(v => v != null)
    if (f != null) return String(f)
  }
  return null
}
const pipelineIds = (j) => {
  // now: credit scope on both sides — job salesperson, else lead salesperson,
  // plus every rep in salesperson_ids. No lead owner, no PM.
  const s = new Set()
  if (j.salesperson_id != null) s.add(String(j.salesperson_id))
  const l = leadOf(j)
  if (l) {
    if (l.salesperson_id != null) s.add(String(l.salesperson_id))
    if (Array.isArray(l.salesperson_ids)) for (const id of l.salesperson_ids) if (id != null) s.add(String(id))
  }
  return s
}

const y2026 = jobs.filter(j => (j.created_at || '') >= '2026-01-01')
const amt = j => Number(j.job_total) || 0

let agree = 0
const extraPipeline = []   // pipeline credits a rep that pay does not
const extraPay = []        // pay credits a rep the pipeline does not
for (const j of y2026) {
  const c = creditIds(j), p = pipelineIds(j)
  const onlyP = [...p].filter(x => !c.has(x))
  const onlyC = [...c].filter(x => !p.has(x))
  if (onlyP.length === 0 && onlyC.length === 0) { agree++; continue }
  for (const r of onlyP) extraPipeline.push({ j, rep: r })
  for (const r of onlyC) extraPay.push({ j, rep: r })
}

console.log(`2026 jobs compared: ${y2026.length}`)
console.log(`  identical credit:                 ${agree}`)
console.log(`  pipeline credits someone pay does NOT: ${extraPipeline.length}  ${money(extraPipeline.reduce((s, x) => s + amt(x.j), 0))}`)
console.log(`  pay credits someone pipeline does NOT: ${extraPay.length}  ${money(extraPay.reduce((s, x) => s + amt(x.j), 0))}`)

const byRep = new Map()
for (const { j, rep } of extraPipeline) {
  if (!byRep.has(rep)) byRep.set(rep, { n: 0, a: 0 })
  const b = byRep.get(rep); b.n++; b.a += amt(j)
}
if (byRep.size) {
  console.log('\nPipeline-only credit (this is the PM / installer being counted as a seller):')
  for (const [k, v] of [...byRep.entries()].sort((a, b) => b[1].a - a[1].a).slice(0, 10))
    console.log(`  ${String(em.get(k) || k).padEnd(24)}${String(v.n).padStart(4)}  ${money(v.a).padStart(15)}`)
  console.log('\n  examples:')
  for (const { j, rep } of extraPipeline.slice(0, 6))
    console.log(`    ${String(j.job_id).padEnd(16)}${money(amt(j)).padStart(13)}  pipeline also credits ${em.get(rep) || rep} (pm_id/job_lead_id)`)
}

// Per-rep SOLD totals under each rule.
console.log('\n2026 SOLD per rep — pay rule vs pipeline rule:')
const tot = new Map()
for (const j of y2026) {
  for (const r of creditIds(j)) { if (!tot.has(r)) tot.set(r, { pay: 0, pipe: 0 }); tot.get(r).pay += amt(j) }
  for (const r of pipelineIds(j)) { if (!tot.has(r)) tot.set(r, { pay: 0, pipe: 0 }); tot.get(r).pipe += amt(j) }
}
console.log('  rep'.padEnd(26) + 'pay rule'.padStart(15) + 'pipeline'.padStart(15) + '   diff')
for (const [k, v] of [...tot.entries()].sort((a, b) => b[1].pay - a[1].pay)) {
  const d = v.pipe - v.pay
  console.log('  ' + String(em.get(k) || k).padEnd(24) + money(v.pay).padStart(15) + money(v.pipe).padStart(15) +
    (Math.abs(d) < 0.01 ? '   match' : `   ${d > 0 ? '+' : ''}${money(d)}`))
}
