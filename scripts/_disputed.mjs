// Every row the ledger calls paid, tested against the cheque that paid it.
//
// Resolved by mechanism, not by anybody's memory. A run's gross counted
// staged commissions ONLY inside its own pay period, while the mark-paid
// query that followed had NO period filter. So a row earned outside the
// period of the run that stamped it cannot have been on that cheque — that
// is arithmetic.
//
// Rows are grouped by person, date and ledger before judging, because a
// cheque pays the SUM of that day's rows: testing one row at a time calls a
// correct payment a mismatch (Cole's two rows on 20 Sep sum to exactly the
// $4,835.88 his stub carried).
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const m = (n) => '$' + (Number(n) || 0).toFixed(2)
const page = async (t, sel, f) => {
  const o = []
  for (let i = 0; ; i += 1000) {
    let q = s.from(t).select(sel).range(i, i + 999)
    if (f) q = f(q)
    const { data, error } = await q
    if (error) throw new Error(`${t}: ${error.message}`)
    o.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return o
}
const co = q => q.eq('company_id', 3)

const [employees, rep, lead, bon, stubs, runs, jobs] = await Promise.all([
  page('employees', 'id, name', co),
  page('rep_commissions', '*', co),
  page('lead_commissions', '*', co),
  page('job_bonuses', '*', co),
  page('paystubs', '*', co),
  page('payroll_runs', 'id, period_start, period_end, pay_date, status', co),
  page('jobs', 'id, job_title, customer_name', co),
])
const nm = (i) => employees.find(e => e.id === i)?.name || `emp ${i}`
const jn = (i) => {
  const j = jobs.find(x => x.id === i)
  return j ? (j.job_title || j.customer_name || `job ${i}`) : `job ${i}`
}
const when = (r) => String(r.earned_at || r.accrued_at || '').slice(0, 10)

const rows = [
  ...rep.filter(r => r.payment_status === 'paid' && r.paid_at).map(r => ({ ...r, ledger: 'commission' })),
  ...lead.filter(r => r.payment_status === 'paid' && r.paid_at).map(r => ({ ...r, ledger: 'setter' })),
  ...bon.filter(r => r.status === 'paid' && r.paid_at).map(r => ({ ...r, ledger: 'bonus' })),
]

const groups = new Map()
for (const r of rows) {
  const k = `${r.employee_id}|${String(r.paid_at).slice(0, 10)}|${r.ledger}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

let out = '# The disputed payments, resolved\n\n'
out += 'Every row the ledger calls paid, tested against the payroll run that stamped it and the paystub that would have carried it.\n\n'
out += "A run's gross counted staged commissions **only inside its own pay period**, while the mark-paid query that followed had **no period filter**. Where a row was earned outside the period of the run that stamped it, the cheque could not have carried it.\n\n"
out += '| Person | Job(s) | Ledger | Amount | Stamped paid | Run period | Earned | Stub that day | Verdict |\n'
out += '|---|---|---|---|---|---|---|---|---|\n'

const verdicts = {}
for (const [k, g] of [...groups.entries()].sort((a, b) => a[0].split('|')[1].localeCompare(b[0].split('|')[1]))) {
  const [empIdStr, d, ledger] = k.split('|')
  const empId = Number(empIdStr)
  const run = runs.find(x => x.pay_date === d)
  const myStub = stubs.filter(x => x.employee_id === empId && x.pay_date === d)
  const stubAmt = myStub.reduce((a, x) => a + (ledger === 'bonus' ? (+x.bonus_pay || 0) : (+x.commission_pay || 0)), 0)
  const total = g.reduce((a, r) => a + (+r.amount || 0), 0)
  const earliest = g.map(when).filter(Boolean).sort()[0] || '?'
  const allInPeriod = run && g.every(r => { const e = when(r); return e && e >= run.period_start && e <= run.period_end })

  let verdict
  if (stubAmt > 0 && Math.abs(stubAmt - total) < 0.01) verdict = '**PAID** — the stub matches these rows to the cent'
  else if (stubAmt > 0) verdict = `**PARTIAL** — stub paid ${m(stubAmt)} against ${m(total)} of rows`
  else if (!run) verdict = '**NOT PAID** — no payroll run on that date at all'
  else if (!allInPeriod) verdict = "**NOT PAID** — earned outside the run's period, so the gross excluded it"
  else verdict = '**NOT PAID** — inside the period, but the stub shows nothing'

  const key = nm(empId)
  verdicts[key] = verdicts[key] || { paid: 0, notPaid: 0 }
  if (verdict.startsWith('**PAID')) verdicts[key].paid += total
  else if (verdict.startsWith('**PARTIAL')) { verdicts[key].paid += stubAmt; verdicts[key].notPaid += total - stubAmt }
  else verdicts[key].notPaid += total

  const jobsList = [...new Set(g.map(r => jn(r.job_id)))].join(', ')
  out += `| ${nm(empId)} | ${jobsList} | ${ledger} | ${m(total)} | ${d} | ${run ? `${run.period_start}..${run.period_end}` : '— none —'} | ${earliest} | ${m(stubAmt)} | ${verdict} |\n`
}

out += '\n## Per person\n\n| Person | Confirmed paid | Not paid — still owed |\n|---|---|---|\n'
for (const [k, v] of Object.entries(verdicts).sort((a, b) => b[1].notPaid - a[1].notPaid)) {
  out += `| ${k} | ${m(v.paid)} | ${v.notPaid > 0.01 ? `**${m(v.notPaid)}**` : '—'} |\n`
}
const owed = Object.values(verdicts).reduce((a, v) => a + v.notPaid, 0)
out += `\n**Total wrongly marked paid, still owed: ${m(owed)}**\n`
writeFileSync('C:/JobScout/js-cal-wt/disputed_resolved.md', out)
console.log(out)
