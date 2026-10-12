// Live cost mix per business unit, through the real page code.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { jobCosting } from '../src/lib/reports.js'
import { overheadRatePerHour } from '../src/lib/overhead.js'
import { buildJobCostIndex, profitOnJobs, costingKey } from '../src/lib/eosProfit.js'
import { deliveredJobsInRange } from '../src/lib/jobMetrics.js'
import { getWeekRange } from '../src/lib/eosWeek.js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()

async function page(table, select = '*', scoped = true) {
  let out = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).order('id').range(from, from + 999)
    if (scoped) q = q.eq('company_id', C)
    const { data, error } = await q
    if (error) { console.log('ERR', table, error.message); return out }
    out = out.concat(data || [])
    if (!data || data.length < 1000) break
  }
  return out
}

const [jobs, jobLines, products, comps, bonuses, payments, invoices, plaid, expenses, employees, timeClock, st, companyRow] = await Promise.all([
  page('jobs'),
  page('job_lines', 'id, job_id, item_id, quantity, labor_cost'),
  page('products_services', 'id, cost, material_or_labor'),
  sb.from('product_components').select('id, parent_product_id, component_product_id, quantity').then(r => r.data || []),
  page('job_bonuses', 'id, job_id, amount, status'),
  page('payments'),
  page('invoices'),
  page('plaid_transactions'),
  page('expenses'),
  page('employees', 'id, name, hourly_rate, annual_salary, salary, is_salary, pay_type'),
  page('time_clock', 'id, employee_id, job_id, clock_in, clock_out, total_hours'),
  sb.from('settings').select('value').eq('company_id', C).eq('key', 'job_statuses').then(r => r.data),
  sb.from('companies').select('futa_rate_pct, sui_rate_pct, sui_wage_base, workers_comp_class_codes, state').eq('id', C).single().then(r => r.data),
])

const live = jobs.filter(j => j.status !== 'Archived')
const jobStatuses = JSON.parse(st?.[0]?.value || '[]')

const oh = overheadRatePerHour({ expenses, plaidTransactions: plaid, timeClock })
console.log('OVERHEAD POOL ' + money(oh.pool) + ' over ' + oh.hours + ' job hours (' + oh.from + '..' + oh.to + ') = ' + money(oh.perHour) + '/hour')
console.log('  ' + oh.included.map(x => x.category + ' ' + money(x.amount)).join(', ') + '\n')

const report = jobCosting({
  jobs: live, jobLines, products, productComponents: comps, jobBonuses: bonuses,
  payments, invoices, plaidTransactions: plaid, manualExpenses: expenses,
  timeClock, employees, company: companyRow, overheadPerHour: oh.perHour,
})
const index = buildJobCostIndex(report.rows)
const w = getWeekRange(1)
console.log('WEEK ' + w.startDate + '..' + w.endDate + '\n')

for (const ent of ['HHH Building Services', 'Energy Scout']) {
  const done = deliveredJobsInRange(live.filter(j => j.business_unit && j.business_unit.toLowerCase() === ent.toLowerCase()), jobStatuses, w.start, w.end)
  const p = profitOnJobs(done, index)
  let mat = 0, lab = 0, exp = 0, bon = 0, ovh = 0
  for (const j of done) {
    const r = report.rows.find(x => String(x.job || '').replace(/^[\s└─-]+/, '').trim() === costingKey(j))
    if (!r || r.total_cost == null) continue
    mat += r.material || 0
    lab += r.labor || 0
    exp += r.tagged_expense || 0
    bon += r.bonuses || 0
    ovh += r.overhead || 0
  }
  console.log('=== ' + ent + ' — ' + done.length + ' completed, ' + p.costed + ' costed ===')
  console.log('  worth ' + money(p.value) + '   cost ' + money(p.cost) + '   profit ' + money(p.profit) + '   ' + Math.round(p.margin * 100) + '% margin')
  console.log('  parts ' + money(mat) + ' | labour ' + money(lab) + ' | receipts ' + money(exp) + ' | bonuses ' + money(bon) + ' | overhead ' + money(ovh))
  console.log('  hours ' + (Math.round(p.hours * 10) / 10) + ' -> profit/hour ' + money(p.profitPerHour))
  console.log('  uncosted: ' + p.uncosted + ' jobs worth ' + money(p.uncostedValue) + '\n')
}
