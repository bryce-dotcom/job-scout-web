#!/usr/bin/env node
// True up imported Gusto paystubs to Gusto's own per-check tax split.
//
// The journal import (import-gusto-journal.mjs) had gross, net, total
// employee tax and total employer tax per check, and derived the split
// (federal vs state, SUI vs FUTA) with JobScout's own formulas. Gusto's
// "Year to date" report carries the real per-check federal income tax,
// Social Security, Medicare, state income tax, SUTA and FUTA. The W-2's
// box 2 and box 17, and the 941 and TC-941 lines, must be what Gusto
// actually withheld and deposited, so each imported stub is set to Gusto's
// numbers and its run's liabilities are re-summed from the stubs.
//
//   node scripts/trueup-gusto-taxes.mjs <ytd.txt> --company 3          dry run
//   node scripts/trueup-gusto-taxes.mjs <ytd.txt> --company 3 --apply
import fs from 'node:fs'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const flag = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1] }
const APPLY = args.includes('--apply')
const COMPANY_ID = Number(flag('--company'))
if (!file || !COMPANY_ID) { console.error('usage: trueup-gusto-taxes.mjs <ytd.txt> --company <id> [--apply]'); process.exit(1) }

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const U = env.VITE_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const api = async (m, p, b) => { const r = await fetch(`${U}/rest/v1/${p}`, { method: m, headers: H, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null }
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// ── Parse ───────────────────────────────────────────────────────────────
const text = fs.readFileSync(file, 'utf8')
const names = {}
for (const m of text.matchAll(/(\d+) ([A-Z][a-z]+ [A-Z][a-zA-Z]+)/g)) if (/^# *names|^#\s{3,}/m.test(text)) names[m[1]] = m[2]
const rows = []
for (const raw of text.split(/\r?\n/)) {
  const l = raw.trim(); if (!l || l.startsWith('#')) continue
  const [pd, type, idx, per, gross, fit, ss, med, sit, suta, futa] = l.split('|')
  if (!/^[RABC]$/.test(type)) continue                       // reversals and tax reconciliations are not stubs
  const [ps, pe] = per.split('~')
  const yr = (mmdd) => (mmdd.startsWith('12/') ? '2025' : '2026')   // Dec 16–31 period paid Jan 5
  const iso = (mmdd, y) => `${y}-${mmdd.slice(0, 2)}-${mmdd.slice(3, 5)}`
  rows.push({ payDate: iso(pd, '2026'), periodStart: iso(ps, yr(ps)), periodEnd: iso(pe, yr(pe)), name: names[idx], gross: +gross, fit: +fit, ss: +ss, med: +med, sit: +sit, suta: +suta, futa: +futa })
}
// Gusto ran the 04/06 payroll and reversed it the same day; neither was imported.
const reversedKeys = new Set(text.split(/\r?\n/).filter(l => l.split('|')[1] === 'V').map(l => { const [pd, , idx, per] = l.split('|'); return `${pd}|${idx}|${per}` }))
const live = rows.filter(r => !reversedKeys.has(`${r.payDate.slice(5).replace('-', '/')}|${Object.keys(names).find(k => names[k] === r.name)}|${r.periodStart.slice(5).replace('-', '/')}~${r.periodEnd.slice(5).replace('-', '/')}`))

// ── People ──────────────────────────────────────────────────────────────
const employees = await api('GET', `employees?select=id,name&company_id=eq.${COMPANY_ID}`)
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const ALIASES = { 'huntersensabaugh': 'Dusty Sensabaugh', 'alexanderburrows': 'Alex Burrows' }
const empFor = (gname) => employees.find(e => norm(e.name) === norm(gname)) || employees.find(e => norm(e.name) === norm(ALIASES[norm(gname)] || '')) || null

// ── Match stubs ─────────────────────────────────────────────────────────
const stubs = await api('GET', `paystubs?select=id,employee_id,payroll_run_id,pay_date,period_start,period_end,gross_pay,federal_income_tax,state_income_tax,social_security_employee,social_security_employer,medicare_employee,medicare_employer,sui,futa,net_pay&company_id=eq.${COMPANY_ID}&amendment_reason=ilike.*Imported from Gusto*`)
const updates = [], unmatched = [], unchanged = []
let dFit = 0, dSit = 0, dSui = 0, dFuta = 0
for (const g of live) {
  const e = empFor(g.name)
  if (!e) { unmatched.push(`${g.name} (no JobScout record)`); continue }
  const s = stubs.find(x => x.employee_id === e.id && x.pay_date === g.payDate && x.period_start === g.periodStart && Math.abs(Number(x.gross_pay) - g.gross) < 0.01)
  if (!s) { unmatched.push(`${g.name} paid ${g.payDate} ${g.periodStart}..${g.periodEnd} gross ${g.gross}`); continue }
  const patch = {
    federal_income_tax: g.fit, state_income_tax: g.sit,
    social_security_employee: g.ss, social_security_employer: g.ss,
    medicare_employee: g.med, medicare_employer: g.med,
    sui: g.suta, futa: g.futa,
  }
  const changed = Object.keys(patch).some(k => Math.abs(Number(s[k]) - patch[k]) > 0.004)
  // Net must still be gross − employee taxes − deductions; it is Gusto's net already.
  const eeTax = r2(g.fit + g.sit + g.ss + g.med)
  const impliedNet = r2(g.gross - eeTax)
  const netGap = r2(Number(s.net_pay) - impliedNet)
  if (!changed) { unchanged.push(s.id); continue }
  dFit += g.fit - Number(s.federal_income_tax); dSit += g.sit - Number(s.state_income_tax); dSui += g.suta - Number(s.sui); dFuta += g.futa - Number(s.futa)
  updates.push({ id: s.id, run: s.payroll_run_id, name: e.name, patch, netGap })
}
const stubsTouched = new Set(updates.map(u => u.id))
const stubsLeft = stubs.filter(s => !stubsTouched.has(s.id) && !unchanged.includes(s.id))

console.log(`${live.length} Gusto checks, ${stubs.length} imported stubs: ${updates.length} to correct, ${unchanged.length} already exact, ${stubsLeft.length} stubs with no Gusto line, ${unmatched.length} Gusto lines with no stub — ${APPLY ? 'APPLY' : 'dry run'}`)
for (const u of unmatched) console.log('  no stub:', u)
for (const s of stubsLeft) console.log('  no Gusto line: stub', s.id, 'run', s.payroll_run_id, s.pay_date)
console.log(`  shift in totals: federal ${dFit >= 0 ? '+' : ''}${r2(dFit)}, state ${dSit >= 0 ? '+' : ''}${r2(dSit)}, SUI ${dSui >= 0 ? '+' : ''}${r2(dSui)}, FUTA ${dFuta >= 0 ? '+' : ''}${r2(dFuta)}`)
const netOff = updates.filter(u => Math.abs(u.netGap) > 0.01)
console.log(`  net pay stays Gusto's on every stub${netOff.length ? `; ${netOff.length} stub(s) have a post-tax deduction of ${netOff.map(u => u.netGap.toFixed(2)).join(', ')} (unchanged)` : ''}`)
if (!APPLY) { console.log('\nDry run only. Add --apply to write.'); process.exit(0) }

// ── Apply ───────────────────────────────────────────────────────────────
for (const u of updates) await api('PATCH', `paystubs?id=eq.${u.id}&company_id=eq.${COMPANY_ID}`, u.patch)
console.log(`\nupdated ${updates.length} stubs`)
// Re-sum each touched run's liabilities from its stubs.
const runs = [...new Set(updates.map(u => u.run))]
let liabPatched = 0
for (const run of runs) {
  const rs = await api('GET', `paystubs?select=federal_income_tax,state_income_tax,social_security_employee,social_security_employer,medicare_employee,medicare_employer,sui,futa&company_id=eq.${COMPANY_ID}&payroll_run_id=eq.${run}`)
  const sum = (k) => r2(rs.reduce((a, x) => a + Number(x[k] || 0), 0))
  const want = {
    federal_income_tax: { amount_employee: sum('federal_income_tax'), amount_employer: 0 },
    social_security: { amount_employee: sum('social_security_employee'), amount_employer: sum('social_security_employer') },
    medicare: { amount_employee: sum('medicare_employee'), amount_employer: sum('medicare_employer') },
    futa: { amount_employee: 0, amount_employer: sum('futa') },
    state_income_tax: { amount_employee: sum('state_income_tax'), amount_employer: 0 },
    sui: { amount_employee: 0, amount_employer: sum('sui') },
  }
  const li = await api('GET', `payroll_tax_liabilities?select=id,kind,amount_employee,amount_employer&company_id=eq.${COMPANY_ID}&payroll_run_id=eq.${run}`)
  for (const [kind, w] of Object.entries(want)) {
    const row = li.find(x => x.kind === kind)
    if (row) {
      if (Math.abs(Number(row.amount_employee) - w.amount_employee) > 0.004 || Math.abs(Number(row.amount_employer) - w.amount_employer) > 0.004) {
        await api('PATCH', `payroll_tax_liabilities?id=eq.${row.id}`, { ...w, updated_at: new Date().toISOString() }); liabPatched++
      }
    } else if (w.amount_employee + w.amount_employer > 0) {
      // The import skipped zero rows; Gusto's split may make one non-zero (FUTA on a new hire).
      const tmpl = li[0]
      const full = await api('GET', `payroll_tax_liabilities?select=*&id=eq.${tmpl.id}`)
      const t = full[0]
      const isFed = ['federal_income_tax', 'social_security', 'medicare', 'futa'].includes(kind)
      await api('POST', 'payroll_tax_liabilities', [{
        company_id: COMPANY_ID, payroll_run_id: run, period_start: t.period_start, period_end: t.period_end,
        jurisdiction: isFed ? 'federal' : 'state', agency: isFed ? 'IRS' : (kind === 'sui' ? 'Utah DWS' : 'Utah State Tax Commission'),
        kind, due_date: t.due_date, ...w, paid_at: t.paid_at, paid_via: t.paid_via, notes: t.notes,
      }]); liabPatched++
    }
  }
}
console.log(`re-summed liabilities on ${runs.length} runs (${liabPatched} rows changed)`)
