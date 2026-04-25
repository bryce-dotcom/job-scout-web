// Re-run hcpImporter against every customer flagged by the most recent
// reconciliation report for the given company. Idempotent — uses
// source_id upserts so it lifts under-imported jobs/invoices/lines
// without duplicating already-imported quotes.
//
// Usage: node scripts/reimport_flagged.cjs [COMPANY_ID]

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const { importOneCustomer } = require('./lib/hcpImporter.cjs')

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HCP_KEY = process.env.HCP_API_KEY || '44aecf944c03403fb58ee457ec657d0c'
const CID = parseInt(process.argv[2] || '3', 10)

;(async () => {
  const { data: latest } = await sb.from('migration_jobs')
    .select('id,report,counts,finished_at')
    .eq('company_id', CID).eq('source', 'hcp-reconciliation')
    .order('id', { ascending: false }).limit(1).maybeSingle()
  if (!latest?.report?.flagged?.length) {
    console.log('No flagged customers in latest recon report.'); return
  }
  const flagged = latest.report.flagged
  console.log(`Re-importing ${flagged.length} flagged customers from recon job #${latest.id} (${latest.finished_at})`)

  const jobRow = await sb.from('migration_jobs').insert({
    company_id: CID, source: 'hcp-reimport-flagged',
    status: 'running', started_at: new Date().toISOString(),
    report: { recon_job_id: latest.id, total: flagged.length },
  }).select().single()

  const totals = { customers: 0, lines_added: 0, jobs_added: 0, invoices_added: 0, payments_added: 0, errors: 0 }
  const errors = []
  let i = 0
  for (const f of flagged) {
    i++
    if (!f.hcp) { totals.errors++; continue }
    try {
      const r = await importOneCustomer({
        companyId: CID, hcpCustomerId: f.hcp, hcpKey: HCP_KEY, sb,
      })
      totals.customers++
      totals.lines_added += r.counts.quote_lines + r.counts.job_lines
      totals.jobs_added += r.counts.jobs
      totals.invoices_added += r.counts.invoices
      totals.payments_added += r.counts.payments
      if (r.error) { totals.errors++; errors.push({ js_id: f.js_id, hcp: f.hcp, err: r.error }) }
      if (i % 10 === 0) {
        console.log(`  [${i}/${flagged.length}] +${r.counts.jobs}j +${r.counts.invoices}i +${r.counts.quote_lines + r.counts.job_lines}lines  ${f.name}`)
        await sb.from('migration_jobs').update({ counts: totals, report: { ...jobRow.data.report, progress: i, total: flagged.length } }).eq('id', jobRow.data.id)
      }
    } catch (e) {
      totals.errors++
      errors.push({ js_id: f.js_id, hcp: f.hcp, err: e.message })
      console.log(`  [${i}/${flagged.length}] ERROR ${f.name}: ${e.message}`)
    }
  }

  await sb.from('migration_jobs').update({
    status: 'finished', finished_at: new Date().toISOString(),
    counts: totals, report: { recon_job_id: latest.id, progress: i, total: flagged.length, errors: errors.slice(0, 50) },
  }).eq('id', jobRow.data.id)

  console.log('\n=== DONE ===')
  console.log(JSON.stringify(totals, null, 2))
  if (errors.length) console.log(`First ${Math.min(10, errors.length)} errors:`, errors.slice(0, 10))
})()
