// What counting typed-in hours does to bonus money. REPORT ONLY — writes nothing.
//
// Bryce: typed hours "should count". They now feed the ledger through
// jobHours, which refuses a typed entry that merely repeats a punch and one
// that is a whole-job total stamped on the crew. This shows the effect per job
// before any of it moves.
//
//   npx vite-node scripts/preview-bonus-with-typed-hours.mjs

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeJobHourSources } from '../src/lib/jobHours.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const page = async (t, s, f) => {
  const o = []
  for (let i = 0; ; i += 1000) {
    let q = sb.from(t).select(s).eq('company_id', 3).range(i, i + 999)
    if (f) q = f(q)
    const { data, error } = await q
    if (error) throw new Error(`${t}: ${error.message}`)
    o.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return o
}

const punches = await page('time_clock', 'id, employee_id, job_id, total_hours, clock_in, clock_out', q => q.not('job_id', 'is', null))
const typed = await page('time_log', 'id, employee_id, job_id, hours, date', q => q.not('job_id', 'is', null))
const jobs = await page('jobs', 'id, job_id, job_title, allotted_time_hours')
const bonuses = await page('job_bonuses', 'job_id, employee_id, amount, status, saved_hours, actual_hours')

const sum = (rows) => rows.reduce((s, r) => {
  const h = parseFloat(r.total_hours)
  return s + (Number.isFinite(h) && h > 0 ? h : 0)
}, 0)
const byJob = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.job_id)) m.set(r.job_id, []); m.get(r.job_id).push(r) } return m }

const punchByJob = byJob(punches)
const typedByJob = byJob(typed)
const jobById = new Map(jobs.map(j => [j.id, j]))

const rows = []
for (const [jobId, tRows] of typedByJob) {
  const p = punchByJob.get(jobId) || []
  const before = sum(p)
  const after = sum(mergeJobHourSources({ timeClock: p, timeLog: tRows }))
  if (Math.abs(after - before) < 0.01) continue
  const job = jobById.get(jobId)
  const allot = Number(job?.allotted_time_hours) || 0
  const bs = bonuses.filter(b => b.job_id === jobId)
  rows.push({
    jobId, label: job?.job_title || job?.job_id || `job ${jobId}`,
    before, after, added: after - before, allot,
    savedBefore: allot - before, savedAfter: allot - after,
    bonusNow: bs.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    paid: bs.some(b => b.status === 'paid'),
    ignoredTyped: tRows.length - mergeJobHourSources({ timeClock: p, timeLog: tRows }).filter(r => r._source === 'time_log').length,
  })
}
rows.sort((a, b) => b.added - a.added)

console.log(`\n${rows.length} jobs where typed hours change the total\n`)
console.log('  job                             allot   punches  +typed   = total   saved before -> after   bonus now')
for (const r of rows) {
  console.log(
    `  ${String(r.label).slice(0, 30).padEnd(30)} ${r.allot.toFixed(1).padStart(6)} ${r.before.toFixed(1).padStart(8)} ` +
    `${('+' + r.added.toFixed(1)).padStart(7)} ${r.after.toFixed(1).padStart(9)}   ` +
    `${r.savedBefore.toFixed(1).padStart(7)} -> ${r.savedAfter.toFixed(1).padStart(7)}   ` +
    `$${r.bonusNow.toFixed(2).padStart(9)}${r.paid ? '  PAID (frozen)' : ''}`)
}
const lower = rows.filter(r => r.savedAfter < r.savedBefore && r.bonusNow > 0)
console.log(`\n  jobs carrying a bonus whose saved hours FALL: ${lower.length}`)
console.log(`  total bonus money on those jobs: $${lower.reduce((s, r) => s + r.bonusNow, 0).toFixed(2)}`)
console.log(`  of which already paid and frozen: $${lower.filter(r => r.paid).reduce((s, r) => s + r.bonusNow, 0).toFixed(2)}`)
const refused = rows.reduce((s, r) => s + r.ignoredTyped, 0)
console.log(`\n  typed entries refused by the guards (duplicate / crew-stamped / implausible): ${refused}`)
console.log('\n  Report only. Nothing written.\n')
