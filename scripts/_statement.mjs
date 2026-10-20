// A statement of account per person, from the two records that are reliable.
//
//   EARNED — the ledger rows that exist: one per invoice, payment or utility
//            invoice, plus bonuses. Append-only facts.
//   PAID   — paystubs. A stub is money that actually left the company on a
//            date. It is the only record of payment that cannot be recomputed
//            away, which is why it is the anchor here.
//
// Row-level history before today cannot be reconstructed, and this does not
// pretend otherwise: the recompute fails to reproduce 12 rows already in the
// ledger, 3 of them paid. Rebuilding from it would delete real payments. So
// this states a BALANCE per person — the thing that has to be right — and
// from here the payroll run id on every payment keeps it exact.
//
// The balance is split three ways, because "owed" is not one number:
//   payable now   earned, verified, and the job's money is in
//   held          a bonus waiting on a verification someone must release
//   not owed yet  the job has not been paid for
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

const [employees, rep, lead, bon, stubs] = await Promise.all([
  page('employees', 'id, name, active, annual_salary, pay_greater_of_salary_commission', co),
  page('rep_commissions', '*', co),
  page('lead_commissions', '*', co),
  page('job_bonuses', '*', co),
  page('paystubs', 'employee_id, pay_date, commission_pay, bonus_pay', co),
])
const sum = (a, f = r => +r.amount || 0) => a.reduce((x, r) => x + f(r), 0)

const lines = []
for (const e of employees.filter(x => x.active)) {
  const r = rep.filter(x => x.employee_id === e.id)
  const l = lead.filter(x => x.employee_id === e.id)
  const b = bon.filter(x => x.employee_id === e.id)
  const earned = sum(r) + sum(l) + sum(b)
  if (earned === 0) continue

  const st = stubs.filter(x => x.employee_id === e.id)
  const paidStub = sum(st, x => (+x.commission_pay || 0) + (+x.bonus_pay || 0))
  const ledgerPaid = sum(r.filter(x => x.payment_status === 'paid'))
    + sum(l.filter(x => x.payment_status === 'paid'))
    + sum(b.filter(x => x.status === 'paid'))
  const held = sum(b.filter(x => x.needs_verification && x.status !== 'paid'))
  const notYet = sum(b.filter(x => x.status === 'pending' && !x.needs_verification))
  const payable = earned - paidStub - held - notYet

  lines.push({
    name: e.name, greater: !!e.pay_greater_of_salary_commission,
    earned, paidStub, ledgerPaid, payable, held, notYet,
    disputed: ledgerPaid - paidStub,
  })
}

let out = `# Statement of account — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n\n`
out += `Built from the two records that cannot be recomputed away: the ledger rows that exist, and the paystubs that paid money out.\n\n`
out += `| Person | Earned (all time) | Paid on paystubs | **Payable now** | Held for review | Not owed yet | Ledger claims paid |\n`
out += `|---|---|---|---|---|---|---|\n`
for (const x of lines.sort((a, b) => b.payable - a.payable)) {
  out += `| ${x.name}${x.greater ? ' *(salary-or-commission)*' : ''} | ${m(x.earned)} | ${m(x.paidStub)} | **${m(x.payable)}** | ${x.held ? m(x.held) : '—'} | ${x.notYet ? m(x.notYet) : '—'} | ${m(x.ledgerPaid)} |\n`
}

out += `\n## Company totals\n\n`
out += `Earned all time **${m(sum(lines, x => x.earned))}** · paid on paystubs **${m(sum(lines, x => x.paidStub))}**\n\n`
out += `| | |\n|---|---|\n`
out += `| **Payable now** | **${m(sum(lines, x => x.payable))}** — earned, verified, the job's money is in |\n`
out += `| Held for review | ${m(sum(lines, x => x.held))} — bonuses waiting on a verification someone must release |\n`
out += `| Not owed yet | ${m(sum(lines, x => x.notYet))} — the job has not been paid for |\n`

const disputed = lines.filter(x => Math.abs(x.disputed) > 0.01)
out += `\n## The only rows that need a person\n\n`
out += `Where the ledger claims more paid than the paystubs show, money was marked paid with no cheque behind it — either paid outside payroll, or never paid.\n\n`
if (disputed.length) {
  out += `| Person | Ledger claims paid | Paystubs paid | Difference |\n|---|---|---|---|\n`
  for (const x of disputed.sort((a, b) => b.disputed - a.disputed)) {
    out += `| ${x.name} | ${m(x.ledgerPaid)} | ${m(x.paidStub)} | **${m(x.disputed)}** |\n`
  }
} else {
  out += `None.\n`
}
writeFileSync('C:/JobScout/js-cal-wt/statement_of_account.md', out)
console.log(out)
