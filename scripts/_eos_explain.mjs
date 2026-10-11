// Every number on HHH's scorecard, with the jobs behind the profit rows.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { getWeekRange } from '../src/lib/eosWeek.js'
import { jobCosting } from '../src/lib/reports.js'
import { buildJobCostIndex, profitOnJobs, costingKey } from '../src/lib/eosProfit.js'
import { deliveredJobsInRange } from '../src/lib/jobMetrics.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, select = '*', scoped = true) {
  let rows = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(t).select(select).order('id', { ascending: true }).range(from, from + 999)
    if (scoped) q = q.eq('company_id', C)
    const { data, error } = await q
    if (error) { console.log('ERR', t, error.message); return rows }
    rows = rows.concat(data || [])
    if (!data || data.length < 1000) break
  }
  return rows
}
const w = getWeekRange(1)
const [jobs, jobLines, products, productComponents, jobBonuses, payments, invoices, plaid, expenses, employees, timeClock, st] = await Promise.all([
  page('jobs'), page('job_lines', 'id, job_id, item_id, quantity, labor_cost'),
  page('products_services', 'id, cost, material_or_labor'),
  sb.from('product_components').select('id, parent_product_id, component_product_id, quantity').then(r => r.data || []),
  page('job_bonuses', 'id, job_id, amount, status'), page('payments'), page('invoices'),
  page('plaid_transactions'), page('expenses'), page('employees', 'id, name, hourly_rate'),
  page('time_clock', 'id, employee_id, job_id, clock_in, clock_out, total_hours'),
  sb.from('settings').select('value').eq('company_id', C).eq('key', 'job_statuses').then(r => r.data),
])
const live = jobs.filter(j => j.status !== 'Archived')
const jobStatuses = JSON.parse(st?.[0]?.value || '[]')
const report = jobCosting({ jobs: live, jobLines, products, productComponents, jobBonuses, payments, invoices, plaidTransactions: plaid, manualExpenses: expenses, timeClock, employees })
const index = buildJobCostIndex(report.rows)
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()

for (const ent of ['HHH Building Services', 'Energy Scout']) {
  const done = deliveredJobsInRange(live.filter(j => j.business_unit?.toLowerCase() === ent.toLowerCase()), jobStatuses, w.start, w.end)
  const p = profitOnJobs(done, index)
  console.log(`\n================ ${ent} — week ${w.startDate}..${w.endDate} ================`)
  console.log(`${'JOB'.padEnd(18)} ${'WORTH'.padStart(9)} ${'COST'.padStart(9)} ${'HOURS'.padStart(6)} ${'PROFIT'.padStart(9)}  detail`)
  for (const j of done) {
    const row = report.rows.find(r => String(r.job || '').replace(/^[\s└─-]+/, '').trim() === costingKey(j))
    const worth = Number(j.job_total) || 0
    if (!row || row.total_cost == null) {
      console.log(`${String(j.job_id).padEnd(18)} ${money(worth).padStart(9)} ${'none'.padStart(9)} ${'-'.padStart(6)} ${'excluded'.padStart(9)}  no materials, hours or receipts recorded`)
      continue
    }
    const parts = []
    if (row.material) parts.push(`materials ${money(row.material)}`)
    if (row.labor) parts.push(`labour ${money(row.labor)}${row.labor_source === 'actual' ? ' (clocked)' : ' (estimated from lines)'}`)
    if (row.tagged_expense) parts.push(`receipts ${money(row.tagged_expense)}`)
    if (row.bonuses) parts.push(`bonuses ${money(row.bonuses)}`)
    console.log(`${String(j.job_id).padEnd(18)} ${money(worth).padStart(9)} ${money(row.total_cost).padStart(9)} ${String(Math.round((row.labor_hours || 0) * 10) / 10).padStart(6)} ${money(worth - row.total_cost).padStart(9)}  ${parts.join(', ')}`)
  }
  console.log(`${'-'.repeat(70)}`)
  console.log(`${'COUNTED'.padEnd(18)} ${money(p.value).padStart(9)} ${money(p.cost).padStart(9)} ${String(Math.round(p.hours * 10) / 10).padStart(6)} ${money(p.profit).padStart(9)}  ${p.costed} of ${done.length} jobs`)
  console.log(`Profit / Hour = ${money(p.profit)} ÷ ${Math.round(p.hours * 10) / 10} h = ${money(p.profitPerHour)}/h   margin ${Math.round(p.margin * 100)}%`)
  console.log(`Excluded: ${p.uncosted} jobs worth ${money(p.uncostedValue)} with no cost recorded`)
}
