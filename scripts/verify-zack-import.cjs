require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const counts = {}
  for (const tbl of ['customers', 'jobs']) {
    const { count } = await s.from(tbl).select('id', { count: 'exact', head: true }).eq('company_id', 9)
    counts[tbl] = count
  }
  console.log('Antonino lawn care (company 9) counts:')
  console.log(JSON.stringify(counts, null, 2))

  const sample = await s.from('jobs')
    .select('id,job_title,start_date,job_total,recurrence,status,customer_id')
    .eq('company_id', 9)
    .eq('source_system', 'alc_import')
    .order('id', { ascending: false })
    .limit(5)
  console.log('\n5 most recent imported jobs:')
  for (const j of sample.data) {
    console.log(`  #${j.id} ${j.job_title.padEnd(35)} $${j.job_total || '?'} ${j.recurrence || '(once)'} ${(j.start_date || '').slice(0,10)} status=${j.status}`)
  }

  const recurring = await s.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', 9).not('recurrence', 'is', null)
  console.log(`\nRecurring jobs (Mowing schedule): ${recurring.count}`)

  const completed = await s.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', 9).eq('status', 'Completed')
  console.log(`Completed historical jobs: ${completed.count}`)
})()
