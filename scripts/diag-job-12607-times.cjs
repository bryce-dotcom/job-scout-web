require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const j = (await s.from('jobs').select('id,job_id,job_title,status,start_date,end_date,completed_at,appointment_time,date,created_at,updated_at,last_status_change_at').eq('id', 12607).single()).data
  console.log(JSON.stringify(j, null, 2))

  // Time clock + job_time_logs
  const tc = await s.from('time_clock').select('id,employee_id,start_time,end_time,duration_hours').eq('job_id', 12607).order('start_time', { ascending: false }).limit(10)
  console.log(`\ntime_clock entries: ${tc.data?.length || 0}`)
  for (const t of (tc.data || [])) console.log(`  emp=${t.employee_id} ${t.start_time} -> ${t.end_time} (${t.duration_hours}h)`)

  const jtl = await s.from('job_time_logs').select('*').eq('job_id', 12607).order('start_time', { ascending: false }).limit(10)
  console.log(`\njob_time_logs entries: ${jtl.data?.length || 0}`)
  for (const t of (jtl.data || [])) console.log(`  emp=${t.employee_id} ${t.start_time} -> ${t.end_time} hours=${t.hours || t.duration_hours}`)
})()
