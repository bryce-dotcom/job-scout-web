// Three questions: is it the system or the users? are bonuses riding on
// hours that are not real? and what gets added after the fact?
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { calendarDay } from '../src/lib/localDate.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, select = '*') {
  let rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select(select).eq('company_id', C).order('id', { ascending: true }).range(from, from + 999)
    if (error) { console.log('ERR', t, error.message); return rows }
    rows = rows.concat(data || [])
    if (!data || data.length < 1000) break
  }
  return rows
}
const [tc, employees, jobs, bonuses, timeLog] = await Promise.all([
  page('time_clock'), page('employees', 'id, name, hourly_rate'), page('jobs', 'id, job_id, job_title, status, allotted_time_hours, business_unit'),
  page('job_bonuses'), page('time_log'),
])
const empName = id => employees.find(e => String(e.id) === String(id))?.name || `#${id}`
const hoursOf = r => {
  const h = Number(r.total_hours)
  if (Number.isFinite(h) && h > 0) return h
  if (r.clock_in && r.clock_out) return Math.max(0, (new Date(r.clock_out) - new Date(r.clock_in)) / 36e5)
  return 0
}
const money = n => '$' + Math.round(n).toLocaleString()

console.log('================ 1. SYSTEM OR USERS? ================')
console.log(`time_clock rows: ${tc.length}`)
const noJob = tc.filter(r => !r.job_id)
console.log(`punches with NO job: ${noJob.length} (${Math.round(noJob.length / tc.length * 100)}%) = ${Math.round(noJob.reduce((s, r) => s + hoursOf(r), 0))} hours`)
// By month, to see whether it is getting better or worse
const byMonth = {}
for (const r of tc) {
  const m = String(calendarDay(r.clock_in)).slice(0, 7)
  if (!m || m === 'undefine') continue
  byMonth[m] = byMonth[m] || { total: 0, noJob: 0, hoursNoJob: 0, hours: 0 }
  byMonth[m].total++; byMonth[m].hours += hoursOf(r)
  if (!r.job_id) { byMonth[m].noJob++; byMonth[m].hoursNoJob += hoursOf(r) }
}
console.log('\nmonth    punches  no job   hours   loose hours   % loose')
for (const m of Object.keys(byMonth).sort().slice(-8)) {
  const d = byMonth[m]
  console.log(`${m}  ${String(d.total).padStart(7)} ${String(d.noJob).padStart(7)} ${String(Math.round(d.hours)).padStart(7)} ${String(Math.round(d.hoursNoJob)).padStart(13)} ${String(Math.round(d.hoursNoJob / (d.hours || 1) * 100) + '%').padStart(9)}`)
}
// Who
const byEmp = {}
for (const r of tc) {
  if (!r.employee_id) continue
  const e = byEmp[r.employee_id] = byEmp[r.employee_id] || { n: 0, noJob: 0, h: 0, loose: 0 }
  e.n++; e.h += hoursOf(r)
  if (!r.job_id) { e.noJob++; e.loose += hoursOf(r) }
}
console.log('\nper person (worst first, 10+ punches):')
Object.entries(byEmp).filter(([, d]) => d.n >= 10).sort((a, b) => (b[1].loose / b[1].h) - (a[1].loose / a[1].h)).slice(0, 12)
  .forEach(([id, d]) => console.log(`  ${empName(id).padEnd(22)} ${String(d.n).padStart(4)} punches  ${String(Math.round(d.h)).padStart(5)}h  loose ${String(Math.round(d.loose)).padStart(5)}h  ${String(Math.round(d.loose / d.h * 100) + '%').padStart(5)}`))

