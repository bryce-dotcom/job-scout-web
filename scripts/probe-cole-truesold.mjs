// What SHOULD Cole's "sold" number be? A cumulative figure: every deal he
// won in the window, wherever it has since moved to. Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3, ID = 16
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const YEAR = '2026-01-01T00:00:00Z'

const { data: jobs } = await sb.from('jobs')
  .select('id, job_id, status, job_total, start_date, created_at, quote_id, lead_id')
  .eq('company_id', CO).eq('salesperson_id', ID)
const { data: quotes } = await sb.from('quotes')
  .select('id, quote_id, quote_amount, status, approved_date, created_at, lead_id')
  .eq('company_id', CO).eq('salesperson_id', ID)

const ytdJobs = (jobs || []).filter(j => (j.created_at || '') >= YEAR)
const allJobs = jobs || []
const sum = a => a.reduce((s, j) => s + (Number(j.job_total) || 0), 0)

// Approved estimates that never became a job — real sales not yet converted.
const jobQuoteIds = new Set((jobs || []).map(j => j.quote_id).filter(Boolean))
const approvedYtd = (quotes || []).filter(q =>
  q.approved_date && q.approved_date >= YEAR.slice(0, 10) && !jobQuoteIds.has(q.id))
const qsum = a => a.reduce((s, q) => s + (Number(q.quote_amount) || 0), 0)

console.log('COLE — what he actually sold\n')
console.log(`This year (job created_at >= Jan 1):`)
console.log(`  jobs sold, ANY stage                 ${String(ytdJobs.length).padStart(3)}   ${money(sum(ytdJobs)).padStart(14)}`)
console.log(`  + approved estimates not yet a job   ${String(approvedYtd.length).padStart(3)}   ${money(qsum(approvedYtd)).padStart(14)}`)
console.log(`  TRUE SOLD YTD                              ${money(sum(ytdJobs) + qsum(approvedYtd)).padStart(14)}`)
console.log(`\nAll time:`)
console.log(`  jobs sold, ANY stage                 ${String(allJobs.length).padStart(3)}   ${money(sum(allJobs)).padStart(14)}`)

console.log('\nYTD jobs by stage — note NONE are in a "Won" stage any more:')
const by = new Map()
for (const j of ytdJobs) {
  const k = j.status || '(none)'
  if (!by.has(k)) by.set(k, { n: 0, amt: 0 })
  const b = by.get(k); b.n++; b.amt += Number(j.job_total) || 0
}
for (const [k, v] of [...by.entries()].sort((a, b) => b[1].amt - a[1].amt))
  console.log(`  ${k.padEnd(24)} ${String(v.n).padStart(3)}   ${money(v.amt).padStart(14)}`)

console.log('\nHow many YTD jobs would the board even FETCH?')
const nullStart = ytdJobs.filter(j => !j.start_date)
console.log(`  with a start_date:    ${ytdJobs.length - nullStart.length}`)
console.log(`  start_date is NULL:   ${nullStart.length}   ${money(sum(nullStart))}  <-- dropped by .gte('start_date', cutoff)`)
