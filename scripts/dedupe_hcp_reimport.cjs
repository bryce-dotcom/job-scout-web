// Dedupe duplicate jobs/invoices created by the recent HCP re-import.
//
// Symptom: re-running hcp_import_one_customer against customers whose
// jobs/invoices weren't tagged source_id=hcp by the original migration
// caused fresh inserts (because the upsert key didn't match). Result:
// every legacy job/invoice now has a HCP-tagged twin.
//
// Strategy (per customer in scope):
//   JOBS: pair legacy.source_system=null with new.source_system='hcp'
//         by same customer + created_at (within 60s) + job_total (±$0.01).
//         When matched: move job_lines from new→legacy, copy source
//         identity (source_system, source_id) onto legacy, DELETE new.
//   INVOICES: same logic but matching on (customer + amount + job_id),
//         since invoice created_at didn't roundtrip cleanly.
//   PAYMENTS: re-parent any payments whose invoice_id pointed at a
//         deleted new invoice over to the legacy invoice id.
//
// Idempotent — safe to re-run. Pairs already merged won't re-match
// (legacy will have source_system='hcp').
//
// Usage: node scripts/dedupe_hcp_reimport.cjs [COMPANY_ID] [--dry]

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const CID = parseInt(process.argv[2] || '3', 10)
const DRY = process.argv.includes('--dry')

function withinSeconds(a, b, secs) {
  if (!a || !b) return false
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= secs * 1000
}
function moneyEq(a, b, eps = 0.01) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= eps
}

