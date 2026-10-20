// ONE authoritative picture, from complete data. Read-only.
//
// For every person: what they have earned (recomputed from every job,
// invoice, payment and utility invoice), what the ledger records, what a
// paystub actually paid, and what the difference is. Nothing is written.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { computeRepRows } from '../src/lib/repCommissions.js'
import { writeFileSync } from 'node:fs'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const m = (n) => '$' + (Number(n) || 0).toFixed(2)
const page = async (t, sel, f) => { const o = []; for (let i = 0; ; i += 1000) { let q = s.from(t).select(sel).range(i, i + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw new Error(`${t}: ${error.message}`); o.push(...(data || [])); if (!data || data.length < 1000) break } return o }
const co = q => q.eq('company_id', 3)

const [employees, jobs, invoices, payments, utilityInvoices, repLedger, leadLedger, bonusLedger, stubs] = await Promise.all([
  page('employees', '*', co),
  page('jobs', 'id, company_id, salesperson_id, lead_id, job_total, business_unit', co),
  page('invoices', 'id, job_id, amount, discount_applied, tax_amount, payment_status, updated_at, created_at', co),
  page('payments', 'id, invoice_id, amount, date', co),
  page('utility_invoices', 'id, job_id, incentive_amount, amount, project_cost, payment_status, paid_at', co),
  page('rep_commissions', '*', co),
  page('lead_commissions', '*', co),
  page('job_bonuses', '*', co),
  page('paystubs', 'employee_id, pay_date, commission_pay, bonus_pay', co),
])
const { data: cfgRow } = await s.from('settings').select('value').eq('company_id', 3).eq('key', 'payroll_config').maybeSingle()
const expected = computeRepRows({ employees, jobs, leads: [], invoices, payments, utilityInvoices, payrollConfig: cfgRow ? JSON.parse(cfgRow.value) : {} })
const keyOf = (r) => r.payment_id != null ? `p:${r.payment_id}:${r.employee_id}:${r.kind}`
  : r.utility_invoice_id != null ? `u:${r.utility_invoice_id}:${r.employee_id}:${r.kind}`
    : `i:${r.invoice_id}:${r.employee_id}:${r.kind}`
const ledgerKeys = new Set(repLedger.map(keyOf))
const nm = (i) => employees.find(e => e.id === i)?.name || `emp ${i}`

let out = `# Ground truth — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n\n`
out += `Recomputed from complete data: ${jobs.length} jobs, ${invoices.length} invoices, ${payments.length} payments, ${utilityInvoices.length} utility invoices. **Nothing was written.**\n\n`
out += `Three questions per person: what has been earned, what the ledger records, and what a cheque actually paid.\n\n`
out += `| Person | Pay basis | Earned (recomputed) | In the ledger | Missing from ledger | Ledger says paid | Paystubs paid | Marked paid, no stub |\n|---|---|---|---|---|---|---|---|\n`

const rows = []
for (const e of employees.filter(x => x.active)) {
  const exp = expected.filter(r => r.employee_id === e.id)
  const led = repLedger.filter(r => r.employee_id === e.id)
  const missing = exp.filter(r => !ledgerKeys.has(keyOf(r)))
  const ledPaid = led.filter(r => r.payment_status === 'paid')
  const myStubs = stubs.filter(x => x.employee_id === e.id)
  const stubPaid = myStubs.reduce((a, r) => a + (+r.commission_pay || 0), 0)
  let noStub = 0
  for (const r of ledPaid) {
    const d = r.paid_at ? String(r.paid_at).slice(0, 10) : null
    const on = d ? myStubs.filter(x => x.pay_date === d).reduce((a, x) => a + (+x.commission_pay || 0), 0) : 0
    if (on <= 0) noStub += +r.amount || 0
  }
  const sum = (a) => a.reduce((x, r) => x + (+r.amount || 0), 0)
  if (!exp.length && !led.length) continue
  // Salary-or-commission people are weighed, not paid twice: their commission
  // has to be RECORDED so the comparison is right, but a missing row is not
  // money owed. Reading their numbers as a payout would overstate this badly.
  const greaterOf = !!e.pay_greater_of_salary_commission
  const basis = greaterOf ? 'salary **or** commission (settles against salary)'
    : (Number(e.annual_salary) > 0 ? 'salary + commission' : 'commission only')
  rows.push({ name: e.name, basis, greaterOf, earned: sum(exp), inLedger: sum(led), missing: sum(missing), nMissing: missing.length, ledgerPaid: sum(ledPaid), stubPaid, noStub })
}
for (const r of rows.sort((a, b) => b.missing - a.missing)) {
  out += `| ${r.name} | ${r.basis} | ${m(r.earned)} | ${m(r.inLedger)} | ${r.nMissing ? `**${m(r.missing)}** (${r.nMissing})` : '—'} | ${m(r.ledgerPaid)} | ${m(r.stubPaid)} | ${r.noStub ? `**${m(r.noStub)}**` : '—'} |\n`
}
const owedRows = rows.filter(r => !r.greaterOf)
out += `\n**Missing rows that are real money owed** — everyone not on salary-or-commission: **${m(owedRows.reduce((a, r) => a + r.missing, 0))}**. `
out += `The rest sits on salary-or-commission people, where the row still has to exist for the comparison but is not a payout.\n`
const t = (k) => m(rows.reduce((a, r) => a + r[k], 0))
out += `\n**Totals** — earned ${t('earned')} · in ledger ${t('inLedger')} · missing ${t('missing')} · ledger-paid ${t('ledgerPaid')} · actually paid ${t('stubPaid')} · marked paid with no stub ${t('noStub')}\n`
writeFileSync('C:/JobScout/js-cal-wt/ground_truth.md', out)
console.log(out)
