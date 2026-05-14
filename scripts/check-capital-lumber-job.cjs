require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Find Capital Lumber jobs
  const r = await s.from('jobs')
    .select('id,job_id,job_title,status,start_date,customer_id,quote_id,details,notes,created_at')
    .ilike('job_title', '%capital lumber%')
    .order('created_at', { ascending: false })
  console.log(JSON.stringify(r.data, null, 2))

  // Also any recently-created jobs that came from approve-document path
  const since = '2026-05-12T00:00:00Z'
  const recent = await s.from('jobs')
    .select('id,job_id,job_title,status,start_date,customer_id,quote_id,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)
  console.log('\n--- Jobs created since May 12 ---')
  for (const j of recent.data) console.log(`  #${j.id} ${j.job_id} title=${j.job_title?.slice(0,50)} status=${j.status} start=${(j.start_date||'').slice(0,10)} quote=${j.quote_id}`)
})()
