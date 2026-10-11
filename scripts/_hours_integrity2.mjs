import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, select = '*') {
  let rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select(select).eq('company_id', C).order('id', { ascending: true }).range(from, from + 999)
    if (error) { console.log('ERR', t, error.message); return rows }
    rows = rows.concat(data || []); if (!data || data.length < 1000) break
  }
  return rows
}
const [tc, employees, jobs, bonuses] = await Promise.all([
  page('time_clock'), page('employees', 'id, name, role, active'),
  page('jobs', 'id, job_id, status, allotted_time_hours, business_unit, job_total'), page('job_bonuses'),
])
const emp = id => employees.find(e => String(e.id) === String(id))
const hoursOf = r => { const h = Number(r.total_hours); if (Number.isFinite(h) && h > 0) return h; if (r.clock_in && r.clock_out) return Math.max(0, (new Date(r.clock_out) - new Date(r.clock_in)) / 36e5); return 0 }
const money = n => '$' + Math.round(Number(n) || 0).toLocaleString()

console.log('=== WHO IS SUPPOSED TO BE ON A JOB? loose hours by role ===')
const byRole = {}
for (const r of tc) {
  const e = emp(r.employee_id); const role = e?.role || '(no role)'
  const d = byRole[role] = byRole[role] || { h: 0, loose: 0, people: new Set() }
  d.h += hoursOf(r); d.people.add(r.employee_id)
  if (!r.job_id) d.loose += hoursOf(r)
}
console.log('role                  people    hours    loose   % loose')
for (const [role, d] of Object.entries(byRole).sort((a, b) => b[1].loose - a[1].loose))
  console.log(`${role.padEnd(20)} ${String(d.people.size).padStart(6)} ${String(Math.round(d.h)).padStart(8)} ${String(Math.round(d.loose)).padStart(8)} ${String(Math.round(d.loose / (d.h || 1) * 100) + '%').padStart(9)}`)

const FIELD = new Set(['Field Tech', 'Installer'])
const fieldLoose = tc.filter(r => !r.job_id && FIELD.has(emp(r.employee_id)?.role)).reduce((s, r) => s + hoursOf(r), 0)
const fieldAll = tc.filter(r => FIELD.has(emp(r.employee_id)?.role)).reduce((s, r) => s + hoursOf(r), 0)
console.log(`\nFIELD CREW ONLY: ${Math.round(fieldLoose)} loose of ${Math.round(fieldAll)} hours = ${Math.round(fieldLoose / fieldAll * 100)}%`)
const officeLoose = Math.round(tc.filter(r => !r.job_id && !FIELD.has(emp(r.employee_id)?.role)).reduce((s, r) => s + hoursOf(r), 0))
console.log(`Office / sales / managers: ${officeLoose} loose hours — expected, they do not work jobs`)

console.log('\n=== DID THE BONUS GUARDS FIRE? ===')
const hoursByJob = new Map()
for (const r of tc) { if (!r.job_id) continue; hoursByJob.set(String(r.job_id), (hoursByJob.get(String(r.job_id)) || 0) + hoursOf(r)) }
const jobById = new Map(jobs.map(j => [String(j.id), j]))
const live = bonuses.filter(b => ['paid', 'accrued'].includes(b.status))
const suspect = live.map(b => {
  const j = jobById.get(String(b.job_id)); if (!j) return null
  const actual = hoursByJob.get(String(b.job_id)) || 0
  const allot = Number(j.allotted_time_hours) || 0
  return { b, j, actual, allot, ratio: actual > 0 ? allot / actual : Infinity }
}).filter(Boolean).filter(r => r.actual === 0 || r.ratio > 3)
console.log(`bonuses whose job's recorded hours do not support them: ${suspect.length}, ${money(suspect.reduce((s, r) => s + Number(r.b.amount), 0))}`)
console.log('\nstatus   needsVerif  overridden  amount     job            allotted  recorded  stored actual_hours')
for (const r of suspect.sort((a, b) => Number(b.b.amount) - Number(a.b.amount))) {
  console.log(`${String(r.b.status).padEnd(8)} ${String(!!r.b.needs_verification).padEnd(11)} ${String(!!r.b.verification_overridden_by).padEnd(11)} ${money(r.b.amount).padStart(8)}  ${String(r.j.job_id).padEnd(15)} ${String(Math.round(r.allot)).padStart(8)} ${String(Math.round(r.actual)).padStart(9)} ${String(r.b.actual_hours).padStart(12)}   ${r.b.release_reason || ''}`)
}
console.log('\n=== all live bonuses: how many carry the hold flag? ===')
const held = live.filter(b => b.needs_verification)
console.log(`needs_verification: ${held.length} of ${live.length} (${money(held.reduce((s, b) => s + Number(b.amount), 0))})`)
console.log(`overridden by a person: ${live.filter(b => b.verification_overridden_by).length}`)
const paidHeld = bonuses.filter(b => b.status === 'paid' && b.needs_verification)
console.log(`PAID while still flagged: ${paidHeld.length} (${money(paidHeld.reduce((s, b) => s + Number(b.amount), 0))})`)
