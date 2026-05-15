require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('time_clock')
    .select('id,clock_in,clock_out,total_hours,original_clock_in,original_clock_out,original_total_hours,adjusted_by,adjusted_at,adjustment_reason')
    .eq('employee_id', 19)
    .gte('clock_in', '2026-05-01T00:00:00Z')
    .lte('clock_in', '2026-05-15T23:59:59Z')
    .order('clock_in')
  console.log(`London May 1-15: ${r.data?.length || 0} rows`)
  for (const t of r.data || []) {
    console.log(`  #${t.id}: hrs=${t.total_hours} orig=${t.original_total_hours}  adj_by=${t.adjusted_by}  at=${t.adjusted_at?.slice(0,16)}  reason="${t.adjustment_reason || ''}"`)
  }

  // Are any of these very low (near 0.02)?
  console.log('\nAny rows in entire time_clock with total_hours between 0 and 0.1?')
  const tiny = await s.from('time_clock').select('id,employee_id,clock_in,total_hours,adjusted_by').gt('total_hours', 0).lt('total_hours', 0.1).eq('company_id', 3).order('clock_in', { ascending: false }).limit(10)
  for (const t of tiny.data || []) console.log(`  #${t.id} emp=${t.employee_id} ${t.clock_in?.slice(0,16)} hrs=${t.total_hours} adj=${!!t.adjusted_by}`)
})()
