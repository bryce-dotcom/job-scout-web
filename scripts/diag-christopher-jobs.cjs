require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const e = (await s.from('employees').select('id,name,role').eq('email', 'christopher@hhh.services').single()).data
  console.log('Christopher employee:', e)

  // Recently completed jobs Christopher touched (via time_clock)
  const tc = await s.from('time_clock').select('job_id,clock_in,clock_out,total_hours').eq('employee_id', e.id).not('clock_out', 'is', null).order('clock_out', { ascending: false }).limit(20)
  const jobIds = [...new Set(tc.data.map(t => t.job_id).filter(Boolean))]
  console.log(`\nClock entries: ${tc.data.length} on ${jobIds.length} jobs`)

  if (jobIds.length) {
    const jobs = await s.from('jobs').select('id,job_id,job_title,status,start_date,pm_id,job_lead_id,assigned_team,completed_at').in('id', jobIds)
    console.log('\nJobs Christopher punched on:')
    for (const j of jobs.data || []) {
      const visible = (
        j.pm_id === e.id ||
        j.job_lead_id === e.id ||
        !j.pm_id ||
        (j.assigned_team && j.assigned_team.toLowerCase().includes(e.name.toLowerCase()))
      )
      console.log(`  #${j.id} ${j.job_title?.slice(0,40).padEnd(40)} status=${j.status?.padEnd(20)} pm=${j.pm_id} team="${j.assigned_team||''}" visible=${visible}`)
    }
  }
})()
