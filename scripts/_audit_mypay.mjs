import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
// The REAL shipped rules — not a re-implementation.
import { earnedRepInPeriod } from '../src/lib/repCommissions.js'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const m = (n) => '$' + (Number(n) || 0).toFixed(2)
const page = async (t, sel, f) => { const out = []; for (let i = 0; ; i += 1000) { let q = s.from(t).select(sel).range(i, i + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw new Error(`${t}: ${error.message}`); out.push(...(data || [])); if (!data || data.length < 1000) break } return out }
const co = q => q.eq('company_id', 3)

const emps = await page('employees', 'id, name, active', co)
const rep = await page('rep_commissions', '*', co)
const lead = await page('lead_commissions', '*', co)
const bon = await page('job_bonuses', '*', co)
const stubs = await page('paystubs', 'employee_id, pay_date, period_start, period_end, commission_pay, bonus_pay, gross_pay', co)

let out = `# Every employee — is My Pay right?\n\nChecked ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against the live database, using the same functions the app now runs.\n\n`
out += `| Employee | My Pay will show owed | Commission | Setter | Bonus | Held for review | Ever paid on a stub | Marked paid, no stub |\n|---|---|---|---|---|---|---|---|\n`

const problems = []
let totOwed = 0, totGap = 0
for (const e of emps.filter(x => x.active).sort((a, b) => a.name.localeCompare(b.name))) {
  // exactly what My Pay now totals
  const commOwed = earnedRepInPeriod(rep, e.id)
  const setterOwed = lead.filter(r => r.employee_id === e.id && r.payment_status !== 'paid' && r.payment_status !== 'void').reduce((a, r) => a + (+r.amount || 0), 0)
  const myBon = bon.filter(r => r.employee_id === e.id)
  const bonOwed = myBon.filter(r => r.status === 'accrued' && !r.needs_verification).reduce((a, r) => a + (+r.amount || 0), 0)
  const bonHeld = myBon.filter(r => r.status === 'accrued' && r.needs_verification).reduce((a, r) => a + (+r.amount || 0), 0)
  const owed = commOwed + setterOwed + bonOwed

  const myStubs = stubs.filter(x => x.employee_id === e.id)
  const paidStub = myStubs.reduce((a, r) => a + (+r.commission_pay || 0) + (+r.bonus_pay || 0), 0)
  // rows the ledger calls paid whose pay date carried nothing on a stub
  const paidRows = [...rep, ...bon].filter(r => r.employee_id === e.id && (r.payment_status === 'paid' || r.status === 'paid') && r.paid_at)
  let gap = 0
  for (const r of paidRows) {
    const d = String(r.paid_at).slice(0, 10)
    const onStub = myStubs.filter(x => x.pay_date === d).reduce((a, x) => a + (+x.commission_pay || 0) + (+x.bonus_pay || 0), 0)
    if (onStub <= 0) gap += +r.amount || 0
  }
  totOwed += owed; totGap += gap
  if (owed > 0 || gap > 0) {
    out += `| ${e.name} | **${m(owed)}** | ${m(commOwed)} | ${m(setterOwed)} | ${m(bonOwed)} | ${m(bonHeld)} | ${m(paidStub)} | ${gap > 0 ? `**${m(gap)}**` : '—'} |\n`
  }
  if (gap > 0) problems.push(`${e.name}: ${m(gap)} marked paid with nothing on a paystub that day`)
}
out += `\n**Total owed across the company: ${m(totOwed)}** · **marked paid with no paystub: ${m(totGap)}**\n`
out += `\n## Needs a human decision\n\n`
for (const p of problems) out += `- ${p}\n`
writeFileSync('C:/JobScout/js-cal-wt/mypay_audit.md', out)
console.log(out)
