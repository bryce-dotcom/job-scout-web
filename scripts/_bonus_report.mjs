import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const money = (n) => '$' + (Number(n) || 0).toFixed(2)

const rows = []
for (let from = 0; ; from += 1000) {
  const { data } = await s.from('job_bonuses').select('*').eq('company_id', 3).order('id').range(from, from + 999)
  rows.push(...(data || [])); if (!data || data.length < 1000) break
}
const { data: stubs } = await s.from('paystubs').select('employee_id, pay_date, bonus_pay').eq('company_id', 3).gt('bonus_pay', 0)
const { data: emps } = await s.from('employees').select('id, name').eq('company_id', 3)
const { data: jobs } = await s.from('jobs').select('id, job_title').eq('company_id', 3).limit(1000)
const name = (id) => (emps || []).find(e => e.id === id)?.name || `employee ${id}`
const jobName = (id) => (jobs || []).find(j => j.id === id)?.job_title || `job ${id}`
const sum = (rs) => rs.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0)

let out = `# Efficiency bonuses — what has been paid, and what is owed\n\n`
out += `Pulled ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC for HHH Services.\n\n`
out += `## The short version\n\n`
out += `| | |\n|---|---|\n`
out += `| Paid out on paystubs, ever | ${money((stubs||[]).reduce((a,r)=>a+(parseFloat(r.bonus_pay)||0),0))} |\n`
out += `| Owed now (accrued) | ${money(sum(rows.filter(r => r.status === 'accrued')))} |\n`
out += `| Not owed yet — job's money not in (pending) | ${money(sum(rows.filter(r => r.status === 'pending')))} |\n`
out += `| Recorded as paid in the ledger | ${money(sum(rows.filter(r => r.status === 'paid')))} |\n`
out += `| Held pending verification | ${rows.filter(r => r.needs_verification).length} rows, ${money(sum(rows.filter(r => r.needs_verification)))} |\n\n`

out += `## What the paystubs actually paid\n\n| Pay date | People | Amount |\n|---|---|---|\n`
const byDate = {}
for (const st of stubs || []) {
  byDate[st.pay_date] = byDate[st.pay_date] || { n: 0, amt: 0 }
  byDate[st.pay_date].n++; byDate[st.pay_date].amt += parseFloat(st.bonus_pay) || 0
}
for (const d of Object.keys(byDate).sort()) out += `| ${d} | ${byDate[d].n} | ${money(byDate[d].amt)} |\n`

out += `\n## Where the ledger disagrees with the paystubs\n\n`
out += `A row carries a \`paid_at\` when someone marked it paid. Until today nothing recorded WHICH payroll run paid it, so where the two disagree there is no third record to settle it.\n\n`
out += `| Marked paid on | Person | Ledger says | Paystub paid | |\n|---|---|---|---|---|\n`
const grp = new Map()
for (const r of rows.filter(r => r.paid_at)) {
  const k = `${r.employee_id}|${String(r.paid_at).slice(0, 10)}`
  if (!grp.has(k)) grp.set(k, [])
  grp.get(k).push(r)
}
const stubMap = new Map()
for (const st of stubs || []) {
  const k = `${st.employee_id}|${st.pay_date}`
  stubMap.set(k, (stubMap.get(k) || 0) + (parseFloat(st.bonus_pay) || 0))
}
let unmatched = 0
for (const k of [...grp.keys()].sort((a, b) => a.split('|')[1].localeCompare(b.split('|')[1]))) {
  const [e, d] = k.split('|')
  const l = sum(grp.get(k)), p = stubMap.get(k) || 0
  const verdict = Math.abs(l - p) < 0.01 ? 'matches — now locked as paid' : p === 0 ? 'no bonus on any paystub that day' : 'paystub paid less'
  if (Math.abs(l - p) >= 0.01) unmatched += Math.min(l, p) === 0 ? 0 : p
  out += `| ${d} | ${name(Number(e))} | ${money(l)} | ${money(p)} | ${verdict} |\n`
}
out += `\n**Still to settle:** paystubs paid ${money((stubs||[]).reduce((a,r)=>a+(parseFloat(r.bonus_pay)||0),0))} of bonuses in total. ${money(sum(rows.filter(r => r.status === 'paid')))} of that is locked to specific rows. The rest cannot be tied to particular jobs, so those rows currently read as owed and would be paid again if nobody intervenes.\n`

out += `\n## Owed right now, by person\n\n| Person | Rows | Owed | Held for verification |\n|---|---|---|---|\n`
const byEmp = {}
for (const r of rows.filter(r => r.status === 'accrued')) {
  byEmp[r.employee_id] = byEmp[r.employee_id] || { n: 0, amt: 0, held: 0, heldAmt: 0 }
  byEmp[r.employee_id].n++; byEmp[r.employee_id].amt += parseFloat(r.amount) || 0
  if (r.needs_verification) { byEmp[r.employee_id].held++; byEmp[r.employee_id].heldAmt += parseFloat(r.amount) || 0 }
}
for (const [id, g] of Object.entries(byEmp).sort((a, b) => b[1].amt - a[1].amt)) {
  out += `| ${name(Number(id))} | ${g.n} | ${money(g.amt)} | ${g.held} rows, ${money(g.heldAmt)} |\n`
}

out += `\n## The jobs Alayda asked about\n\n| Job | Status | Bonus rows | Total | Reads as |\n|---|---|---|---|---|\n`
for (const jid of [23285, 23438, 23408, 23294, 23051, 23272]) {
  const rs = rows.filter(r => r.job_id === jid)
  const st = [...new Set(rs.map(r => r.status))].join(', ')
  const { data: j } = await s.from('jobs').select('status').eq('id', jid).single()
  out += `| ${jobName(jid)} | ${j?.status || '?'} | ${rs.length} | ${money(sum(rs))} | ${st || 'no rows'} |\n`
}
writeFileSync('C:/JobScout/js-cal-wt/bonus_reconciliation.md', out)
console.log(out.slice(0, 1800))