;(async () => {
  console.log(`Dedupe HCP re-import — company ${CID}${DRY ? ' (DRY)' : ''}`)

  // Customers in scope: those with at least one HCP-tagged job.
  // Paginate to escape the 1000-row default cap.
  const customerIds = (() => { const s = new Set(); return s })()
  let from = 0
  while (true) {
    const { data, error } = await sb.from('jobs')
      .select('customer_id')
      .eq('company_id', CID).eq('source_system', 'hcp')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    for (const r of data) if (r.customer_id) customerIds.add(r.customer_id)
    if (data.length < 1000) break
    from += 1000
  }
  const customerIdsArr = [...customerIds]
  console.log('Customers with HCP-tagged jobs:', customerIdsArr.length)

  const stats = {
    jobs_pairs_found: 0, jobs_merged: 0, jobs_lines_moved: 0,
    invoices_pairs_found: 0, invoices_merged: 0, payments_reparented: 0,
    errors: [],
  }

  for (const custId of customerIdsArr) {
    // ── JOBS ────────────────────────────────────────────────────
    const { data: legacy } = await sb.from('jobs')
      .select('id,job_id,job_total,created_at,source_system,source_id')
      .eq('company_id', CID).eq('customer_id', custId).is('source_system', null)
    const { data: hcpRows } = await sb.from('jobs')
      .select('id,job_id,job_total,created_at,source_id')
      .eq('company_id', CID).eq('customer_id', custId).eq('source_system', 'hcp')

    // Build all pairs first
    const usedLegacy = new Set()
    const pairs = [] // { l, n }
    const newToLegacyJob = new Map()
    for (const n of (hcpRows || [])) {
      const cands = (legacy || []).filter(l =>
        !usedLegacy.has(l.id) &&
        withinSeconds(l.created_at, n.created_at, 60) &&
        moneyEq(l.job_total, n.job_total))
      if (!cands.length) continue
      cands.sort((a, b) => Math.abs(new Date(a.created_at) - new Date(n.created_at)) - Math.abs(new Date(b.created_at) - new Date(n.created_at)))
      const l = cands[0]
      usedLegacy.add(l.id)
      pairs.push({ l, n })
      newToLegacyJob.set(n.id, l.id)
      stats.jobs_pairs_found++
    }

    if (DRY) continue

    // Pre-pass: re-parent invoices + payments + job_lines from new→legacy
    // BEFORE deleting any new jobs, otherwise FK invoices_job_id_fkey
    // blocks the delete.
    for (const { l, n } of pairs) {
      // job_lines
      const { data: lines } = await sb.from('job_lines').select('id').eq('job_id', n.id)
      if (lines?.length) {
        const { error } = await sb.from('job_lines').update({ job_id: l.id }).eq('job_id', n.id)
        if (error) { stats.errors.push(`move job_lines ${n.id}→${l.id}: ${error.message}`); continue }
        stats.jobs_lines_moved += lines.length
      }
      // invoices pointing at new job
      await sb.from('invoices').update({ job_id: l.id }).eq('company_id', CID).eq('job_id', n.id)
      // payments pointing at new job
      await sb.from('payments').update({ job_id: l.id }).eq('company_id', CID).eq('job_id', n.id)
    }

    // Now delete + tag
    for (const { l, n } of pairs) {
      const { error: delErr } = await sb.from('jobs').delete().eq('id', n.id)
      if (delErr) { stats.errors.push(`delete job ${n.id}: ${delErr.message}`); continue }
      const { error: tagErr } = await sb.from('jobs').update({ source_system: 'hcp', source_id: n.source_id }).eq('id', l.id)
      if (tagErr) { stats.errors.push(`tag legacy job ${l.id}: ${tagErr.message}`); continue }
      stats.jobs_merged++
    }

    // ── INVOICES ───────────────────────────────────────────────
    // Re-parent any HCP invoices that point at a now-deleted new job
    // over to the corresponding legacy job.
    if (!DRY && newToLegacyJob.size) {
      for (const [newJobId, legacyJobId] of newToLegacyJob) {
        await sb.from('invoices').update({ job_id: legacyJobId })
          .eq('company_id', CID).eq('job_id', newJobId)
        await sb.from('payments').update({ job_id: legacyJobId })
          .eq('company_id', CID).eq('job_id', newJobId)
      }
    }

    const { data: legInv } = await sb.from('invoices')
      .select('id,invoice_id,amount,job_id,source_system,source_id')
      .eq('company_id', CID).eq('customer_id', custId).is('source_system', null)
    const { data: hcpInv } = await sb.from('invoices')
      .select('id,invoice_id,amount,job_id,source_id')
      .eq('company_id', CID).eq('customer_id', custId).eq('source_system', 'hcp')

    const usedLegInv = new Set()
    const newToLegacyInv = new Map()
    for (const n of (hcpInv || [])) {
      // Match heuristic: same amount. Prefer legacy invoices whose
      // invoice_id (legacy text id like "3630") matches the legacy job's
      // job_id when the new invoice has a job_id (i.e. matches the
      // legacy job we just re-parented to). Falls back to first
      // amount-match when invoice_ids don't help.
      let cands = (legInv || []).filter(l =>
        !usedLegInv.has(l.id) && moneyEq(l.amount, n.amount))
      if (!cands.length) continue
      if (n.job_id && cands.length > 1) {
        // Look up the legacy job's job_id for tighter matching
        const { data: jrow } = await sb.from('jobs').select('job_id').eq('id', n.job_id).maybeSingle()
        if (jrow?.job_id) {
          const tight = cands.filter(c => c.invoice_id && jrow.job_id && c.invoice_id.toString().includes(jrow.job_id.toString()))
          if (tight.length === 1) cands = tight
        }
      }
      const l = cands[0]
      usedLegInv.add(l.id)
      newToLegacyInv.set(n.id, l.id)
      stats.invoices_pairs_found++
      if (DRY) continue

      // Re-parent payments
      const { data: pays } = await sb.from('payments').select('id').eq('invoice_id', n.id)
      if (pays?.length) {
        await sb.from('payments').update({ invoice_id: l.id }).eq('invoice_id', n.id)
        stats.payments_reparented += pays.length
      }
      // Delete new invoice
      const { error: delErr } = await sb.from('invoices').delete().eq('id', n.id)
      if (delErr) { stats.errors.push(`delete invoice ${n.id}: ${delErr.message}`); continue }
      // Tag legacy with source identity
      const { error: tagErr } = await sb.from('invoices').update({ source_system: 'hcp', source_id: n.source_id }).eq('id', l.id)
      if (tagErr) { stats.errors.push(`tag legacy invoice ${l.id}: ${tagErr.message}`); continue }
      stats.invoices_merged++
    }
  }

  console.log('\n=== Stats ===')
  console.log(JSON.stringify(stats, null, 2))

  if (!DRY) {
    await sb.from('migration_jobs').insert({
      company_id: CID, source: 'hcp-dedupe',
      status: 'finished', finished_at: new Date().toISOString(),
      counts: stats, report: { errors: stats.errors.slice(0, 50) },
    })
  }
})()
