// What every bonus row will read as, using the real bonusJobLabel.
// Read-only: prints, writes nothing.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bonusJobLabel } from '../src/lib/bonusLedger.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data } = await sb.from('job_bonuses')
  .select('job_id, jobs(job_title, customer_name, job_id, customer:customers!customer_id(name, business_name))')
  .eq('company_id', 3)

const seen = new Set()
const rows = []
for (const b of data || []) {
  if (seen.has(b.job_id)) continue
  seen.add(b.job_id)
  rows.push({ ...bonusJobLabel(b), jobTitle: b.jobs?.job_title })
}

const headings = rows.map(r => r.heading)
console.log(`\ndistinct jobs: ${rows.length} · distinct headings: ${new Set(headings).size} · still identical: ${headings.length - new Set(headings).size}\n`)

const focus = /Steve Auto|Costco|Green River|Central Valley|Roderick|Eagle Heights|New Look|Berger/
console.log('the accounts that used to be ambiguous:')
for (const h of headings.filter(h => focus.test(h)).sort()) console.log('   ' + h.slice(0, 76))

const dupes = headings.filter((h, i) => headings.indexOf(h) !== i)
if (dupes.length) {
  console.log('\nheadings still shared by more than one job:')
  for (const d of [...new Set(dupes)]) console.log('   ' + d.slice(0, 76))
}
console.log('')
