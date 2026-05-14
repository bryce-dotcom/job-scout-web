require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Inspect schema for time_clock — is job_id int or text?
  const sample = (await s.from('time_clock').select('*').limit(1)).data?.[0]
  console.log('time_clock sample columns:')
  console.log(Object.keys(sample || {}))
  console.log('\nsample row:', JSON.stringify(sample, null, 2))

  // Any time_clock at all in last 30 days for Mike + London?
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const tc = await s.from('time_clock')
    .select('id,employee_id,job_id,start_time,end_time,duration_hours,status')
    .in('employee_id', [19, 38])
    .gte('start_time', since)
    .order('start_time', { ascending: false })
    .limit(15)
  console.log(`\ntime_clock last 30d for emp 19 + 38: ${tc.data?.length}`)
  for (const t of (tc.data || [])) {
    console.log(`  emp=${t.employee_id} job=${t.job_id} ${t.start_time?.slice(0,16)} -> ${t.end_time?.slice(0,16)} dur=${t.duration_hours}`)
  }

  // Time_clock pointing at job_id "JOB-MNY56CCN" (text variant)
  const tc2 = await s.from('time_clock').select('*').eq('job_id', 'JOB-MNY56CCN')
  console.log(`\ntime_clock with job_id='JOB-MNY56CCN': ${tc2.data?.length || 0}`)

  // The newest time_clock entries period — to see if anyone is using clocks at all
  const newest = await s.from('time_clock').select('id,employee_id,job_id,start_time,company_id').order('start_time',{ascending:false}).limit(10)
  console.log(`\nNewest 10 time_clock entries overall:`)
  for (const t of (newest.data || [])) {
    console.log(`  co=${t.company_id} emp=${t.employee_id} job=${t.job_id} ${t.start_time?.slice(0,16)}`)
  }
})()
