// Backfill: where recurring siblings (same customer + same job_title) exist
// and at least one has job_lines, copy them onto the empty siblings.
// Heuristic but matches Doug's "recurring jobs lost their line items" report.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HHH = 3
const APPLY = process.argv.includes('--apply')

console.log(APPLY ? 'APPLY MODE' : 'DRY RUN — pass --apply to write')

// Pull HHH jobs that look recurring or have a $ total but no quote_id
// (the typical "scheduled clone with no source quote" case).
const { data: jobs } = await supabase
  .from('jobs')
  .select('id, job_id, job_title, customer_id, recurrence, job_total, start_date')
  .eq('company_id', HHH)
  .or('recurrence.neq.None,recurrence.is.null')
  .not('customer_id', 'is', null)
  .gt('job_total', 0)
  .limit(3000)

console.log(`Candidate jobs: ${jobs?.length || 0}`)

// Group by (customer_id, normalized title)
const groups = new Map()
for (const j of jobs || []) {
  const title = (j.job_title || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!title) continue
  const key = `${j.customer_id}::${title}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(j)
}

let recoveredJobs = 0, recoveredLines = 0
for (const [key, set] of groups) {
  if (set.length < 2) continue
  const ids = set.map(s => s.id)
  const { data: linesAll } = await supabase
    .from('job_lines')
    .select('id, job_id, item_id, quantity, price, total, description, notes, photos')
    .in('job_id', ids)
  const byJob = new Map()
  for (const l of linesAll || []) {
    if (!byJob.has(l.job_id)) byJob.set(l.job_id, [])
    byJob.get(l.job_id).push(l)
  }
  const withLines = set.filter(s => byJob.has(s.id))
  const without = set.filter(s => !byJob.has(s.id))
  if (withLines.length === 0 || without.length === 0) continue

  // Pick the donor: the sibling with the MOST line items (most "complete")
  const donor = withLines.sort((a, b) => (byJob.get(b.id).length) - (byJob.get(a.id).length))[0]
  const donorLines = byJob.get(donor.id)

  // Conservative: only recover empty siblings whose job_total matches
  // the donor within $1. If totals differ the scope is different and
  // a blind line-item copy would mis-state the work.
  const donorTotal = parseFloat(donor.job_total) || 0
  const safeRecipients = without.filter(s => {
    const t = parseFloat(s.job_total) || 0
    return Math.abs(t - donorTotal) < 1
  })
  const skipped = without.length - safeRecipients.length

  console.log(`\n  set "${donor.job_title?.slice(0,50)}" cust=${donor.customer_id}`)
  console.log(`    donor: job ${donor.id} ($${donorTotal}, ${donorLines.length} lines)`)
  console.log(`    recipients: ${safeRecipients.length} (skipped ${skipped} with mismatched total)`)
  if (safeRecipients.length === 0) continue

  if (APPLY) {
    for (const empty of safeRecipients) {
      const rows = donorLines.map(l => ({
        company_id: HHH,
        job_id: empty.id,
        item_id: l.item_id,
        quantity: l.quantity,
        price: l.price,
        total: l.total,
        description: l.description,
        notes: l.notes,
        photos: l.photos || [],
      }))
      const { data, error } = await supabase.from('job_lines').insert(rows).select('id')
      if (error) {
        console.error(`      job ${empty.id} INSERT FAILED:`, error.message)
      } else {
        recoveredJobs++
        recoveredLines += data.length
        console.log(`      job ${empty.id} ← ${data.length} lines`)
      }
    }
  } else {
    recoveredJobs += safeRecipients.length
    recoveredLines += donorLines.length * safeRecipients.length
  }
}

console.log(`\n${APPLY ? 'Recovered' : 'Would recover'}: ${recoveredJobs} jobs / ${recoveredLines} lines`)
