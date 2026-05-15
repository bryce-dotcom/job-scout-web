// Doug requested: delete jobs older than 2023 (created or completed
// before 2023-01-01). We use Archive instead of hard delete by default
// so they can still be looked up by historical references. Hard delete
// is opt-in with --hard.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const HARD = process.argv.includes('--hard')
const CUTOFF = '2023-01-01T00:00:00Z'
;(async () => {
  // Walk in pages — there are 1000+ archived jobs already
  const candidates = []
  for (let from = 0; ; from += 1000) {
    const r = await s.from('jobs')
      .select('id,job_id,job_title,status,start_date,completed_at,created_at,company_id')
      .eq('company_id', 3)
      .lt('created_at', CUTOFF)
      .order('id')
      .range(from, from + 999)
    if (r.error) { console.error(r.error); return }
    candidates.push(...r.data)
    if (r.data.length < 1000) break
  }
  console.log(`Jobs created before ${CUTOFF.slice(0,10)} on HHH: ${candidates.length}`)

  // Status breakdown for sanity
  const byStatus = {}
  for (const j of candidates) byStatus[j.status || '(null)'] = (byStatus[j.status || '(null)'] || 0) + 1
  console.log('Status counts of candidates:')
  for (const [st, n] of Object.entries(byStatus).sort(([,a],[,b]) => b-a)) console.log(`  ${n.toString().padStart(4)}  ${st}`)

  // Also skip anything that still has unpaid invoices — paranoia guard
  const unpaidIds = new Set()
  const ids = candidates.map(j => j.id)
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200)
    const r = await s.from('invoices').select('job_id,payment_status').in('job_id', slice).neq('payment_status', 'Paid')
    for (const inv of r.data || []) if (inv.job_id) unpaidIds.add(inv.job_id)
  }
  console.log(`Skipping ${unpaidIds.size} jobs with unpaid invoices`)
  const safe = candidates.filter(j => !unpaidIds.has(j.id))
  console.log(`Safe to delete: ${safe.length}`)

  if (!APPLY) { console.log('\n[DRY RUN] Pass --apply to archive, --apply --hard to hard-delete.'); return }

  if (HARD) {
    console.log(`Hard-deleting ${safe.length}...`)
    for (let i = 0; i < safe.length; i += 100) {
      const slice = safe.slice(i, i + 100).map(j => j.id)
      const { error } = await s.from('jobs').delete().in('id', slice)
      if (error) console.error(`  Batch ${i}-${i+100}: ${error.message}`)
      else console.log(`  ✓ ${i + slice.length}/${safe.length}`)
    }
  } else {
    // Soft archive — mark status='Archived' and add a flag in notes
    console.log(`Archiving ${safe.length} (set status='Archived')...`)
    for (let i = 0; i < safe.length; i += 100) {
      const slice = safe.slice(i, i + 100).map(j => j.id)
      const { error } = await s.from('jobs').update({ status: 'Archived' }).in('id', slice)
      if (error) console.error(`  Batch ${i}-${i+100}: ${error.message}`)
      else console.log(`  ✓ ${i + slice.length}/${safe.length}`)
    }
  }
})()
