// Backfill invoice_lines for invoices that have none but whose job still
// has job_lines. DRY RUN by default; pass --write to actually insert.
//
// Safety: only touches invoices with ZERO existing lines, never deposit
// invoices (a deposit is a % of contract, not itemised work), and reports
// how the summed lines compare to the invoice's billed `amount` so a
// mismatch is visible BEFORE anything is written. Adding lines never
// changes what is billed - `amount` is untouched - but it does change what
// renders on the invoice, the PDF and the customer portal.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const WRITE = process.argv.includes('--write')
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3

// Same rule as src/lib/invoiceLines.js. Kept in step deliberately: this is
// a one-off script, not a second live implementation.
function buildRows(lines, { companyId, invoiceId }) {
  if (!Array.isArray(lines) || !invoiceId) return []
  return lines.map((l, idx) => {
    const rawQty = Number(l.quantity)
    const quantity = Number.isFinite(rawQty) ? rawQty : 1
    const unitPrice = parseFloat(l.price) || 0
    const stored = parseFloat(l.total ?? l.line_total)
    return {
      company_id: companyId, invoice_id: invoiceId,
      item_id: l.item_id || null, line_number: idx + 1,
      description: l.description || l.item?.name || l.item_name || 'Item',
      quantity, unit_price: unitPrice,
      discount: parseFloat(l.discount) || 0,
      line_total: Number.isFinite(stored) ? stored : quantity * unitPrice,
      sort_order: idx,
      in_utility_scope: l.in_utility_scope !== false,
      labor_cost: parseFloat(l.labor_cost) || 0,
    }
  })
}

const { data: invoices } = await sb.from('invoices')
  .select('id, invoice_id, job_id, amount, discount_applied, invoice_type, payment_status, created_at')
  .eq('company_id', CO)
const { data: existing } = await sb.from('invoice_lines').select('invoice_id').eq('company_id', CO)
const hasLines = new Set((existing || []).map(l => l.invoice_id))

const candidates = (invoices || []).filter(i =>
  i.job_id && !hasLines.has(i.id) && i.invoice_type !== 'deposit'
)
const jobIds = [...new Set(candidates.map(i => i.job_id))]

const jobLines = []
for (let i = 0; i < jobIds.length; i += 100) {
  const { data } = await sb.from('job_lines')
    .select('id, job_id, item_id, description, item_name, quantity, price, discount, total, labor_cost, in_utility_scope')
    .eq('company_id', CO).in('job_id', jobIds.slice(i, i + 100)).order('id')
  jobLines.push(...(data || []))
}
const byJob = new Map()
for (const l of jobLines) { if (!byJob.has(l.job_id)) byJob.set(l.job_id, []); byJob.get(l.job_id).push(l) }

const work = candidates.filter(i => (byJob.get(i.job_id) || []).length > 0)
console.log(`${WRITE ? 'WRITE' : 'DRY RUN'} — non-deposit invoices with no lines whose job has lines: ${work.length}\n`)

let matched = 0, mismatched = 0, inserted = 0
const touched = []
const problems = []
for (const inv of work) {
  const rows = buildRows(byJob.get(inv.job_id), { companyId: CO, invoiceId: inv.id })
  const lineSum = rows.reduce((s, r) => s + r.line_total, 0)
  const billed = parseFloat(inv.amount) || 0
  const delta = Math.round((lineSum - billed) * 100) / 100
  const ok = Math.abs(delta) < 0.02
  ok ? matched++ : mismatched++
  const tag = ok ? 'ok      ' : 'MISMATCH'
  const line = `${tag} ${String(inv.invoice_id).padEnd(17)} job=${String(inv.job_id).padEnd(6)} lines=${String(rows.length).padEnd(3)} billed=${billed.toFixed(2).padStart(11)} lineSum=${lineSum.toFixed(2).padStart(11)} delta=${delta.toFixed(2).padStart(10)}`
  if (!ok) problems.push(line)
  if (rows.length && (ok || process.argv.includes('--include-mismatched'))) {
    if (WRITE) {
      const { error } = await sb.from('invoice_lines').insert(rows)
      if (error) console.log(`  FAILED ${inv.invoice_id}: ${error.message}`)
      else { inserted += rows.length; touched.push({ id: inv.id, invoice_id: inv.invoice_id, rows: rows.length }) }
    }
  }
}

console.log(`reconciles with billed amount: ${matched}`)
console.log(`does NOT reconcile:            ${mismatched}`)
if (problems.length) {
  console.log('\n--- invoices whose job lines do NOT sum to the billed amount ---')
  console.log('(skipped by default: adding lines that contradict the total would')
  console.log(' make the invoice look wrong to the customer)')
  for (const p of problems.slice(0, 25)) console.log(p)
  if (problems.length > 25) console.log(`  ... and ${problems.length - 25} more`)
}
if (WRITE) {
  console.log(`\ninvoice_lines rows inserted: ${inserted}`)
  // Exact reversal record: every invoice below had ZERO lines before this
  // run, so deleting all invoice_lines for these invoice ids undoes it
  // completely, with no risk of removing a line somebody added by hand.
  const { writeFileSync } = await import('node:fs')
  writeFileSync(new URL('./backfill-invoice-lines-undo.json', import.meta.url),
    JSON.stringify({ company: CO, ranAt: new Date().toISOString(), touched }, null, 2))
  console.log(`reversal record: scripts/backfill-invoice-lines-undo.json (${touched.length} invoices)`)
} else {
  console.log(`\nDry run — nothing written. Re-run with --write to apply the ${matched} reconciling invoices.`)
}
