require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // London Miller employee id = 19
  const EMP = 19

  // Current pay period — bi-weekly. Pull from payroll_config
  const cfg = (await s.from('settings').select('value').eq('company_id', 3).eq('key', 'payroll_config').maybeSingle()).data
  console.log('payroll_config:', cfg?.value?.slice ? cfg.value.slice(0, 200) : cfg?.value)

  // Recent time_clock entries for London
  const since = '2026-04-25T00:00:00Z'
  const tc = await s.from('time_clock')
    .select('id,job_id,clock_in,clock_out,total_hours,lunch_start,lunch_end,adjusted_by,adjustment_reason')
    .eq('employee_id', EMP)
    .gte('clock_in', since)
    .order('clock_in', { ascending: false })
  console.log(`\ntime_clock entries since ${since}: ${tc.data?.length || 0}`)
  let totalTC = 0
  for (const t of (tc.data || [])) {
    totalTC += Number(t.total_hours || 0)
    console.log(`  ${(t.clock_in||'').slice(0,16)} -> ${(t.clock_out||'').slice(0,16)}  hrs=${t.total_hours}  job=${t.job_id || '-'}  ${t.adjusted_by ? 'ADJ' : ''}`)
  }
  console.log(`Σ total_hours = ${totalTC.toFixed(2)}`)

  // time_log entries
  const tl = await s.from('time_log')
    .select('id,date,hours,job_id,category')
    .eq('employee_id', EMP)
    .gte('date', since)
    .order('date', { ascending: false })
  console.log(`\ntime_log entries since ${since}: ${tl.data?.length || 0}`)
  let totalTL = 0
  for (const t of (tl.data || [])) {
    totalTL += Number(t.hours || 0)
    console.log(`  ${t.date?.slice(0,10)}  hrs=${t.hours}  job=${t.job_id || '-'}  ${t.category || ''}`)
  }
  console.log(`Σ hours = ${totalTL.toFixed(2)}`)

  // Employee details
  const emp = (await s.from('employees').select('id,name,role,is_hourly,hourly_rate,overtime_mode,pay_type').eq('id', EMP).single()).data
  console.log('\nEmployee:', emp)
})()
