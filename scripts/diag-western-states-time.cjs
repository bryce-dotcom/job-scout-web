require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Western States is job_id=21014 (from earlier diag of invoice 32438)
  const JOB_ID = 21014
  const job = (await s.from('jobs').select('*').eq('id', JOB_ID).single()).data
  console.log('JOB 21014 (Western States):')
  console.log({
    id: job?.id,
    job_id: job?.job_id,
    job_title: job?.job_title,
    status: job?.status,
    start_date: job?.start_date,
    end_date: job?.end_date,
    completed_at: job?.completed_at,
    allotted_time_hours: job?.allotted_time_hours,
    calculated_allotted_time: job?.calculated_allotted_time,
    time_tracked: job?.time_tracked,
    job_total: job?.job_total,
    incentive_amount: job?.incentive_amount,
    utility_incentive: job?.utility_incentive,
    salesperson_id: job?.salesperson_id,
    pm_id: job?.pm_id,
    assigned_team: job?.assigned_team,
    team: job?.team,
  })

  // time_clock entries on this job
  const tc = await s.from('time_clock').select('*').eq('job_id', JOB_ID).order('start_time', { ascending: false })
  console.log(`\n=== time_clock rows: ${tc.data?.length || 0} ===`)
  for (const t of (tc.data || [])) {
    console.log(`  emp=${t.employee_id}  ${t.start_time}  ->  ${t.end_time}  duration=${t.duration_hours}h  status=${t.status}  break=${t.break_minutes}m  notes=${(t.notes||'').slice(0,60)}`)
  }

  // job_time_logs entries (manager-corrected times)
  const jtl = await s.from('job_time_logs').select('*').eq('job_id', JOB_ID).order('start_time', { ascending: false })
  console.log(`\n=== job_time_logs rows: ${jtl.data?.length || 0} ===`)
  for (const t of (jtl.data || [])) {
    console.log(`  emp=${t.employee_id}  ${t.start_time}  ->  ${t.end_time}  hours=${t.hours || t.duration_hours}  status=${t.status}  notes=${(t.notes||'').slice(0,60)}`)
  }

  // Who is on the team?
  if (job?.assigned_team) {
    console.log('\nassigned_team:', JSON.stringify(job.assigned_team))
  }
  if (job?.team) {
    console.log('team:', JSON.stringify(job.team))
  }

  // job_sections (where they break the job into stages — and time might log there)
  const js = await s.from('job_sections').select('*').eq('job_id', JOB_ID)
  console.log(`\n=== job_sections: ${js.data?.length || 0} ===`)
  for (const sec of (js.data || [])) {
    console.log(`  #${sec.id} ${sec.name} assigned_to=${sec.assigned_to} est=${sec.estimated_hours} act=${sec.actual_hours} scheduled=${sec.scheduled_date} status=${sec.status}`)
  }

  // Job lines (for bonus calc — Project Cost − Material − Labor cost)
  const jl = await s.from('job_lines').select('id,quantity,price,total,labor_cost,item_name').eq('job_id', JOB_ID)
  console.log(`\n=== job_lines: ${jl.data?.length || 0} ===`)
  let totalCost = 0, totalLabor = 0
  for (const l of (jl.data || [])) {
    totalCost += Number(l.total || 0)
    totalLabor += Number(l.labor_cost || 0)
    console.log(`  ${l.item_name || ''}  qty=${l.quantity}  price=${l.price}  total=${l.total}  labor=${l.labor_cost}`)
  }
  console.log(`  Σ total cost = ${totalCost}`)
  console.log(`  Σ labor cost = ${totalLabor}`)
})()
