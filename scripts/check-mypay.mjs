// What My Pay will actually show a given employee, using the real engine.
// Read-only.
//
//   npx vite-node scripts/check-mypay.mjs "Damien"

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateInvoiceCommissions } from '../src/lib/bonusCalc.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const COMPANY_ID = 3
const who = process.argv[2] || 'Damien'

const page = async (table, select, apply = q => q) => {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(sb.from(table).select(select).eq('company_id', COMPANY_ID)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const { data: emps } = await sb.from('employees').select('*').eq('company_id', COMPANY_ID).ilike('name', `%${who}%`)
if (!emps?.length) { console.log(`no employee matching "${who}"`); process.exit(0) }
const emp = emps[0]
console.log(`\n${emp.name} (employee ${emp.id})`)
console.log(`  rates: goods ${emp.commission_goods_rate}%  services ${emp.commission_services_rate}%  setter ${emp.commission_setter_rate}%\n`)

const jobs = await page('jobs', 'id, job_id, salesperson_id, lead_id, status, customer_name, job_title, invoice_status')
const invoices = await page('invoices', 'id, invoice_id, job_id, amount, payment_status, invoice_type, created_at, invoice_date')
const leads = await page('leads', 'id, customer_name, salesperson_id, setter_id')
const { data: settings } = await sb.from('settings').select('key, value').eq('company_id', COMPANY_ID)
const cfg = Object.fromEntries((settings || []).map(s => [s.key, s.value]))

// Same inputs My Pay passes (MyPay.jsx:441) — without the payments and the
// period bounds this reproduces nothing faithfully.
const { data: pays } = await sb.from('payments').select('id, invoice_id, amount, payment_date').eq('company_id', COMPANY_ID)
const allPaymentsByInvoiceId = new Map()
for (const p of pays || []) allPaymentsByInvoiceId.set(p.invoice_id, (allPaymentsByInvoiceId.get(p.invoice_id) || 0) + (Number(p.amount) || 0))
const inPeriodPayments = (pays || []).map(p => ({ ...p, date: (p.payment_date || '').split('T')[0] }))
console.log(`  payments on file: ${(pays || []).length}`)

const result = calculateInvoiceCommissions({
  inPeriodPayments,
  allPaymentsByInvoiceId,
  periodStartStr: '2020-01-01',
  periodEndStr: '2030-12-31',
  employee: emp,
  jobs,
  invoices,
  leads,
  utilityInvoices: [],
  payrollConfig: cfg,
})

const details = result?.details || []
const earned = details.filter(d => d.status === 'available' || d.status === 'earned')
const pending = details.filter(d => d.status === 'pending')
const sum = (xs) => xs.reduce((s, d) => s + (Number(d.amount) || 0), 0)

console.log(`  commission rows: ${details.length}   available $${sum(earned).toFixed(2)}   pending $${sum(pending).toFixed(2)}\n`)
for (const d of details.slice(0, 12)) {
  console.log(`   ${String(d.status).padEnd(8)} $${String((Number(d.amount) || 0).toFixed(2)).padStart(9)}  ${String(d.type || '').padEnd(20)} ${String(d.invoiceId || d.jobTitle || '').slice(0, 34)}`)
}
if (!details.length) {
  console.log('   NOTHING — this is what the employee sees.')
  const mine = jobs.filter(j => j.salesperson_id === emp.id)
  console.log(`   jobs where they are salesperson: ${mine.length}`)
  const ids = new Set(mine.map(j => j.id))
  console.log(`   invoices on those jobs: ${invoices.filter(i => ids.has(i.job_id)).length}`)
}
console.log('')
