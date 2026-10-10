#!/usr/bin/env node
// Backfill a company's payroll history from a Gusto payroll journal.
//
// Bryce, 2026-10-09: "backfill this year's info… we need JobScout to work
// perfectly before we let Gusto go." Everything downstream reads paystubs:
// the YTD column on every stub, the Social Security / FUTA / SUI caps, the
// quarter's 941, year-end W-2s. Until the Gusto checks are in, JobScout is
// computing all of that on a partial year.
//
// Input: the per-employee, per-payroll lines of Gusto's Payroll Journal
// (gross, employee taxes, employer taxes, net) — the figures the journal
// summary carries for every payroll. From those, each stub's lines are
// rebuilt the way the engine would have computed them:
//   Social Security 6.2% / Medicare 1.45% of gross (cap-aware by YTD)
//   FUTA 0.6% on the first $7,000 of the year
//   state unemployment = employer taxes − FICA − FUTA (Gusto's own number)
//   state income tax by the state's formula (lib/payrollTax, pinned to Gusto)
//   federal income tax = employee taxes − FICA − state (Gusto's own number)
// Gusto remitted every tax on these runs, so their liabilities are written
// as already paid. The Gusto journal row totals are the check on every run.
//
//   node scripts/import-gusto-journal.mjs <journal.txt> --company 3            dry run (default)
//   node scripts/import-gusto-journal.mjs <journal.txt> --company 3 --apply    write it
//   --replace-w2-in 1,2,3  these JobScout runs were back-entered for periods
//                          Gusto actually paid: drop their W-2 stubs and tax
//                          liabilities (Gusto's replace them), keep their 1099
//                          stubs, and re-total the run. Deleted rows are
//                          written to --backup <file> first.
//   --create-missing       a person Gusto paid who has no JobScout record gets
//                          an inactive W-2 employee row so the check is on the
//                          books for the W-2 and the 941
//   --payroll-frequency semimonthly
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const flag = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1] }
const APPLY = args.includes('--apply')
const COMPANY_ID = Number(flag('--company'))
const REPLACE = (flag('--replace-w2-in', '') || '').split(',').map(s => s.trim()).filter(Boolean).map(Number)
const BACKUP = flag('--backup')
const CREATE_MISSING = args.includes('--create-missing')
const FREQ = flag('--payroll-frequency', 'semimonthly')
if (!file || !COMPANY_ID) { console.error('usage: import-gusto-journal.mjs <journal.txt> --company <id> [--apply] [--replace-w2-in 1,2 --backup out.json] [--create-missing]'); process.exit(1) }

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const U = env.VITE_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const api = async (m, p, b) => { const r = await fetch(`${U}/rest/v1/${p}`, { method: m, headers: H, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null }
// src/lib uses extensionless imports (Vite resolves them); bundle it first.
const { build } = await import('esbuild')
const bundled = path.join(os.tmpdir(), 'jobscout-payrollTax-bundle.mjs')
await build({ entryPoints: ['src/lib/payrollTax.js'], bundle: true, format: 'esm', platform: 'node', outfile: bundled, logLevel: 'silent' })
const { calcStateIncomeTax, federalFor } = await import(pathToFileURL(bundled).href)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const iso = (mdy) => { const [m, d, y] = mdy.split('/'); return `${y}-${m}-${d}` }

// ── Parse ───────────────────────────────────────────────────────────────
const text = fs.readFileSync(file, 'utf8')
const payrolls = [], summary = {}
let cur = null
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  if (line.startsWith('k=')) { const [ps, pe, pd] = line.slice(2).split('|'); cur = { key: line.slice(2), periodStart: ps, periodEnd: pe, payDay: pd, rows: [] }; payrolls.push(cur); continue }
  if (line.startsWith('S=')) { const [n, g, ee, er, net] = line.slice(2).split(';'); summary[n] = { gross: +g, ee: +ee, er: +er, net: +net }; continue }
  const [n, g, ee, er, net] = line.split(';')
  if (n === 'Payroll Totals') cur.totals = { gross: +g, ee: +ee, er: +er, net: +net }
  else cur.rows.push({ name: n, gross: +g, ee: +ee, er: +er, net: +net })
}
// A payroll and its exact reversal (same key, totals cancel) net to nothing:
// Gusto voided and re-ran it. Skip both. A block with no period is an
// employer-tax adjustment with no stub behind it: report, do not import.
const byKey = {}
for (const p of payrolls) (byKey[p.key] = byKey[p.key] || []).push(p)
const skipped = []
const toImport = payrolls.filter(p => {
  if (!p.payDay) { skipped.push({ p, why: 'no pay period — employer tax adjustment only' }); return false }
  const twins = byKey[p.key]
  if (twins.length > 1 && Math.abs(twins.reduce((s, t) => s + (t.totals?.gross || 0), 0)) < 0.01) { skipped.push({ p, why: 'voided and re-run (nets to zero with its twin)' }); return false }
  if (!p.rows.some(r => r.gross !== 0)) { skipped.push({ p, why: 'no pay' }); return false }
  return true
})

// ── People ──────────────────────────────────────────────────────────────
const EMP_SELECT = 'id,name,tax_classification,w4_filing_status,is_hourly,is_salary,hourly_rate,annual_salary,active'
let employees = await api('GET', `employees?select=${EMP_SELECT}&company_id=eq.${COMPANY_ID}`)
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
// Gusto prints "Last First". Match on the full set of name tokens, then on a
// known alias.
const ALIASES = { 'sensabaughhunter': 'Dusty Sensabaugh', 'burrowsalexander': 'Alex Burrows' }
const matchEmployee = (gustoName) => {
  const parts = gustoName.trim().split(/\s+/)
  const first = parts.slice(1).join(' '), last = parts[0]
  const want = norm(first + last)
  let e = employees.find(x => norm(x.name) === want || norm(x.name) === norm(last + first))
  if (!e && ALIASES[norm(gustoName)]) e = employees.find(x => norm(x.name) === norm(ALIASES[norm(gustoName)]))
  return e || null
}
const unmatched = new Set()
for (const p of toImport) for (const r of p.rows) if (r.gross !== 0 || r.ee !== 0) { if (!matchEmployee(r.name)) unmatched.add(r.name) }
const created = []
if (CREATE_MISSING && unmatched.size) {
  for (const gname of [...unmatched]) {
    const parts = gname.trim().split(/\s+/); const name = [...parts.slice(1), parts[0]].join(' ')
    if (APPLY) {
      const [e] = await api('POST', 'employees', [{ company_id: COMPANY_ID, name, tax_classification: 'W2', active: false, is_hourly: true, hourly_rate: 0, role: 'Former employee (imported from Gusto)' }])
      employees.push(e)
    } else employees.push({ id: -(created.length + 1), name, tax_classification: 'W2', is_hourly: true, hourly_rate: 0, active: false })
    created.push(name); unmatched.delete(gname)
  }
}

// ── Rebuild each stub ───────────────────────────────────────────────────
const company = (await api('GET', `companies?select=id,state_employer_id_state,state&id=eq.${COMPANY_ID}`))[0]
const state = company.state_employer_id_state || company.state || 'UT'
toImport.sort((a, b) => iso(a.payDay).localeCompare(iso(b.payDay)) || iso(a.periodStart).localeCompare(iso(b.periodStart)))
const ytd = {}        // employee id -> { gross, ss }
const runsOut = [], problems = []
for (const p of toImport) {
  const payDate = iso(p.payDay)
  const fed = federalFor(payDate)
  const stubs = []
  for (const r of p.rows) {
    if (r.gross === 0 && r.ee === 0 && r.er === 0) continue
    const e = matchEmployee(r.name)
    if (!e) continue
    const y = ytd[e.id] || (ytd[e.id] = { gross: 0 })
    const ssTaxable = Math.min(r.gross, Math.max(0, fed.ssWageBase - y.gross))
    const ss = r2(ssTaxable * fed.ssRate), med = r2(r.gross * fed.medicareRate)
    const futa = r2(Math.min(r.gross, Math.max(0, fed.futaWageBase - y.gross)) * fed.futaRate)
    let sui = r2(r.er - ss - med - futa)
    if (sui < 0) { problems.push(`${p.key} ${r.name}: employer taxes below FICA+FUTA by ${(-sui).toFixed(2)} — SUI set to 0`); sui = 0 }
    let sit = calcStateIncomeTax({ gross: r.gross, state, filingStatus: e.w4_filing_status || 'single', payFrequency: FREQ, payDate })
    let fit = r2(r.ee - ss - med - sit)
    if (fit < 0) { problems.push(`${p.key} ${r.name}: employee taxes below FICA+state by ${(-fit).toFixed(2)} — state reduced to fit`); sit = r2(Math.max(0, r.ee - ss - med)); fit = 0 }
    const net = r2(r.net)
    const deductions = r2(r.gross - r.ee - net)   // anything Gusto took that is not tax
    y.gross += r.gross
    stubs.push({
      company_id: COMPANY_ID, employee_id: e.id,
      period_start: iso(p.periodStart), period_end: iso(p.periodEnd), pay_date: payDate,
      regular_hours: e.is_hourly && Number(e.hourly_rate) > 0 ? r2(r.gross / Number(e.hourly_rate)) : 0,
      overtime_hours: 0, pto_hours: 0,
      hourly_rate: Number(e.hourly_rate) || 0,
      salary_amount: e.is_salary ? r.gross : 0,
      gross_pay: r.gross, taxable_wages: r.gross,
      bonus_pay: 0, commission_pay: 0, reimbursement_pay: 0,
      federal_income_tax: fit, state_income_tax: sit,
      social_security_employee: ss, medicare_employee: med, additional_medicare: 0,
      social_security_employer: ss, medicare_employer: med, futa, sui,
      famli_employee: 0, famli_employer: 0,
      pre_tax_deductions: 0, post_tax_deductions: Math.max(0, deductions),
      net_pay: net,
      amendment_reason: 'Imported from Gusto payroll journal 2026-10-09',
    })
  }
  const tot = (k) => r2(stubs.reduce((s, x) => s + x[k], 0))
  const check = { gross: tot('gross_pay'), ee: r2(stubs.reduce((s, x) => s + x.federal_income_tax + x.state_income_tax + x.social_security_employee + x.medicare_employee, 0)), er: r2(stubs.reduce((s, x) => s + x.social_security_employer + x.medicare_employer + x.futa + x.sui, 0)), net: tot('net_pay') }
  const g = p.totals || { gross: 0, ee: 0, er: 0, net: 0 }
  const skippedRows = p.rows.filter(r => (r.gross !== 0 || r.ee !== 0) && !matchEmployee(r.name))
  const ok = Math.abs(check.gross + skippedRows.reduce((s, r) => s + r.gross, 0) - g.gross) < 0.02 && Math.abs(check.net + skippedRows.reduce((s, r) => s + r.net, 0) - g.net) < 0.02
  runsOut.push({ p, payDate, stubs, check, gusto: g, ok, skippedRows })
}

// ── Report ──────────────────────────────────────────────────────────────
console.log(`${toImport.length} payrolls to import, ${skipped.length} skipped, state ${state}, ${APPLY ? 'APPLY' : 'dry run'}`)
for (const s of skipped) console.log(`  skip  ${s.p.key || '(no period)'}: ${s.why}`)
if (created.length) console.log(`  created inactive W-2 record${created.length === 1 ? '' : 's'} for: ${created.join(', ')}${APPLY ? '' : ' (dry run: not written)'}`)
if (unmatched.size) console.log(`  people in Gusto with no JobScout record (their rows are NOT imported): ${[...unmatched].join(', ')}`)
let allOk = true
for (const r of runsOut) {
  allOk = allOk && r.ok
  console.log(`  ${r.ok ? 'ok ' : 'XX '} paid ${r.payDate}  ${r.p.periodStart}–${r.p.periodEnd}  ${r.stubs.length} stubs  gross ${r.check.gross.toFixed(2)} / Gusto ${r.gusto.gross.toFixed(2)}  net ${r.check.net.toFixed(2)} / ${r.gusto.net.toFixed(2)}${r.skippedRows.length ? `  (${r.skippedRows.length} unmatched row${r.skippedRows.length === 1 ? '' : 's'} left out)` : ''}`)
}
for (const m of problems) console.log('  note  ' + m)
// Year-to-date per person against Gusto's own summary.
const ytdByName = {}
for (const r of runsOut) for (const s of r.stubs) { const e = employees.find(x => x.id === s.employee_id); (ytdByName[e.id] = ytdByName[e.id] || { name: e.name, gross: 0, net: 0 }); ytdByName[e.id].gross += s.gross_pay; ytdByName[e.id].net += s.net_pay }
let ytdMismatch = 0
for (const [gname, g] of Object.entries(summary)) {
  if (gname === 'Totals') continue
  const e = matchEmployee(gname); const mine = e ? ytdByName[e.id] : null
  const dg = r2((mine?.gross || 0) - g.gross), dn = r2((mine?.net || 0) - g.net)
  if (Math.abs(dg) > 0.02 || Math.abs(dn) > 0.02) { ytdMismatch++; console.log(`  ytd   ${gname}: gross ${dg >= 0 ? '+' : ''}${dg.toFixed(2)}, net ${dn >= 0 ? '+' : ''}${dn.toFixed(2)} vs Gusto${e ? '' : ' (no JobScout record)'}`) }
}
console.log(`  year-to-date matches Gusto for ${Object.keys(summary).length - 1 - ytdMismatch} of ${Object.keys(summary).length - 1} people`)
if (!APPLY) { console.log('\nDry run only. Add --apply to write.'); process.exit(allOk ? 0 : 2) }
if (!allOk) { console.error('\nNot applying: a run does not reconcile to Gusto.'); process.exit(2) }

// ── Apply ───────────────────────────────────────────────────────────────
if (REPLACE.length) {
  const ids = `in.(${REPLACE.join(',')})`
  const w2Ids = employees.filter(e => e.tax_classification !== '1099').map(e => e.id)
  const oldStubs = await api('GET', `paystubs?select=*&company_id=eq.${COMPANY_ID}&payroll_run_id=${ids}&employee_id=in.(${w2Ids.join(',')})`)
  const oldLiab = await api('GET', `payroll_tax_liabilities?select=*&company_id=eq.${COMPANY_ID}&payroll_run_id=${ids}`)
  const oldRuns = await api('GET', `payroll_runs?select=*&company_id=eq.${COMPANY_ID}&id=${ids}`)
  if (!BACKUP) { console.error('--replace-w2-in needs --backup <file>'); process.exit(1) }
  fs.writeFileSync(BACKUP, JSON.stringify({ taken: new Date().toISOString(), company_id: COMPANY_ID, runs: oldRuns, paystubs: oldStubs, liabilities: oldLiab }, null, 1))
  console.log(`
backed up ${oldStubs.length} W-2 stubs, ${oldLiab.length} liabilities, ${oldRuns.length} runs to ${BACKUP}`)
  if (oldStubs.length) await api('DELETE', `paystubs?company_id=eq.${COMPANY_ID}&id=in.(${oldStubs.map(x => x.id).join(',')})`)
  if (oldLiab.length) await api('DELETE', `payroll_tax_liabilities?company_id=eq.${COMPANY_ID}&id=in.(${oldLiab.map(x => x.id).join(',')})`)
  for (const run of oldRuns) {
    const left = await api('GET', `paystubs?select=gross_pay&company_id=eq.${COMPANY_ID}&payroll_run_id=eq.${run.id}`)
    if (!left.length) { await api('DELETE', `payroll_runs?company_id=eq.${COMPANY_ID}&id=eq.${run.id}`); console.log(`  run ${run.id}: nothing left, removed`); continue }
    await api('PATCH', `payroll_runs?company_id=eq.${COMPANY_ID}&id=eq.${run.id}`, { total_gross: r2(left.reduce((a, x) => a + Number(x.gross_pay), 0)), employee_count: left.length })
    console.log(`  run ${run.id}: kept ${left.length} 1099 stubs, re-totaled`)
  }
}
const nextQuarterEnd = (d) => { const dt = new Date(d + 'T00:00:00'); const q = Math.floor(dt.getMonth() / 3); const end = new Date(dt.getFullYear(), q * 3 + 3, 0); const due = new Date(end.getFullYear(), end.getMonth() + 1, 0); return due.toISOString().slice(0, 10) }
let runsMade = 0, stubsMade = 0, liabMade = 0
for (const r of runsOut) {
  if (!r.stubs.length) continue
  const [run] = await api('POST', 'payroll_runs', [{ company_id: COMPANY_ID, period_start: iso(r.p.periodStart), period_end: iso(r.p.periodEnd), pay_date: r.payDate, status: 'completed', total_gross: r.check.gross, employee_count: r.stubs.length, created_by: null }])
  runsMade++
  const stubs = await api('POST', 'paystubs', r.stubs.map(s => ({ ...s, payroll_run_id: run.id })))
  stubsMade += stubs.length
  const sum = (k) => r2(r.stubs.reduce((s, x) => s + x[k], 0))
  const stamp = { company_id: COMPANY_ID, payroll_run_id: run.id, period_start: iso(r.p.periodStart), period_end: iso(r.p.periodEnd), paid_at: r.payDate + 'T12:00:00Z', paid_via: 'other', notes: 'Remitted by Gusto (imported payroll journal)' }
  const rows = [
    { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'federal_income_tax', due_date: r.payDate, amount_employee: sum('federal_income_tax'), amount_employer: 0 },
    { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'social_security', due_date: r.payDate, amount_employee: sum('social_security_employee'), amount_employer: sum('social_security_employer') },
    { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'medicare', due_date: r.payDate, amount_employee: sum('medicare_employee'), amount_employer: sum('medicare_employer') },
    { ...stamp, jurisdiction: 'federal', agency: 'IRS', kind: 'futa', due_date: nextQuarterEnd(r.payDate), amount_employee: 0, amount_employer: sum('futa') },
    { ...stamp, jurisdiction: 'state', agency: state === 'UT' ? 'Utah State Tax Commission' : 'State', kind: 'state_income_tax', due_date: r.payDate, amount_employee: sum('state_income_tax'), amount_employer: 0 },
    { ...stamp, jurisdiction: 'state', agency: state === 'UT' ? 'Utah DWS' : 'State Unemployment', kind: 'sui', due_date: nextQuarterEnd(r.payDate), amount_employee: 0, amount_employer: sum('sui') },
  ].filter(x => (x.amount_employee || 0) + (x.amount_employer || 0) > 0)
  if (rows.length) { const l = await api('POST', 'payroll_tax_liabilities', rows); liabMade += l.length }
}
console.log(`\nimported: ${runsMade} runs, ${stubsMade} stubs, ${liabMade} liability rows (all marked paid via Gusto)`)
