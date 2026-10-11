// Why the EOS sold rows and the Sales Report disagree, and where Damien is.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { soldByRep, soldJobsInRange, soldValue, isSoldJob, NOT_SOLD_STATUSES } from '../src/lib/soldTotals.js'
import { buildLeadIndex, primaryOwnerId } from '../src/lib/jobOwnership.js'
import { wonJobsInRange, sumJobTotal } from '../src/lib/jobMetrics.js'
import { getWeekRange } from '../src/lib/eosWeek.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, s = '*') {
  let o = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(t).select(s).eq('company_id', C).order('id').range(f, f + 999)
    if (error) { console.log('ERR', t, error.message); return o }
    o = o.concat(data || []); if (!data || data.length < 1000) break
  }
  return o
}
const [jobsAll, leads, employees] = await Promise.all([page('jobs'), page('leads'), page('employees', 'id,name,role,active')])
const live = jobsAll.filter(j => j.status !== 'Archived')   // what the EOS page loads
const money = n => '$' + Math.round(n).toLocaleString()
const idx = buildLeadIndex(leads)

// Year to date, which is what the Sales Report shows by default
const start = new Date(new Date().getFullYear(), 0, 1)
const end = new Date()
console.log('=== YEAR TO DATE ===')
const rep = soldByRep(live, leads, { start, end, employees })
console.log(`Sales Report total: ${money(rep.total)} over ${rep.count} jobs`)
for (const r of rep.rows) console.log(`  ${String(r.name).padEnd(24)} ${money(r.total).padStart(12)}  ${String(r.count).padStart(4)} jobs`)

console.log('\n=== WHERE IS DAMIEN? ===')
const d = employees.find(e => /damien|damion/i.test(e.name || ''))
console.log('employee:', d ? `${d.name} (id ${d.id}, ${d.role}, active ${d.active})` : 'NOT FOUND')
if (d) {
  const his = jobsAll.filter(j => String(j.salesperson_id) === String(d.id))
  console.log(`jobs with salesperson_id = ${d.id}: ${his.length}`)
  const hisLeads = leads.filter(l => String(l.salesperson_id) === String(d.id) || (Array.isArray(l.salesperson_ids) && l.salesperson_ids.map(String).includes(String(d.id))))
  console.log(`leads naming him as salesperson: ${hisLeads.length}`)
  const viaLead = jobsAll.filter(j => primaryOwnerId(j, idx) === String(d.id))
  console.log(`jobs the credit rule gives him (salesperson, else the lead's): ${viaLead.length}`)
  for (const j of viaLead.slice(0, 10)) console.log(`   ${String(j.job_id).padEnd(16)} ${String(j.status).padEnd(12)} ${money(soldValue(j)).padStart(10)} created ${String(j.created_at).slice(0, 10)} bu=${j.business_unit ?? 'none'}`)
  const sold = viaLead.filter(isSoldJob)
  console.log(`of those, counted as sold (not archived/cancelled): ${sold.length}, ${money(sold.reduce((s, j) => s + soldValue(j), 0))}`)
  const inYtd = soldJobsInRange(viaLead, { start, end })
  console.log(`and inside this year: ${inYtd.length}, ${money(inYtd.reduce((s, j) => s + soldValue(j), 0))}`)
}

console.log('\n=== WHY EOS AND THE REPORT DISAGREE (last completed week) ===')
const w = getWeekRange(1)
const eosUnit = (ent) => sumJobTotal(wonJobsInRange(live.filter(j => j.business_unit && j.business_unit.toLowerCase() === ent.toLowerCase()), w.start, w.end))
const hhh = eosUnit('HHH Building Services'), es = eosUnit('Energy Scout')
const reportWeek = soldByRep(live, leads, { start: new Date(w.start), end: new Date(w.end), employees })
console.log(`EOS: HHH ${money(hhh)} + Energy Scout ${money(es)} = ${money(hhh + es)}`)
console.log(`Sales Report, same week:                      ${money(reportWeek.total)}`)
const weekJobs = wonJobsInRange(live, w.start, w.end)
const noBu = weekJobs.filter(j => !j.business_unit)
const cancelled = weekJobs.filter(j => NOT_SOLD_STATUSES.has(j.status))
console.log(`\nreasons they differ, for the ${weekJobs.length} jobs created that week:`)
console.log(`  jobs with NO business unit (in neither EOS row): ${noBu.length}, ${money(sumJobTotal(noBu))}`)
console.log(`  jobs cancelled/void (EOS counts, the report does not): ${cancelled.length}, ${money(sumJobTotal(cancelled))}`)
const unattributed = weekJobs.filter(j => primaryOwnerId(j, idx) == null)
console.log(`  jobs nobody is credited for (report shows as "Nobody on the deal"): ${unattributed.length}, ${money(sumJobTotal(unattributed))}`)
