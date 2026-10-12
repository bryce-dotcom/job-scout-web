// Does computed labour (on jobs + off jobs) agree with the bank's payroll?
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { offJobLabourCost } from '../src/lib/overhead.js'
import { hourlyCostRate } from '../src/lib/laborRate.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
async function page(t, s = '*') {
  let o = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(t).select(s).eq('company_id', C).order('id').range(f, f + 999)
    if (error) { console.log('ERR', t, error.message); return o }
    o = o.concat(data || []); if (!data || data.length < 1000) break
  }
  return o
}
const [employees, timeClock, plaid, company] = await Promise.all([
  page('employees', 'id, name, hourly_rate, annual_salary, salary, is_salary, is_hourly, pay_type, active'),
  page('time_clock', 'id, employee_id, job_id, clock_in, clock_out, total_hours'),
  page('plaid_transactions', 'id, amount, user_category, ai_category, date, is_transfer'),
  sb.from('companies').select('futa_rate_pct, sui_rate_pct, sui_wage_base, workers_comp_class_codes').eq('id', C).single().then(r => r.data),
])
const to = new Date().toISOString().slice(0, 10)
const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
const inWin = (d) => { const k = String(d || '').slice(0, 10); return k >= from && k <= to }

const empById = new Map(employees.map(e => [String(e.id), e]))
let jobLabour = 0, jobHours = 0
for (const p of timeClock) {
  if (!p.job_id || !inWin(p.clock_in)) continue
  let h = Number(p.total_hours)
  if (!(h > 0)) h = p.clock_in && p.clock_out ? (new Date(p.clock_out) - new Date(p.clock_in)) / 36e5 : 0
  if (!(h > 0)) continue
  jobHours += h
  jobLabour += h * hourlyCostRate(empById.get(String(p.employee_id)), company)
}
const off = offJobLabourCost({ employees, timeClock, company, from, to })
const bank = plaid.filter(t => Number(t.amount) > 0 && !t.is_transfer && inWin(t.date) && /payroll|wages|salar/i.test(t.user_category || t.ai_category || ''))
  .reduce((s, t) => s + Number(t.amount), 0)

console.log(`window ${from}..${to} (${off.days} days)\n`)
console.log(`charged to jobs:        ${money(jobLabour)}  (${Math.round(jobHours)} hours)`)
console.log(`charged to overhead:    ${money(off.total)}`)
console.log(`computed total labour:  ${money(jobLabour + off.total)}`)
console.log(`bank payroll debits:    ${money(bank)}`)
const gap = (jobLabour + off.total) - bank
console.log(`difference:             ${money(gap)}  (${bank ? Math.round(gap / bank * 100) : 0}% of the bank figure)`)
console.log('\noff-job labour by person:')
for (const x of off.perEmployee) console.log(`  ${String(x.name).padEnd(22)} ${money(x.cost).padStart(10)}  ${x.jobHours}h on jobs, ${x.offJobHours}h off  [${x.basis}]`)
