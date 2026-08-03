// Simulate SalesPipeline's exact job-selection logic against Cole's real
// rows, to find where the ~$98k gap comes from. Read-only.
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

const { data: jobs } = await sb.from('jobs')
  .select('id, job_id, status, job_total, start_date, created_at, salesperson_id')
  .eq('company_id', CO).eq('salesperson_id', ID)

const TERMINAL = ['Completed', 'Verified Complete', 'Invoiced', 'Paid', 'Closed']
const yearStart = new Date(2026, 0, 1).toISOString()
const todayStr = new Date().toISOString().split('T')[0]

const kept = [], dropped = []
for (const j of jobs || []) {
  const amt = Number(j.job_total) || 0
  const terminal = TERMINAL.includes(j.status)

  // 1. The DB query. Terminal jobs are filtered by start_date >= cutoff.
  //    Postgres drops NULLs on a .gte() comparison.
  if (terminal) {
    if (!j.start_date) { dropped.push([j, amt, 'terminal, start_date is NULL -> .gte() excludes it']); continue }
    if (new Date(j.start_date).toISOString() < yearStart) { dropped.push([j, amt, `terminal, start_date ${j.start_date} is before this year`]); continue }
  }

  // 2. Scheduled jobs whose start date already passed are skipped entirely.
  if (j.status === 'Scheduled' || j.status === 'Needs scheduling') {
    const d = j.start_date ? new Date(j.start_date).toISOString().split('T')[0] : null
    if (d && d < todayStr) { dropped.push([j, amt, `scheduled, start_date ${d} already passed`]); continue }
  }

  // 3. The card's created_at is overwritten with start_date, and the sold
  //    total drops any row whose created_at is unreadable.
  const cardCreatedAt = j.start_date
  if (!cardCreatedAt) { dropped.push([j, amt, 'card created_at = start_date = NULL -> excluded from the total']); continue }
  if (new Date(cardCreatedAt).toISOString() < yearStart) { dropped.push([j, amt, `card date ${cardCreatedAt} is before this year`]); continue }

  kept.push([j, amt])
}

const sum = a => a.reduce((s, r) => s + r[1], 0)
console.log(`Cole, jobs where he is the salesperson: ${(jobs || []).length}`)
console.log(`\nWhat the pipeline SHOWS:  ${String(kept.length).padStart(3)} jobs   ${money(sum(kept)).padStart(14)}`)
console.log(`What it DROPS:            ${String(dropped.length).padStart(3)} jobs   ${money(sum(dropped)).padStart(14)}`)
console.log(`True total:               ${String((jobs || []).length).padStart(3)} jobs   ${money(sum(kept) + sum(dropped)).padStart(14)}`)

console.log('\n--- dropped, and why ---')
for (const [j, amt, why] of dropped.sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(j.job_id || j.id).padEnd(15)} ${String(j.status).padEnd(20)} ${money(amt).padStart(13)}  ${why}`)
}

const nullStart = (jobs || []).filter(j => !j.start_date)
console.log(`\nCole jobs with NULL start_date: ${nullStart.length} (${money(nullStart.reduce((s, j) => s + (Number(j.job_total) || 0), 0))})`)
console.log('\nsold-date vs scheduled-date for the dropped ones:')
for (const [j] of dropped.slice(0, 10)) {
  console.log(`  ${String(j.job_id || j.id).padEnd(15)} created_at=${(j.created_at || 'null').slice(0, 10)}  start_date=${(j.start_date || 'null').toString().slice(0, 10)}`)
}
