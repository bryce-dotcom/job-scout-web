require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Verify it's still a bogus job (no real billing)
  const { data: job } = await s.from('jobs')
    .select('id,job_title,customer_id,job_total,company_id,status,created_at')
    .eq('id', 21761)
    .single()
  if (!job) { console.log('Job 21761 not found — already gone.'); return }
  console.log('Job to delete:')
  console.log(JSON.stringify(job, null, 2))

  // Time clock rows that will be SET NULL (job_id only)
  const tc = await s.from('time_clock').select('id', { count: 'exact', head: true }).eq('job_id', 21761)
  console.log(`\ntime_clock rows that will be detached (set null): ${tc.count}`)

  const { error } = await s.from('jobs').delete().eq('id', 21761)
  if (error) { console.error('Delete failed:', error); return }
  console.log('\n✓ Deleted job 21761.')
})()
