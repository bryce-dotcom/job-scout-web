// Set a rep's commission rate and re-sync their frozen commission rows.
//
// Report-only unless --write. Uses the REAL syncRepCommissions from
// src/lib/repCommissions.js rather than a second copy of the math — writing
// the rule twice is what has broken this app repeatedly (invoice lines x5,
// job ownership x4, material/labor split x2).
//
// Why this exists: Damien Hargett sold 4 jobs and earned nothing. His rate had
// only ever been entered in commission_setter_rate; computeRepRows reads
// commission_services_rate / commission_goods_rate, both 0, so it produced no
// rows and nothing anywhere said why. is_commission was already true.
//
//   node scripts/resync-rep-commissions.mjs --employee 72
//   node scripts/resync-rep-commissions.mjs --employee 72 --rate 8.5 --write

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncRepCommissions, computeRepRows } from '../src/lib/repCommissions.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const COMPANY_ID = Number(arg('company', 3))
const EMPLOYEE_ID = Number(arg('employee'))
const RATE = arg('rate') != null ? Number(arg('rate')) : null
const WRITE = process.argv.includes('--write')

if (!Number.isFinite(EMPLOYEE_ID)) {
  console.log('\n  --employee <id> is required.\n')
  process.exit(1)
}

// PostgREST caps a response at 1000 rows whatever .limit() says, and paging
// without .order() gives unstable pages. Both have bitten this codebase.
async function all(table, select, tweak = q => q) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tweak(
      sb.from(table).select(select).eq('company_id', COMPANY_ID).order('id', { ascending: true }),
    ).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`

const [employees, jobs, leads, invoices, payments, utilityInvoices] = await Promise.all([
  all('employees', '*'),
  all('jobs', 'id, salesperson_id, lead_id, job_total, status'),
  all('leads', 'id, salesperson_id, lead_owner_id'),
  all('invoices', 'id, job_id, amount, payment_status, created_at, updated_at'),
  all('payments', 'id, invoice_id, amount, date'),
  all('utility_invoices', 'id, job_id, amount, incentive_amount, payment_status, paid_at, processor_id'),
])
const { data: cfg } = await sb.from('settings').select('key, value').eq('company_id', COMPANY_ID).eq('key', 'payroll_config').maybeSingle()
let payrollConfig = {}
try { payrollConfig = cfg?.value ? (typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value) : {} } catch { payrollConfig = {} }

const emp = employees.find(e => e.id === EMPLOYEE_ID)
if (!emp) { console.log(`\n  No employee ${EMPLOYEE_ID} in company ${COMPANY_ID}.\n`); process.exit(1) }

console.log(`\n  ${emp.name}  (employee ${emp.id}, role ${emp.role})`)
console.log(`  is_commission=${emp.is_commission}  services=${emp.commission_services_rate}  goods=${emp.commission_goods_rate}  setter=${emp.commission_setter_rate}`)

// What the ledger holds right now.
const { data: before } = await sb.from('rep_commissions').select('id, amount, payment_status').eq('company_id', COMPANY_ID).eq('employee_id', EMPLOYEE_ID)
const sum = (rows) => (rows || []).reduce((t, r) => t + (Number(r.amount) || 0), 0)
console.log(`  existing rep_commissions rows: ${(before || []).length}  (${money(sum(before))})`)

// Apply the rate to an in-memory copy first so the projection is honest about
// what the change actually produces.
const projectedEmployees = employees.map(e =>
  e.id === EMPLOYEE_ID && RATE != null
    ? { ...e, commission_services_rate: RATE, commission_goods_rate: RATE }
    : e)
const data = { employees: projectedEmployees, jobs, leads, invoices, payments, utilityInvoices, payrollConfig }
const projected = computeRepRows(data, EMPLOYEE_ID)

console.log(`\n  With services/goods = ${RATE ?? emp.commission_services_rate}, computeRepRows yields ${projected.length} row(s):`)
for (const r of projected) {
  console.log(`    job ${String(r.job_id).padEnd(7)} inv ${String(r.invoice_id ?? '-').padEnd(7)} ${r.kind.padEnd(9)} basis ${money(r.basis_amount).padStart(11)} @ ${r.rate}% = ${money(r.amount).padStart(10)}  [${r.source}]`)
}
console.log(`    ${'—'.repeat(72)}`)
console.log(`    total ${money(projected.reduce((t, r) => t + r.amount, 0))}`)

if (!WRITE) {
  console.log(`\n  Report only. Re-run with --rate ${RATE ?? '<pct>'} --write to apply.\n`)
  process.exit(0)
}
if (RATE == null) { console.log('\n  --write needs --rate.\n'); process.exit(1) }

const { error: upErr } = await sb.from('employees')
  .update({ commission_services_rate: RATE, commission_goods_rate: RATE })
  .eq('id', EMPLOYEE_ID).eq('company_id', COMPANY_ID)
if (upErr) { console.log('  rate update FAILED:', upErr.message); process.exit(1) }
console.log(`\n  rate set to ${RATE}% services / ${RATE}% goods`)

// Re-read so the sync runs against committed state, then use the app's own
// reconciler scoped to this one employee — nobody else's pay is touched.
const { data: freshEmployees } = await sb.from('employees').select('*').eq('company_id', COMPANY_ID)
const res = await syncRepCommissions(sb, COMPANY_ID, { ...data, employees: freshEmployees }, EMPLOYEE_ID)
console.log(`  syncRepCommissions: inserted ${res.inserted}, deleted ${res.deleted}`)

const { data: after } = await sb.from('rep_commissions').select('id, job_id, invoice_id, amount, kind, payment_status, earned_at').eq('company_id', COMPANY_ID).eq('employee_id', EMPLOYEE_ID)
console.log(`\n  rep_commissions now: ${(after || []).length} row(s), ${money(sum(after))}`)
for (const r of after || []) {
  console.log(`    job ${String(r.job_id).padEnd(7)} ${r.kind.padEnd(9)} ${money(r.amount).padStart(10)}  ${r.payment_status}  earned ${String(r.earned_at || '').slice(0, 10)}`)
}
console.log('\n  Unpaid rows follow reality: as the remaining invoices are paid, the next Payroll load syncs the rest.\n')
