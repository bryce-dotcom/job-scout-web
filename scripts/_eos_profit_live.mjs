// Live check of the new profit metrics for HHH, through the real page code.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { AUTO_SOURCES } from '../src/pages/admin/EOS.jsx'
import { getWeekRange } from '../src/lib/eosWeek.js'
import { mergeJobHourSources } from '../src/lib/jobHours.js'
import { jobCosting } from '../src/lib/reports.js'
import { buildJobCostIndex, profitOnJobs } from '../src/lib/eosProfit.js'
import { deliveredJobsInRange } from '../src/lib/jobMetrics.js'
import { DEFAULT_TZ } from '../src/lib/dateTz.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function all(table, select, scoped = true) {
  let rows = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).order('id', { ascending: true }).range(from, from + 999)
    if (scoped) q = q.eq('company_id', C)
    const { data, error } = await q
    if (error) { console.log(`  QUERY FAILED ${table}: ${error.message}`); return rows }
    rows = rows.concat(data || [])
    if (!data || data.length < 1000) break
  }
  return rows
}
// Exactly the selects the page now issues — a wrong column 400s the whole
// query and PostgREST hands back nothing, which reads as $0 and says nothing.
const [jobLines, products, productComponents, jobBonuses] = await Promise.all([
  all('job_lines', 'id, job_id, item_id, quantity, labor_cost'),
  all('products_services', 'id, cost, material_or_labor'),
  all('product_components', 'id, parent_product_id, component_product_id, quantity', false),
  all('job_bonuses', 'id, job_id, amount, status'),
])
console.log(`page selects OK — job_lines ${jobLines.length}, products ${products.length}, components ${productComponents.length}, bonuses ${jobBonuses.length}`)

const [jobs, payments, invoices, plaid, expenses, employees, timeClock, timeLog, st] = await Promise.all([
  all('jobs', '*'), all('payments', '*'), all('invoices', '*'), all('plaid_transactions', '*'),
  all('expenses', '*'), all('employees', 'id, name, hourly_rate'),
  all('time_clock', 'id, employee_id, job_id, clock_in, clock_out, total_hours'), all('time_log', '*'),
  sb.from('settings').select('value').eq('company_id', C).eq('key', 'job_statuses').then(r => r.data),
])
const live = jobs.filter(j => j.status !== 'Archived')
const jobStatuses = JSON.parse(st?.[0]?.value || '[]')
const jobCostIndex = buildJobCostIndex(jobCosting({
  jobs: live, jobLines, products, productComponents, jobBonuses,
  payments, invoices, plaidTransactions: plaid, manualExpenses: expenses, timeClock, employees,
}).rows)
const d = {
  jobs: live, leads: [], invoices, utilityInvoices: [], payments, appointments: [], timeLogs: timeLog,
  hourEntries: mergeJobHourSources({ timeClock, timeLog }), expenses, plaidTransactions: plaid,
  quotes: [], leadPayments: [], submittals: [], jobStatuses, jobCostIndex, tz: DEFAULT_TZ,
}
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
for (const w of [1, 2]) {
  const r = getWeekRange(w)
  console.log(`\n=== week ${r.startDate}..${r.endDate} ===`)
  for (const ent of [null, 'HHH Building Services', 'Energy Scout']) {
    const done = deliveredJobsInRange(ent ? live.filter(j => j.business_unit?.toLowerCase() === ent.toLowerCase()) : live, jobStatuses, r.start, r.end)
    const p = profitOnJobs(done, jobCostIndex)
    const run = k => AUTO_SOURCES[k].compute(d, r.start, r.end, r.startDate, r.endDate, ent)
    console.log(`  ${(ent || 'ALL UNITS').padEnd(24)} completed ${String(done.length).padStart(3)}  worth ${money(p.value + p.uncostedValue).padStart(10)}`)
    console.log(`      costed ${p.costed}/${done.length}: worth ${money(p.value)} − cost ${money(p.cost)} = PROFIT ${money(run('job_profit'))} (${Math.round(p.margin * 100)}% margin)`)
    console.log(`      hours on them ${Math.round(p.hours * 10) / 10} → PROFIT/HOUR ${money(run('profit_per_hour'))}`)
    console.log(`      no cost recorded: ${run('jobs_missing_cost')} jobs worth ${money(p.uncostedValue)}`)
  }
}
