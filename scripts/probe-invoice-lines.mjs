// Read-only probe: why does the two-section (in-scope / out-of-scope) invoice
// view not render for most invoices? Prints facts, changes nothing.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3

const { data: invoices, error: ie } = await sb
  .from('invoices')
  .select('id, invoice_id, job_id, amount, discount_applied, payment_status, invoice_type, created_at')
  .eq('company_id', CO).order('created_at', { ascending: false })
if (ie) { console.error('invoices:', ie.message); process.exit(1) }

const { data: lines, error: le } = await sb
  .from('invoice_lines').select('id, invoice_id').eq('company_id', CO)
if (le) { console.error('invoice_lines:', le.message); process.exit(1) }

const byInv = new Map()
for (const l of lines) byInv.set(l.invoice_id, (byInv.get(l.invoice_id) || 0) + 1)

const withLines = invoices.filter(i => byInv.get(i.id))
const without = invoices.filter(i => !byInv.get(i.id))

console.log(`invoices: ${invoices.length}   with lines: ${withLines.length}   WITHOUT: ${without.length}`)
console.log(`invoice_lines rows total: ${lines.length}`)

// Do the line-less invoices have a job with job_lines we could have used?
const jobIds = [...new Set(without.map(i => i.job_id).filter(Boolean))]
const { data: jobLines } = await sb
  .from('job_lines').select('id, job_id').eq('company_id', CO).in('job_id', jobIds.slice(0, 300))
const jlByJob = new Map()
for (const jl of jobLines || []) jlByJob.set(jl.job_id, (jlByJob.get(jl.job_id) || 0) + 1)

const recoverable = without.filter(i => i.job_id && jlByJob.get(i.job_id))
console.log(`\nline-less invoices whose JOB has job_lines (recoverable): ${recoverable.length}`)
console.log(`line-less invoices with no job at all:                    ${without.filter(i => !i.job_id).length}`)
console.log(`line-less invoices whose job has no lines either:         ${without.filter(i => i.job_id && !jlByJob.get(i.job_id)).length}`)

console.log('\n--- newest 12 line-less invoices ---')
for (const i of without.slice(0, 12)) {
  console.log(
    `${String(i.invoice_id || i.id).padEnd(12)} job=${String(i.job_id || '-').padEnd(7)}` +
    ` amt=${String(i.amount).padEnd(10)} disc=${String(i.discount_applied ?? 0).padEnd(9)}` +
    ` ${String(i.payment_status || '').padEnd(16)} jobLines=${jlByJob.get(i.job_id) || 0}  ${(i.created_at || '').slice(0, 10)}`
  )
}

console.log('\n--- newest 5 invoices WITH lines (what good looks like) ---')
for (const i of withLines.slice(0, 5)) {
  console.log(`${String(i.invoice_id || i.id).padEnd(12)} job=${String(i.job_id || '-').padEnd(7)} lines=${byInv.get(i.id)}  ${(i.created_at || '').slice(0, 10)}`)
}

// When were lines last created? Tells us if line-writing is live or dead.
const { data: recent } = await sb
  .from('invoice_lines').select('id, invoice_id, created_at').eq('company_id', CO)
  .order('created_at', { ascending: false }).limit(5)
console.log('\n--- most recent invoice_lines rows ---')
for (const r of recent || []) console.log(`  line ${r.id} -> invoice ${r.invoice_id}  ${(r.created_at || '').slice(0, 19)}`)
