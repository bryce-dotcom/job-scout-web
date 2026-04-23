// Backfill job_lines from the linked quote when a job has 0 lines but
// is linked to a quote that does. Many legacy imports brought jobs
// across without their line items even when the originating quote had
// them. Once quote_lines have been backfilled (see
// backfill_all_legacy_quote_lines.cjs), copy the lines across so the
// JobDetail page renders complete materials/labor info.
//
// Match strategy:
//   1. jobs.original_estimate_id → quotes.source_id (when source_system='hcp')
//   2. jobs.quote_id (job table column) → quotes.id direct
//   3. Same customer + matching grand total within 1% tolerance
//      (single best match only; otherwise skipped + logged).
//
// Usage:
//   node scripts/backfill_orphan_job_lines.cjs [COMPANY_ID] [--dry]

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const CID = parseInt(process.argv[2] || '3', 10)
const DRY = process.argv.includes('--dry')

const rand = (n=6) => Math.random().toString(36).slice(2, 2+n).toUpperCase()

async function jobLineCount(jobId) {
  const { count } = await sb.from('job_lines').select('id', { count: 'exact', head: true }).eq('job_id', jobId)
  return count || 0
}

async function quoteLines(quoteId) {
  const { data } = await sb.from('quote_lines').select('*').eq('quote_id', quoteId).order('sort_order', { ascending: true })
  return data || []
}

function jobLineRowFromQuoteLine(ql, jobId) {
  // job_lines does NOT have sort_order — drop it.
  return {
    company_id: CID,
    source_system: 'hcp-quote-mirror', source_id: 'qline:' + ql.id,
    job_id: jobId,
    job_line_id: 'JL-MIR-' + rand(6),
    item_name: ql.item_name,
    description: ql.description,
    quantity: ql.quantity,
    price: ql.price,
    total: ql.total ?? ql.line_total,
    labor_cost: ql.labor_cost,
    kind: ql.kind || null,
    taxable: ql.taxable === true,
    unit_of_measure: ql.unit_of_measure || null,
  }
}

;(async () => {
  console.log(`Orphan-job line backfill — company ${CID}${DRY ? ' (DRY)' : ''}`)

  // Pull all jobs in this company. JobScout's jobs table doesn't have
  // a typed estimate FK — quote_id is a TEXT field that holds either
  // the JS quote_id string ("ST-216") or the integer quote PK as text,
  // depending on which importer ran. We try both.
  const { data: jobs } = await sb.from('jobs')
    .select('id,job_id,quote_id,customer_id,job_total,source_system,source_id')
    .eq('company_id', CID)
    .limit(5000)
  console.log('Total jobs:', jobs?.length)

  // Filter to those with zero lines.
  const empty = []
  for (const j of jobs || []) {
    const c = await jobLineCount(j.id)
    if (c === 0) empty.push(j)
  }
  console.log('Jobs with 0 lines:', empty.length)
  if (!empty.length) return

  // Build a map of quote source_id → quote.id for HCP-tagged quotes.
  const { data: srcQuotes } = await sb.from('quotes')
    .select('id,source_id,customer_id,quote_amount')
    .eq('company_id', CID)
    .eq('source_system', 'hcp')
    .not('source_id', 'is', null)
  const bySrc = new Map()
  for (const q of srcQuotes || []) bySrc.set(q.source_id, q)

  let linked = 0
  let inserted = 0
  let skipped = 0
  const report = { byPath: { source_id: 0, quote_id: 0, amount_match: 0, none: 0 } }

  for (const j of empty) {
    let q = null
    let path = null

    // Path 1: jobs.source_id (HCP estimate id) → quotes.source_id
    if (j.source_system === 'hcp' && j.source_id && bySrc.has(j.source_id)) {
      q = bySrc.get(j.source_id)
      path = 'source_id'
    }
    // Path 2: jobs.quote_id text — try as quote_id string then as int PK
    if (!q && j.quote_id) {
      const { data: byStr } = await sb.from('quotes').select('id,customer_id,quote_amount').eq('company_id', CID).eq('quote_id', j.quote_id).maybeSingle()
      if (byStr) { q = byStr; path = 'quote_id' }
      else if (/^\d+$/.test(j.quote_id)) {
        const { data: byInt } = await sb.from('quotes').select('id,customer_id,quote_amount').eq('id', parseInt(j.quote_id, 10)).maybeSingle()
        if (byInt) { q = byInt; path = 'quote_id' }
      }
    }
    // Path 3: same customer, amount within 1%
    if (!q && j.customer_id && j.job_total) {
      const target = Number(j.job_total)
      const { data: candidates } = await sb.from('quotes')
        .select('id,quote_amount')
        .eq('company_id', CID)
        .eq('customer_id', j.customer_id)
      const close = (candidates || []).filter(c => {
        const a = Number(c.quote_amount || 0)
        return target > 0 && Math.abs(a - target) / target <= 0.01
      })
      // Only take it if there's exactly one close match AND it has lines
      if (close.length === 1) {
        const lines = await quoteLines(close[0].id)
        if (lines.length) { q = close[0]; path = 'amount_match' }
      }
    }

    if (!q) { skipped++; report.byPath.none++; continue }

    const lines = await quoteLines(q.id)
    if (!lines.length) { skipped++; report.byPath.none++; continue }

    let added = 0
    for (const ql of lines) {
      const row = jobLineRowFromQuoteLine(ql, j.id)
      if (DRY) { added++; continue }
      const { error } = await sb.from('job_lines').insert(row)
      if (error) { console.log('    insert err job', j.id, error.message); continue }
      added++
    }
    if (added > 0) {
      linked++
      inserted += added
      report.byPath[path]++
      console.log(`  job ${j.id} (${j.job_id||'-'}) ← quote ${q.id} via ${path}: +${added} lines`)
    } else {
      skipped++
    }
  }

  console.log('\n========================================')
  console.log('Jobs linked:', linked)
  console.log('Jobs skipped:', skipped)
  console.log('Lines inserted:', inserted)
  console.log('Match paths:', report.byPath)

  if (!DRY) {
    await sb.from('migration_jobs').insert({
      company_id: CID,
      source: 'hcp-backfill-orphan-job-lines',
      status: 'finished',
      finished_at: new Date().toISOString(),
      counts: { jobs_linked: linked, jobs_skipped: skipped, lines_inserted: inserted },
      report,
    })
  }
})()
