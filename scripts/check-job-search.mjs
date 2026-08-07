// Old vs new job search, over the real job table. Read-only.
//
//   npx vite-node scripts/check-job-search.mjs

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchesJobSearch, jobSearchRank } from '../src/lib/jobSearch.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const jobs = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('jobs')
    .select('id, job_id, job_title, customer_name, business_name, job_address, address, phone, email, status, assigned_team, business_unit, notes')
    .eq('company_id', 3).range(from, from + 999)
  if (error) throw new Error(error.message)
  jobs.push(...(data || []))
  if (!data || data.length < 1000) break
}

// The matcher this replaced: one substring test over eight fields.
const oldMatch = (job, term) => {
  const t = String(term || '').toLowerCase()
  if (!t) return true
  return !!(job.job_title?.toLowerCase().includes(t)
    || job.job_address?.toLowerCase().includes(t)
    || job.customer?.name?.toLowerCase().includes(t)
    || job.customer_name?.toLowerCase().includes(t)
    || job.job_id?.toLowerCase().includes(t)
    || job.customer?.business_name?.toLowerCase().includes(t)
    || job.business_name?.toLowerCase().includes(t)
    || job.notes?.toLowerCase().includes(t))
}

const QUERIES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'costco',
  'window cleaning costco',   // two words, different fields
  'draper pressure',
  'scheduled',                // a status — old search never looked
  'hhh building',             // a business unit
  '8631',                     // a job number
  'salt lake highbay',
]

console.log(`\n${jobs.length} jobs\n`)
console.log('query                          old    new   ')
for (const q of QUERIES) {
  const o = jobs.filter(j => oldMatch(j, q)).length
  const n = jobs.filter(j => matchesJobSearch(j, q)).length
  const flag = n > o ? '  <- found what the old one missed' : (n < o ? '  <- narrower (extra word now counts)' : '')
  console.log(`  ${q.padEnd(28)}${String(o).padStart(5)}${String(n).padStart(7)}${flag}`)
}

// Ranking: does an exact job number come first?
const byId = jobs.filter(j => matchesJobSearch(j, '8631'))
  .map((job, i) => ({ job, i, rank: jobSearchRank(job, '8631') }))
  .sort((a, b) => a.rank - b.rank || a.i - b.i)
if (byId.length) {
  console.log(`\nsearching "8631" -> ${byId.length} hits, first is job_id ${byId[0].job.job_id} (rank ${byId[0].rank})`)
}
console.log('')
