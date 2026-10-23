// Recompute a run's employer-only taxes (FUTA, state unemployment) from the
// stubs' wages and the year-to-date before each stub, at the rate in force.
//
// Why: HHH's 20 Sep 2026 run (payroll_run 13) was computed with the wrong
// unemployment rate (0.1%, corrected to 0.2% afterwards) and with a
// year-to-date that did not yet include the Gusto-paid wages (imported
// 9 Oct), so FUTA was charged past the $7,000 base. Employer side only: no
// employee figure and no net changes. Liabilities for the run are re-summed
// from the stubs, unpaid rows only.
//
//   node scripts/trueup-employer-tax.mjs --company 3 --run 13            dry run
//   node scripts/trueup-employer-tax.mjs --company 3 --run 13 --apply

import fs from 'node:fs'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const COMPANY_ID = Number(flag('--company')), RUN_ID = Number(flag('--run')), APPLY = args.includes('--apply')
if (!COMPANY_ID || !RUN_ID) { console.error('usage: trueup-employer-tax.mjs --company <id> --run <id> [--apply]'); process.exit(1) }

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const U = env.VITE_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const api = async (m, p, b) => { const r = await fetch(`${U}/rest/v1/${p}`, { method: m, headers: H, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null }
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// The same figures the engine uses (supabase/functions/_shared): FUTA $7,000
// at 0.6% after the state credit; Utah's 2026 base $50,700 at the company's rate.
const FUTA_BASE = 7000, FUTA_RATE = 0.006
const SUI_BASE = { UT: 50700 }

const [run] = await api('GET', `payroll_runs?select=*&company_id=eq.${COMPANY_ID}&id=eq.${RUN_ID}`)
if (!run) { console.error('no such run'); process.exit(1) }
const [co] = await api('GET', `companies?select=state,state_employer_id_state,sui_rate_pct,sui_wage_base&id=eq.${COMPANY_ID}`)
const state = String(co.state_employer_id_state || co.state || 'UT').toUpperCase()
const suiRate = Number(co.sui_rate_pct) / 100
const suiBase = Number(co.sui_wage_base) || SUI_BASE[state] || 50700
const emps = await api('GET', `employees?select=id,tax_classification&company_id=eq.${COMPANY_ID}`)
const w2 = new Set(emps.filter(e => e.tax_classification !== '1099').map(e => e.id))

const year = run.pay_date.slice(0, 4)
const stubs = await api('GET', `paystubs?select=id,employee_id,payroll_run_id,pay_date,gross_pay,taxable_wages,futa,sui&company_id=eq.${COMPANY_ID}&pay_date=gte.${year}-01-01&pay_date=lte.${run.pay_date}&order=pay_date,payroll_run_id,id`)
const before = {}
for (const s of stubs) {
  if (s.payroll_run_id === RUN_ID || (s.pay_date === run.pay_date && s.payroll_run_id > RUN_ID)) continue
  before[s.employee_id] = (before[s.employee_id] || 0) + (Number(s.taxable_wages) || Number(s.gross_pay) || 0)
}

const updates = []
let dFuta = 0, dSui = 0
for (const s of stubs.filter(x => x.payroll_run_id === RUN_ID)) {
  if (!w2.has(s.employee_id)) continue
  const wages = Number(s.taxable_wages) || Number(s.gross_pay) || 0
  const ytd = before[s.employee_id] || 0
  const futa = r2(Math.min(wages, Math.max(0, FUTA_BASE - ytd)) * FUTA_RATE)
  const sui = r2(Math.min(wages, Math.max(0, suiBase - ytd)) * suiRate)
  if (Math.abs(futa - Number(s.futa)) > 0.004 || Math.abs(sui - Number(s.sui)) > 0.004) {
    updates.push({ id: s.id, employee_id: s.employee_id, from: { futa: Number(s.futa), sui: Number(s.sui) }, to: { futa, sui } })
    dFuta += futa - Number(s.futa); dSui += sui - Number(s.sui)
  }
}
console.log(`run ${RUN_ID} paid ${run.pay_date}, ${state} SUI ${co.sui_rate_pct}% on $${suiBase}: ${updates.length} stub(s) change; FUTA ${dFuta >= 0 ? '+' : ''}${r2(dFuta)}, SUI ${dSui >= 0 ? '+' : ''}${r2(dSui)} — ${APPLY ? 'APPLY' : 'dry run'}`)
for (const u of updates) console.log(`  stub ${u.id} emp ${u.employee_id}: futa ${u.from.futa} → ${u.to.futa}, sui ${u.from.sui} → ${u.to.sui}`)
if (!APPLY) { console.log('\nDry run only. Add --apply to write.'); process.exit(0) }

for (const u of updates) await api('PATCH', `paystubs?id=eq.${u.id}&company_id=eq.${COMPANY_ID}`, u.to)
const rs = await api('GET', `paystubs?select=futa,sui&company_id=eq.${COMPANY_ID}&payroll_run_id=eq.${RUN_ID}`)
const sum = (k) => r2(rs.reduce((a, x) => a + Number(x[k] || 0), 0))
const li = await api('GET', `payroll_tax_liabilities?select=id,kind,amount_employer,paid_at&company_id=eq.${COMPANY_ID}&payroll_run_id=eq.${RUN_ID}&kind=in.(futa,sui)`)
for (const row of li) {
  const want = sum(row.kind)
  if (row.paid_at) { console.log(`  ${row.kind} liability already paid (${row.amount_employer}); left alone, correct figure ${want}`); continue }
  if (Math.abs(Number(row.amount_employer) - want) > 0.004) { await api('PATCH', `payroll_tax_liabilities?id=eq.${row.id}`, { amount_employer: want, updated_at: new Date().toISOString() }); console.log(`  ${row.kind} liability ${row.amount_employer} → ${want}`) }
}
console.log(`updated ${updates.length} stubs`)
