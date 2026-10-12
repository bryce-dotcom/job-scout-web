import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { jobCosting } from '../src/lib/reports.js'
import { buildJobCostIndex, profitOnJobs, costingKey } from '../src/lib/eosProfit.js'
import { deliveredJobsInRange } from '../src/lib/jobMetrics.js'
import { getWeekRange } from '../src/lib/eosWeek.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, s = '*', scoped = true) {
  let o = []
  for (let f = 0; ; f += 1000) {
    let q = sb.from(t).select(s).order('id').range(f, f + 999)
    if (scoped) q = q.eq('company_id', C)
    const { data, error } = await q
    if (error) { console.log('ERR', t, error.message); return o }
    o = o.concat(data || []); if (!data || data.length < 1000) break
  }
  return o
}
const [jobs, jobLines, products, comps, bonuses, payments, invoices, plaid, expenses, employees, timeClock, st] = await Promise.all([
  page('jobs'), page('job_lines', 'id, job_id, item_id, quantity, labor_cost'),
  page('products_services', 'id, cost, material_or_labor'),
  sb.from('product_components').select('id, parent_product_id, component_product_id, quantity').then(r => r.data || []),
  page('job_bonuses', 'id, job_id, amount, status'), page('payments'), page('invoices'),
  page('plaid_transactions'), page('expenses'), page('employees', 'id, name, hourly_rate, annual_salary, salary, is_salary, pay_type'),
  page('time_clock', 'id, employee_id, job_id, clock_in, clock_out, total_hours'),
  sb.from('settings').select('value').eq('company_id', C).eq('key', 'job_statuses').then(r => r.data),
])
const live = jobs.filter(j => j.status !== 'Archived')
const jobStatuses = JSON.parse(st?.[0]?.value || '[]')
const { data: companyRow } = await sb.from('companies').select('futa_rate_pct, sui_rate_pct, workers_comp_class_codes').eq('id', C).single()
const report = jobCosting({ jobs: live, jobLines, products, productComponents: comps, jobBonuses: bonuses, payments, invoices, plaidTransactions: plaid, manualExpenses: expenses, timeClock, employees, company: companyRow })
const index = buildJobCostIndex(report.rows)
const money = n => '$' + Math.round(n).toLocaleString()
const w = getWeekRange(1)
console.log(`WEEK ${w.startDate}..${w.endDate}\n`)
for (const ent of ['HHH Building Services', 'Energy Scout']) {
  const done = deliveredJobsInRange(live.filter(j => j.business_unit?.toLowerCase() === ent.toLowerCase()), jobStatuses, w.start, w.end)
  const p = profitOnJobs(done, index)
  let mat = 0, lab = 0, exp = 0, bon = 0, actualLab = 0, estLab = 0
  for (const j of done) {
    const r = report.rows.find(x => String(x.job || '').replace(/^[\s└─-]+/, '').trim() === costingKey(j))
    if (!r || r.total_cost == null) continue
    mat += r.material || 0; lab += r.labor || 0; exp += r.tagged_expense || 0; bon += r.bonuses || 0
    if (r.labor_source === 'actual') actualLab += r.labor || 0; else estLab += r.labor || 0
  }
  console.log(`=== ${ent} — ${done.length} completed, ${p.costed} costed ===`)
  console.log(`  worth ${money(p.value)}   cost ${money(p.cost)}   profit ${money(p.profit)}   ${Math.round(p.margin * 100)}% margin`)
  console.log(`  cost mix: parts ${money(mat)} | labour ${money(lab)} | receipts ${money(exp)} | bonuses ${money(bon)}`)
  console.log(`            labour from real punches ${money(actualLab)}, estimated from lines ${money(estLab)}`)
  console.log(`  hours on them ${Math.round(p.hours * 10) / 10} -> profit/hour ${money(p.profitPerHour)}`)
  console.log(`  uncosted: ${p.uncosted} jobs worth ${money(p.uncostedValue)}\n`)
}
console.log('=== CAN WE TELL A PARTS RECEIPT FROM ANY OTHER SPEND? ===')
const jobExp = expenses.filter(e => e.job_id)
const cats = {}
for (const e of jobExp) { const k = e.category || '(no category)'; cats[k] = (cats[k] || 0) + 1 }
console.log('expenses tagged to a job, by category:', JSON.stringify(cats))
const jobPlaid = plaid.filter(t => (t.job_id || t.ai_job_id) && Number(t.amount) > 0 && !t.is_transfer)
const pcats = {}
for (const t of jobPlaid) { const k = t.category || t.ai_category || '(no category)'; pcats[k] = (pcats[k] || 0) + 1 }
console.log('bank debits tagged to a job, by category:', JSON.stringify(pcats))
