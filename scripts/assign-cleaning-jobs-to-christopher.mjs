#!/usr/bin/env node
// HHH data cleanup (Bryce, 2026-09-24). Two rules, both "no salesperson on
// the job and none on its lead → Christopher Lyman (employee 14)":
//   1. every job in the cleaning business unit ("HHH Building Services")
//   2. every HousecallPro import (job_id starts with JOB-HCP-), any unit
// Other Energy Scout / no-unit jobs are left alone. updated_at is NOT
// bumped, so nothing moves into the current pipeline or pay window.
//
//   node scripts/assign-cleaning-jobs-to-christopher.mjs           # dry run
//   node scripts/assign-cleaning-jobs-to-christopher.mjs --apply   # write, and save the ids for a revert
//   node scripts/assign-cleaning-jobs-to-christopher.mjs --revert <ids.json>

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { buildLeadIndex, isUnattributed } from '../src/lib/jobOwnership.js'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const COMPANY = 3, CHRISTOPHER = 14, UNIT = 'HHH Building Services'
const argv = process.argv.slice(2)

if (argv.includes('--revert')) {
  const ids = JSON.parse(fs.readFileSync(argv[argv.indexOf('--revert') + 1], 'utf8'))
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from('jobs').update({ salesperson_id: null }).in('id', ids.slice(i, i + 200)).eq('company_id', COMPANY).eq('salesperson_id', CHRISTOPHER)
    if (error) throw error
  }
  console.log('reverted', ids.length)
  process.exit(0)
}

const { data: emp } = await sb.from('employees').select('id, name').eq('id', CHRISTOPHER).eq('company_id', COMPANY).single()
if (!emp) throw new Error('employee 14 is not Christopher at HHH')
let jobs = []
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from('jobs').select('id, job_id, job_title, status, job_total, lead_id, business_unit, created_at').eq('company_id', COMPANY).is('salesperson_id', null).or(`business_unit.eq.${UNIT},job_id.like.JOB-HCP-%`).range(f, f + 999)
  if (error) throw error
  if (!data?.length) break
  jobs.push(...data); if (data.length < 1000) break
}
const leadIds = [...new Set(jobs.map(j => j.lead_id).filter(Boolean).map(Number).filter(Number.isFinite))]
const leads = []
for (let i = 0; i < leadIds.length; i += 200) { const { data } = await sb.from('leads').select('id, salesperson_id, salesperson_ids').in('id', leadIds.slice(i, i + 200)); leads.push(...(data || [])) }
const idx = buildLeadIndex(leads)
const targets = jobs.filter(j => isUnattributed(j, idx))
const sum = a => '$' + Math.round(a.reduce((s, j) => s + (Number(j.job_total) || 0), 0)).toLocaleString()
const live = targets.filter(j => !['Archived', 'Cancelled'].includes(j.status))
const hcp = targets.filter(j => /^JOB-HCP-/.test(j.job_id || ''))
console.log(`${emp.name}: ${targets.length} unowned jobs (cleaning unit or HousecallPro import), ${sum(targets)} — live ${live.length} (${sum(live)}), archived/cancelled ${targets.length - live.length} (${sum(targets.filter(j => !live.includes(j)))}); HCP imports ${hcp.length} (${sum(hcp)})`)
const byUnit = {}; for (const j of targets) { const k = j.business_unit || '(none)'; byUnit[k] = (byUnit[k] || 0) + 1 }
console.log('by unit:', JSON.stringify(byUnit))
console.log('skipped because the lead already names a rep:', jobs.length - targets.length)
if (!argv.includes('--apply')) { console.log('dry run — add --apply'); process.exit(0) }
const ids = targets.map(j => j.id)
const out = `C:/Users/bwest/AppData/Local/Temp/claude/C--JobScout/6145c2b6-8310-4183-a6f4-8e40da2eadc9/scratchpad/christopher-assigned-${Date.now()}.json`
fs.writeFileSync(out, JSON.stringify(ids))
let done = 0
for (let i = 0; i < ids.length; i += 200) {
  const { error, count } = await sb.from('jobs').update({ salesperson_id: CHRISTOPHER }, { count: 'exact' }).in('id', ids.slice(i, i + 200)).eq('company_id', COMPANY).is('salesperson_id', null)
  if (error) throw error
  done += count || 0
}
console.log(`assigned ${done} jobs to ${emp.name}; ids saved to ${out}`)
