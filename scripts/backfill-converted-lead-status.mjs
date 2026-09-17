#!/usr/bin/env node
// Backfill: converted leads that carry the app's ORIGINAL default delivery
// stage names ('Job Scheduled', 'Job Complete') get the company's own stage,
// the way lib/leadDeliveryStatus now writes them. The pipeline fetches leads
// by stage id, so these rows were never loaded (HHH: 62 on 2026-09-17).
//
//   node scripts/backfill-converted-lead-status.mjs              # dry run, all companies
//   node scripts/backfill-converted-lead-status.mjs --company 3  # dry run, one company
//   node scripts/backfill-converted-lead-status.mjs --company 3 --apply
//
// Rule per lead: if it has a live (non-archived) job, mirror that job's
// status; otherwise the nearest configured status by meaning (Scheduled /
// Completed). Companies with no configured job statuses are skipped: their
// delivery columns ARE the defaults, so their rows are already right.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { leadStatusForJob } from '../src/lib/leadDeliveryStatus.js'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const onlyCompany = argv.includes('--company') ? Number(argv[argv.indexOf('--company') + 1]) : null
const LEGACY = ['Job Scheduled', 'Job Complete']

const { data: leads, error } = await sb.from('leads').select('id, company_id, customer_name, status').in('status', LEGACY).order('company_id')
if (error) throw error
const byCompany = new Map()
for (const l of leads) { if (onlyCompany && l.company_id !== onlyCompany) continue; (byCompany.get(l.company_id) || byCompany.set(l.company_id, []).get(l.company_id)).push(l) }

let planned = 0
for (const [cid, rows] of byCompany) {
  const { data: setting } = await sb.from('settings').select('value').eq('company_id', cid).eq('key', 'job_statuses').maybeSingle()
  let statuses = []
  try { statuses = setting?.value ? JSON.parse(setting.value) : [] } catch { statuses = [] }
  const ids = statuses.map(s => typeof s === 'string' ? s : s?.name).filter(Boolean)
  if (ids.length === 0 || LEGACY.every(s => ids.includes(s))) { console.log(`company ${cid}: ${rows.length} rows, default delivery stages — nothing to do`); continue }
  const leadIds = rows.map(r => r.id)
  const { data: jobs } = await sb.from('jobs').select('lead_id, job_lead_id, status, updated_at').eq('company_id', cid).neq('status', 'Archived')
    .or(`lead_id.in.(${leadIds.join(',')}),job_lead_id.in.(${leadIds.join(',')})`).order('updated_at', { ascending: false })
  const jobByLead = new Map()
  for (const j of jobs || []) for (const k of [String(j.lead_id), String(j.job_lead_id)]) if (k && !jobByLead.has(k)) jobByLead.set(k, j)
  console.log(`company ${cid}: ${rows.length} rows; statuses = ${ids.join(' | ')}`)
  for (const r of rows) {
    const job = jobByLead.get(String(r.id))
    const next = leadStatusForJob(job?.status || r.status, statuses)
    if (next === r.status) continue
    planned++
    console.log(`  ${r.id} ${String(r.customer_name || '').slice(0, 28).padEnd(28)} ${r.status.padEnd(14)} -> ${next.padEnd(16)} ${job ? `(job ${job.status})` : '(no live job)'}`)
    if (apply) {
      const { error: e } = await sb.from('leads').update({ status: next }).eq('id', r.id)
      if (e) console.log('    FAILED:', e.message)
    }
  }
}
console.log(apply ? `applied ${planned} updates` : `dry run: ${planned} rows would change (add --apply)`)
