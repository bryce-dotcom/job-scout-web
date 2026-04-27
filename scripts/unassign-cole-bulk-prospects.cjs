// Unassign Cole from bulk-prospect leads.
//
// Criteria (all must match):
//   - salesperson_id = Cole (16)
//   - NO attached quotes
//   - NO attached jobs
//   - status NOT in terminal/active stages where unassigning would be wrong
//     (we still skip Invoiced / Job Complete / Job Scheduled — those are Cole's
//      actual closed work, even if quote/job linkage was lost)
//
// Captures both:
//   - HCP-imported ghost leads (lead_id starts with LEAD-HCP-) that were
//     auto-attributed to Cole during the migration but never had activity
//   - Internal bulk-import rows with lead_id NULL
//
// Dry-run by default. Pass --apply to actually write.

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const COMPANY_ID = 3
const COLE_ID = 16
// Stages we will NEVER touch — these represent real money / real work
const PROTECTED_STAGES = ['Invoiced', 'Job Complete', 'Job Scheduled', 'In Progress', 'Won']
const APPLY = process.argv.includes('--apply')

;(async () => {
  // Candidates: every lead Cole owns that's NOT in a protected stage
  const { data: candidates, error } = await s.from('leads')
    .select('id, lead_id, customer_name, business_name, status, created_at')
    .eq('company_id', COMPANY_ID)
    .eq('salesperson_id', COLE_ID)
    .not('status', 'in', `(${PROTECTED_STAGES.map(s => `"${s}"`).join(',')})`)
  if (error) { console.error(error); process.exit(1) }

  console.log(`Candidate leads (Cole, not in ${PROTECTED_STAGES.join('/')}): ${candidates.length}`)
  if (!candidates.length) return

  const ids = candidates.map(l => l.id)

  // Find which ones have quotes attached
  const quotesByLead = new Set()
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const { data } = await s.from('quotes').select('lead_id').in('lead_id', batch)
    ;(data || []).forEach(q => quotesByLead.add(q.lead_id))
  }

  // Find which ones have jobs attached
  const jobsByLead = new Set()
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const { data } = await s.from('jobs').select('lead_id').in('lead_id', batch)
    ;(data || []).forEach(j => jobsByLead.add(j.lead_id))
  }

  const safe = candidates.filter(l => !quotesByLead.has(l.id) && !jobsByLead.has(l.id))
  const skipped = candidates.filter(l => quotesByLead.has(l.id) || jobsByLead.has(l.id))

  console.log(`  -> ${safe.length} safe to unassign (no quote, no job)`)
  console.log(`  -> ${skipped.length} skipped (have quote or job - leaving alone)`)

  // Group safe by status for the summary
  const byStatus = {}
  safe.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1 })
  console.log('\nWill unassign by status:')
  console.table(byStatus)

  // Sample
  console.log('\nFirst 10 of skipped (kept because they have a quote or job):')
  console.table(skipped.slice(0, 10).map(l => ({
    id: l.id, customer: l.customer_name || l.business_name, status: l.status,
    has_quote: quotesByLead.has(l.id), has_job: jobsByLead.has(l.id),
  })))

  if (!APPLY) {
    console.log('\nDRY RUN. Pass --apply to actually update.')
    return
  }

  console.log('\nApplying...')
  const safeIds = safe.map(l => l.id)
  let updated = 0
  for (let i = 0; i < safeIds.length; i += 200) {
    const batch = safeIds.slice(i, i + 200)
    const { error: uErr, count } = await s.from('leads')
      .update({ salesperson_id: null }, { count: 'exact' })
      .in('id', batch)
    if (uErr) { console.error('Batch error:', uErr); continue }
    updated += count || batch.length
  }
  console.log(`Updated ${updated} leads. Cole's pipeline view should now drop those.`)
})()
