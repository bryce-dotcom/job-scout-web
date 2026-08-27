#!/usr/bin/env node
// Link existing appointments to the job they were booked for.
//
// appointments.job_id was added 2026-08-27 (20260827120000_appointments_job_id.sql).
// Everything scheduled before that has no job_id, so this reconstructs the link
// from what PMJobSetter actually wrote at schedule time:
//
//   customer_id = the job's customer
//   title       = the job title, optionally "Service (kind): " prefixed and
//                 " (Employee Name)" suffixed when several people were assigned
//   notes       = "Job: <job title> | Assigned: <name>"
//
// It is a heuristic, so it is conservative and tiered. Anything it cannot prove
// stays NULL — that is exactly today's behaviour, so a miss is never a
// regression, only a missed improvement.
//
//   node scripts/backfill-appointment-job-id.mjs          dry run, prints the plan
//   node scripts/backfill-appointment-job-id.mjs --apply  write it
//
// Re-runnable: it only ever considers rows whose job_id is still NULL.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join } from 'node:path'

config({ path: join(import.meta.dirname, '..', '.env') })
const APPLY = process.argv.includes('--apply')
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(2)
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
// Undo the decorations PMJobSetter adds to the job title when it builds the
// appointment: a "Service (repair): " prefix for child service jobs, and a
// " (Jane Doe)" suffix when the job was assigned to more than one person.
const stripTitle = s => norm(s).replace(/^service \([^)]*\):\s*/, '').replace(/\s*\([^)]*\)\s*$/, '')
const notesTitle = s => norm((s || '').match(/Job:\s*(.+?)(?:\s*\||\n|$)/)?.[1] || '')

const { data: appts, error: aErr } = await sb
  .from('appointments')
  .select('id, company_id, customer_id, title, notes, start_time')
  .in('appointment_type', ['Job', 'Recurring Job'])
  .is('job_id', null)
if (aErr) { console.error('appointments:', aErr.message); process.exit(1) }

const { data: jobs, error: jErr } = await sb
  .from('jobs')
  .select('id, company_id, customer_id, job_title, job_id, start_date')
if (jErr) { console.error('jobs:', jErr.message); process.exit(1) }

const byCustomer = new Map()
for (const j of jobs) {
  const k = `${j.company_id}|${j.customer_id}`
  if (!byCustomer.has(k)) byCustomer.set(k, [])
  byCustomer.get(k).push(j)
}

const plan = []
const tally = { title: 0, sole_job: 0, title_then_date: 0, no_customer: 0, no_match: 0 }

for (const a of appts) {
  if (!a.customer_id) { tally.no_customer++; continue }
  const cands = byCustomer.get(`${a.company_id}|${a.customer_id}`) || []
  if (!cands.length) { tally.no_match++; continue }

  const at = stripTitle(a.title)
  const nt = notesTitle(a.notes)
  const hits = cands.filter(j => {
    const jt = stripTitle(j.job_title)
    return jt && (jt === at || jt === nt)
  })

  if (hits.length === 1) {
    tally.title++
    plan.push({ appt: a.id, job: hits[0].id, why: 'title' })
  } else if (hits.length > 1) {
    // Same customer, same job title, more than once — recurring work, or the
    // job was duplicated. Take the job whose start_date sits closest to when
    // the appointment was actually booked.
    const at_ms = a.start_time ? new Date(a.start_time).getTime() : null
    const dated = hits.filter(j => j.start_date)
    const pick = (at_ms && dated.length)
      ? dated.reduce((best, j) =>
          Math.abs(new Date(j.start_date).getTime() - at_ms) <
          Math.abs(new Date(best.start_date).getTime() - at_ms) ? j : best)
      : hits[0]
    tally.title_then_date++
    plan.push({ appt: a.id, job: pick.id, why: 'title+date' })
  } else if (cands.length === 1) {
    // Title does not match, but this customer has exactly one job and this is
    // a Job appointment — there is nothing else it could belong to.
    tally.sole_job++
    plan.push({ appt: a.id, job: cands[0].id, why: 'sole job' })
  } else {
    tally.no_match++
  }
}

console.log(`appointments needing a link: ${appts.length}`)
console.log(`  matched on title                 ${tally.title}`)
console.log(`  matched on title, dated tiebreak ${tally.title_then_date}`)
console.log(`  customer has exactly one job     ${tally.sole_job}`)
console.log(`  left NULL — no customer          ${tally.no_customer}`)
console.log(`  left NULL — no matching job      ${tally.no_match}`)
console.log(`  ----`)
console.log(`  will link                        ${plan.length}`)

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to write.')
  console.log(plan.slice(0, 10).map(p => `  appt ${p.appt} -> job ${p.job}  (${p.why})`).join('\n'))
  process.exit(0)
}

let done = 0, failed = 0
for (const p of plan) {
  const { error } = await sb.from('appointments').update({ job_id: p.job }).eq('id', p.appt)
  if (error) { failed++; console.error(`  appt ${p.appt}: ${error.message}`) } else { done++ }
}
console.log(`\nlinked ${done}${failed ? `, ${failed} failed` : ''}`)