console.log('\n================ 2. RETRO EDITS — ADDED AFTER THE FACT ================')
const adjusted = tc.filter(r => r.adjusted_at || r.adjusted_by || r.original_total_hours != null)
console.log(`punches edited after the fact: ${adjusted.length}`)
let added = 0
for (const r of adjusted) {
  const before = Number(r.original_total_hours)
  const after = hoursOf(r)
  if (Number.isFinite(before)) added += after - before
}
console.log(`net hours added by those edits: ${Math.round(added * 10) / 10}`)
const byAdjuster = {}
for (const r of adjusted) { const k = r.adjusted_by ?? 'unknown'; byAdjuster[k] = (byAdjuster[k] || 0) + 1 }
for (const [k, n] of Object.entries(byAdjuster)) console.log(`  edited by ${empName(k)}: ${n}`)
console.log(`flagged_for_review: ${tc.filter(r => r.flagged_for_review).length}`)
const recentAdj = adjusted.filter(r => r.adjusted_at).sort((a, b) => String(b.adjusted_at).localeCompare(String(a.adjusted_at))).slice(0, 8)
for (const r of recentAdj) console.log(`  ${String(r.adjusted_at).slice(0, 10)} ${empName(r.employee_id).padEnd(18)} job ${r.job_id ?? 'none'} ${r.original_total_hours ?? '?'}h -> ${Math.round(hoursOf(r) * 10) / 10}h  ${String(r.adjustment_reason || '').slice(0, 40)}`)

console.log('\nlegacy typed hours (time_log) — the "tell Alayda later" path:')
console.log(`  rows: ${timeLog.length}`)
const lag = timeLog.filter(t => t.date && t.created_at).map(t => ({
  days: Math.round((new Date(t.created_at) - new Date(calendarDay(t.date))) / 86400000), t,
}))
const late = lag.filter(l => l.days >= 2)
console.log(`  typed 2+ days after the work: ${late.length} of ${lag.length}`)
for (const l of late.slice(-6)) console.log(`    ${calendarDay(l.t.date)} job ${l.t.job_id} ${l.t.hours}h by ${empName(l.t.employee_id)} — typed ${l.days} days later`)

console.log('\n================ 3. BONUSES ON HOURS THAT ARE NOT REAL ================')
console.log('job_bonuses columns:', Object.keys(bonuses[0] || {}).join(', '))
const byStatus = {}
for (const b of bonuses) { const s = b.status || '(none)'; byStatus[s] = byStatus[s] || { n: 0, amt: 0 }; byStatus[s].n++; byStatus[s].amt += Number(b.amount) || 0 }
for (const [s, d] of Object.entries(byStatus)) console.log(`  ${s.padEnd(20)} ${String(d.n).padStart(4)} rows  ${money(d.amt)}`)

// Hours actually recorded on each bonused job
const hoursByJob = new Map()
for (const r of tc) { if (!r.job_id) continue; hoursByJob.set(String(r.job_id), (hoursByJob.get(String(r.job_id)) || 0) + hoursOf(r)) }
const jobById = new Map(jobs.map(j => [String(j.id), j]))
const paid = bonuses.filter(b => ['paid', 'accrued'].includes(b.status))
console.log(`\npaid or accrued bonuses: ${paid.length} rows, ${money(paid.reduce((s, b) => s + (Number(b.amount) || 0), 0))}`)
const rows = []
for (const b of paid) {
  const j = jobById.get(String(b.job_id))
  if (!j) continue
  const actual = hoursByJob.get(String(b.job_id)) || 0
  const allot = Number(j.allotted_time_hours) || 0
  rows.push({ b, j, actual, allot, ratio: actual > 0 ? allot / actual : Infinity })
}
const noHours = rows.filter(r => r.actual === 0)
console.log(`  on a job with ZERO recorded hours: ${noHours.length} rows, ${money(noHours.reduce((s, r) => s + (Number(r.b.amount) || 0), 0))}`)
for (const r of noHours.slice(0, 8)) console.log(`    ${String(r.j.job_id).padEnd(16)} allotted ${r.allot}h, recorded 0h -> bonus ${money(r.b.amount)} (${r.b.status}) ${empName(r.b.employee_id)}`)
const bigRatio = rows.filter(r => r.actual > 0 && r.ratio > 3)
console.log(`  allotted more than 3x the hours recorded: ${bigRatio.length} rows, ${money(bigRatio.reduce((s, r) => s + (Number(r.b.amount) || 0), 0))}`)
for (const r of bigRatio.slice(0, 8)) console.log(`    ${String(r.j.job_id).padEnd(16)} allotted ${Math.round(r.allot)}h vs ${Math.round(r.actual)}h worked (${Math.round(r.ratio)}x) -> ${money(r.b.amount)} (${r.b.status})`)
