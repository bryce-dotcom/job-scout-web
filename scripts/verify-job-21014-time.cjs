require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Job 21014 = Western States
  const r = await s.from('time_clock').select('id,employee_id,clock_in,clock_out,total_hours,original_total_hours,adjusted_by,adjustment_reason').eq('job_id', 21014).order('clock_in')
  console.log(`time_clock on job 21014: ${r.data?.length || 0}`)
  let total = 0, origTotal = 0
  for (const t of r.data || []) {
    total += Number(t.total_hours || 0)
    origTotal += Number(t.original_total_hours || t.total_hours || 0)
    console.log(`  emp=${t.employee_id} ${t.clock_in?.slice(0,16)} adj=${t.total_hours} (orig=${t.original_total_hours}) reason="${(t.adjustment_reason || '').slice(0,40)}"`)
  }
  console.log(`Σ current = ${total.toFixed(2)}h`)
  console.log(`Σ original = ${origTotal.toFixed(2)}h`)

  // The job's cached time_tracked
  const j = (await s.from('jobs').select('id,time_tracked,allotted_time_hours').eq('id', 21014).single()).data
  console.log(`\njobs.time_tracked = ${j?.time_tracked}h (allotted ${j?.allotted_time_hours}h)`)
})()
