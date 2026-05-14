require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Find London + Mike's employee IDs
  const emps = await s.from('employees').select('id,name,role').eq('company_id', 3).or('name.ilike.%london%,name.ilike.%mike%')
  console.log('Employees matching:')
  for (const e of emps.data || []) console.log(`  #${e.id} ${e.name} role=${e.role}`)

  const empIds = (emps.data || []).map(e => e.id)
  if (empIds.length === 0) return

  // Find their time_clock rows from late April / early May
  const start = '2026-04-20T00:00:00Z'
  const end = '2026-05-05T00:00:00Z'
  const tc = await s.from('time_clock')
    .select('id,employee_id,job_id,start_time,end_time,duration_hours,status,notes')
    .in('employee_id', empIds)
    .gte('start_time', start)
    .lte('start_time', end)
    .order('start_time', { ascending: false })
  console.log(`\ntime_clock for these employees ${start.slice(0,10)} to ${end.slice(0,10)}: ${tc.data?.length || 0}`)
  for (const t of (tc.data || [])) {
    console.log(`  emp=${t.employee_id} job=${t.job_id} ${t.start_time?.slice(0,16)} -> ${t.end_time?.slice(0,16)} duration=${t.duration_hours}h status=${t.status}`)
  }

  // job_time_logs (manager-corrected entries)
  const jtl = await s.from('job_time_logs')
    .select('*')
    .in('employee_id', empIds)
    .gte('start_time', start)
    .lte('start_time', end)
    .order('start_time', { ascending: false })
  console.log(`\njob_time_logs for these employees: ${jtl.data?.length || 0}`)
  for (const t of (jtl.data || [])) {
    console.log(`  emp=${t.employee_id} job=${t.job_id} ${t.start_time?.slice(0,16)} -> ${t.end_time?.slice(0,16)} hours=${t.hours || t.duration_hours}`)
  }

  // What jobs did they punch to?
  const jobs = new Set([...(tc.data||[]).map(t=>t.job_id), ...(jtl.data||[]).map(t=>t.job_id)].filter(Boolean))
  if (jobs.size > 0) {
    const jrows = await s.from('jobs').select('id,job_id,job_title').in('id', [...jobs])
    console.log(`\nJobs punched to:`)
    for (const j of jrows.data || []) console.log(`  #${j.id} ${j.job_id} ${j.job_title}`)
  }
})()
