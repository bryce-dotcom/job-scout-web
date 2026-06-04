// Task A: Scan for orphan financial records linked to Doug's 99 deleted jobs
// Pulls the deleted job UUIDs from audit_log, then checks invoices, payments,
// utility_invoices, expenses, purchase_orders, and job_lines for dangling refs.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Step 1: Pull all deleted job records from audit_log (last 90 days to be safe)
  const { data: deletedRows, error: auditErr } = await s
    .from('audit_log')
    .select('record_id, old_values, old_data, created_at, user_email')
    .eq('table_name', 'jobs')
    .eq('action', 'DELETE')
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  if (auditErr) { console.error('audit_log fetch failed:', auditErr.message); process.exit(1) }
  console.log(`\nFound ${deletedRows.length} deleted job records in audit_log (last 90 days)\n`)

  // Extract job UUIDs and human-readable IDs for reporting
  const deletedJobs = deletedRows.map(r => {
    const vals = r.old_values || r.old_data || {}
    return {
      uuid: r.record_id,
      job_id: vals.job_id || '?',
      job_title: vals.job_title || '?',
      status: vals.status || '?',
      deleted_at: r.created_at,
      deleted_by: r.user_email || 'system'
    }
  })
  const deletedUUIDs = deletedJobs.map(j => j.uuid).filter(Boolean)
  const deletedJobNums = deletedJobs.map(j => j.job_id).filter(s => s !== '?')

  console.log('Deleted jobs sample (first 10):')
  deletedJobs.slice(0, 10).forEach(j =>
    console.log(`  ${j.job_id} "${j.job_title}" [${j.status}] deleted ${j.deleted_at.slice(0,10)} by ${j.deleted_by}`)
  )
  console.log('  ...')

  // Step 2: Scan tables for orphan job_id references
  // invoices.job_id (UUID FK)
  const { data: invoices } = await s
    .from('invoices')
    .select('id, invoice_number, total, job_id, status, created_at')
    .in('job_id', deletedUUIDs)

  // payments.job_id (if exists)
  const { data: payments } = await s
    .from('payments')
    .select('id, amount, payment_date, job_id, invoice_id')
    .in('job_id', deletedUUIDs)
    .then(r => r)
    .catch(() => ({ data: [] }))

  // utility_invoices.job_id
  const { data: utilityInvoices } = await s
    .from('utility_invoices')
    .select('id, invoice_number, total_bill, job_id')
    .in('job_id', deletedUUIDs)
    .then(r => r)
    .catch(() => ({ data: [] }))

  // expenses.job_id
  const { data: expenses } = await s
    .from('expenses')
    .select('id, amount, description, job_id, created_at')
    .in('job_id', deletedUUIDs)
    .then(r => r)
    .catch(() => ({ data: [] }))

  // purchase_orders.job_id (if column exists)
  const { data: pos } = await s
    .from('purchase_orders')
    .select('id, po_number, total, job_id')
    .in('job_id', deletedUUIDs)
    .then(r => r)
    .catch(() => ({ data: [] }))

  // job_lines with job_id in deleted set
  const { data: jobLines } = await s
    .from('job_lines')
    .select('id, job_id, description, line_total')
    .in('job_id', deletedUUIDs)
    .then(r => r)
    .catch(() => ({ data: [] }))

  // Now check for NULL job_id records that were recently orphaned
  // (ON DELETE SET NULL means job_id becomes NULL when job is deleted)
  const { data: nullJobInvoices } = await s
    .from('invoices')
    .select('id, invoice_number, total, status, created_at, customer_id')
    .is('job_id', null)
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  console.log('\n══════════════════════════════════════════════════════')
  console.log('ORPHAN SCAN RESULTS')
  console.log('══════════════════════════════════════════════════════\n')

  const inv = invoices || []
  const pay = payments || []
  const util = utilityInvoices || []
  const exp = expenses || []
  const po = pos || []
  const jl = jobLines || []
  const nullInv = nullJobInvoices || []

  console.log(`Invoices still pointing to deleted jobs:     ${inv.length}`)
  if (inv.length > 0) {
    inv.forEach(i => console.log(`  Invoice #${i.invoice_number} $${i.total} status=${i.status} job_uuid=${i.job_id}`))
  }

  console.log(`\nPayments still pointing to deleted jobs:     ${pay.length}`)
  if (pay.length > 0) {
    pay.forEach(p => console.log(`  Payment $${p.amount} date=${p.payment_date} job_uuid=${p.job_id}`))
  }

  console.log(`\nUtility invoices pointing to deleted jobs:   ${util.length}`)
  if (util.length > 0) {
    util.forEach(u => console.log(`  UtilInv #${u.invoice_number} $${u.total_bill} job_uuid=${u.job_id}`))
  }

  console.log(`\nExpenses pointing to deleted jobs:           ${exp.length}`)
  if (exp.length > 0) {
    exp.forEach(e => console.log(`  Expense $${e.amount} "${e.description}" job_uuid=${e.job_id}`))
  }

  console.log(`\nPurchase Orders pointing to deleted jobs:    ${po.length}`)
  if (po.length > 0) {
    po.forEach(p => console.log(`  PO #${p.po_number} $${p.total} job_uuid=${p.job_id}`))
  }

  console.log(`\nJob lines orphaned (job_id in deleted set):  ${jl.length}`)
  if (jl.length > 0) {
    jl.slice(0, 10).forEach(l => console.log(`  Line "${l.description}" $${l.line_total} job_uuid=${l.job_id}`))
  }

  console.log(`\nInvoices with NULL job_id (last 90d, may be newly orphaned): ${nullInv.length}`)
  if (nullInv.length > 0) {
    nullInv.forEach(i => console.log(`  Invoice #${i.invoice_number} $${i.total} status=${i.status} created=${i.created_at?.slice(0,10)}`))
  }

  // Summary
  const totalOrphans = inv.length + pay.length + util.length + exp.length + po.length
  const totalFinancial = [...inv, ...pay, ...util].reduce((sum, r) => sum + parseFloat(r.total || r.amount || r.total_bill || 0), 0)
  console.log('\n══════════════════════════════════════════════════════')
  console.log(`SUMMARY: ${totalOrphans} orphaned financial records`)
  console.log(`Total $ value at risk: $${totalFinancial.toFixed(2)}`)
  console.log('══════════════════════════════════════════════════════\n')

  // Step 3: Check the -N suffix pattern
  console.log('\nDELETED JOBS WITH -N SUFFIX PATTERN:')
  const nSuffix = deletedJobs.filter(j => /-\d+$/.test(j.job_id))
  console.log(`Found ${nSuffix.length} jobs with numeric suffix:`)
  nSuffix.forEach(j => console.log(`  ${j.job_id} "${j.job_title}" deleted by ${j.deleted_by}`))

  // What are the base job IDs for the -N suffix ones?
  if (nSuffix.length > 0) {
    console.log('\nChecking if base jobs still exist in audit_log...')
    const baseIds = [...new Set(nSuffix.map(j => j.job_id.replace(/-\d+$/, '')))]
    console.log('Base IDs to investigate:', baseIds.slice(0, 20))

    // Check audit_log for inserts of these jobs
    const { data: insertLogs } = await s
      .from('audit_log')
      .select('record_id, new_values, new_data, created_at, user_email, action')
      .eq('table_name', 'jobs')
      .eq('action', 'INSERT')
      .gte('created_at', '2025-01-01')
      .order('created_at', { ascending: false })
      .limit(500)

    const insertedJobIds = (insertLogs || []).map(r => {
      const v = r.new_values || r.new_data || {}
      return { job_id: v.job_id, created_at: r.created_at, uuid: r.record_id }
    })

    // Look for any that match the numeric suffix pattern
    const suffixInserted = insertedJobIds.filter(j => j.job_id && /-\d+$/.test(j.job_id))
    console.log(`\nInserted jobs with -N suffix (ever): ${suffixInserted.length}`)
    suffixInserted.slice(0, 20).forEach(j => console.log(`  ${j.job_id} inserted ${j.created_at?.slice(0,10)}`))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
