require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const JOB_ID = 21014
  // time_clock on this job — correct columns now
  const tc = await s.from('time_clock')
    .select('id,employee_id,clock_in,clock_out,total_hours,notes,adjusted_by,job_id')
    .eq('job_id', JOB_ID)
    .order('clock_in', { ascending: false })
  console.log(`time_clock on job 21014: ${tc.data?.length || 0}`)
  let tcTotal = 0
  for (const t of (tc.data || [])) {
    tcTotal += Number(t.total_hours || 0)
    console.log(`  emp=${t.employee_id}  ${t.clock_in?.slice(0,16)} -> ${t.clock_out?.slice(0,16)}  hrs=${t.total_hours}  adjusted=${!!t.adjusted_by}`)
  }
  console.log(`  Σ time_clock hours = ${tcTotal}`)

  // Mike + London's punches last 30 days
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const mike = await s.from('time_clock').select('id,job_id,clock_in,clock_out,total_hours').eq('employee_id', 38).gte('clock_in', since).order('clock_in', { ascending: false }).limit(20)
  const london = await s.from('time_clock').select('id,job_id,clock_in,clock_out,total_hours').eq('employee_id', 19).gte('clock_in', since).order('clock_in', { ascending: false }).limit(20)
  console.log(`\nMike (38) last 30d: ${mike.data?.length || 0}`)
  for (const t of (mike.data || [])) console.log(`  job=${t.job_id || '-'}  ${t.clock_in?.slice(0,16)}  hrs=${t.total_hours}`)
  console.log(`\nLondon (19) last 30d: ${london.data?.length || 0}`)
  for (const t of (london.data || [])) console.log(`  job=${t.job_id || '-'}  ${t.clock_in?.slice(0,16)}  hrs=${t.total_hours}`)

  // job_time_logs (manager corrections / direct entries)
  const jtl = await s.from('job_time_logs').select('*').eq('job_id', JOB_ID).order('start_time', { ascending: false })
  console.log(`\njob_time_logs on 21014: ${jtl.data?.length || 0}`)
  for (const t of (jtl.data || [])) console.log(`  emp=${t.employee_id}  ${(t.start_time||'').slice(0,16)} -> ${(t.end_time||'').slice(0,16)}  hours=${t.hours || t.duration_hours}`)

  // Schema check for job_time_logs
  const jtlSample = (await s.from('job_time_logs').select('*').limit(1)).data?.[0]
  if (jtlSample) console.log('\njob_time_logs columns:', Object.keys(jtlSample))
})()
