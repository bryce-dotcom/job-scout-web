require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('time_clock')
    .select('id,clock_in,clock_out,total_hours,job_id,adjusted_by')
    .eq('employee_id', 19)
    .eq('company_id', 3)
    .gte('clock_in', '2026-05-01T00:00:00Z')
    .lte('clock_in', '2026-05-15T23:59:59Z')
    .not('clock_out', 'is', null)
    .order('clock_in')
  console.log(`May 1-15 period: ${r.data?.length || 0} rows`)
  let total = 0
  for (const t of r.data || []) {
    total += Number(t.total_hours || 0)
    console.log(`  ${t.clock_in.slice(0,16)} -> ${t.clock_out?.slice(0,16)}  hrs=${t.total_hours}  job=${t.job_id}  adj=${!!t.adjusted_by}`)
  }
  console.log(`Σ ${total.toFixed(2)}h × $31 = $${(total*31).toFixed(2)}`)
})()
