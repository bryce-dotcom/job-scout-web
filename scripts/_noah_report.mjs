import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const NOAH = 34
const m = (n) => '$' + (Number(n) || 0).toFixed(2)
const { data: rc } = await s.from('rep_commissions').select('*').eq('company_id', 3).eq('employee_id', NOAH).order('earned_at')
const { data: st } = await s.from('paystubs').select('pay_date, period_start, period_end, commission_pay').eq('employee_id', NOAH).order('pay_date')
const jobIds = [...new Set(rc.map(r => r.job_id))]
const { data: jobs } = await s.from('jobs').select('id, job_title, customer_name').in('id', jobIds)
const jn = (id) => { const j = (jobs || []).find(x => x.id === id); return j ? (j.job_title || j.customer_name || `job ${id}`) : `job ${id}` }

let o = `# Noah Free — commission history\n\nPulled ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. HHH Services.\n\n`
o += `## Dubois, the one he is asking about\n\n`
const d = rc.find(r => r.job_id === 23438)
o += `| | |\n|---|---|\n`
o += `| Job | Dubois (JOB-MSND6TKS), he is the salesperson |\n`
o += `| What came in | The utility incentive, ${m(6978)}, paid 25 Sep 2026 |\n`
o += `| Customer's own invoice | ${m(14149)} raised, ${m(7171)} the customer's share — **still unpaid, no payments recorded** |\n`
o += `| His commission | ${m(d.amount)} (8.5% of the incentive) |\n`
o += `| Status in the system | **${d.payment_status}** — never paid, never queued for a payroll run |\n`
o += `| On any paystub | No |\n\n`
o += `**He is right.** The system is not claiming it was paid — it says "earned". Nobody queued it, and he has had no paystub at all in the two runs since the money came in.\n\n`

o += `## Every commission he has earned\n\n| Earned | Job | Kind | Amount | Status | On a paystub? |\n|---|---|---|---|---|---|\n`
const stubBy = new Map((st || []).map(r => [r.pay_date, parseFloat(r.commission_pay) || 0]))
for (const r of rc) {
  const paidDate = r.paid_at ? String(r.paid_at).slice(0, 10) : null
  const onStub = paidDate && (stubBy.get(paidDate) || 0) > 0
  o += `| ${String(r.earned_at).slice(0, 10)} | ${jn(r.job_id)} | ${r.kind} | ${m(r.amount)} | ${r.payment_status}${paidDate ? ` (${paidDate})` : ''} | ${r.payment_status === 'paid' ? (onStub ? 'yes' : '**NO**') : '—'} |\n`
}
o += `\n## What his paystubs actually paid\n\n| Pay date | Period | Commission |\n|---|---|---|\n`
for (const r of st || []) o += `| ${r.pay_date} | ${r.period_start}..${r.period_end} | ${m(r.commission_pay)} |\n`
const everPaid = (st || []).reduce((a, r) => a + (parseFloat(r.commission_pay) || 0), 0)
const ledgerPaid = rc.filter(r => r.payment_status === 'paid').reduce((a, r) => a + (+r.amount || 0), 0)
const owed = rc.filter(r => r.payment_status !== 'paid').reduce((a, r) => a + (+r.amount || 0), 0)
o += `\n## The bottom line\n\n| | |\n|---|---|\n`
o += `| Commission that has reached a cheque | **${m(everPaid)}** |\n`
o += `| Commission the ledger calls paid | ${m(ledgerPaid)} |\n`
o += `| Difference — marked paid, never on a paystub | **${m(ledgerPaid - everPaid)}** |\n`
o += `| Earned and still unpaid (incl. Dubois ${m(d.amount)}) | **${m(owed)}** |\n`
writeFileSync('C:/JobScout/js-cal-wt/noah_free_commissions.md', o)
console.log(o.slice(0, 1400))
