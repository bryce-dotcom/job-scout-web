require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const c = (await s.from('customers').select('id,name,business_name').eq('id', 207).single()).data
  console.log('Customer 207:', c)

  // Jobs for this customer
  const jobs = await s.from('jobs').select('id,job_id,job_title,status,start_date,completed_at,job_total,pm_id,assigned_team').eq('customer_id', 207).order('created_at', { ascending: false })
  console.log(`\n${jobs.data?.length || 0} jobs for customer 207:`)
  for (const j of (jobs.data || [])) {
    console.log(`  #${j.id} ${j.job_id} "${j.job_title}" status=${j.status} start=${(j.start_date||'').slice(0,10)} completed=${(j.completed_at||'').slice(0,10)} total=$${j.job_total} pm=${j.pm_id} team="${j.assigned_team||''}"`)
  }
})()
