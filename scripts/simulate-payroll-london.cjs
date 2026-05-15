// Simulate exactly what Payroll.jsx fetches and computes for London Miller.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const EMP = 19

  // Pull the saved pay period boundaries the way Payroll likely uses them
  const cfg = JSON.parse((await s.from('settings').select('value').eq('company_id', 3).eq('key', 'payroll_config').maybeSingle()).data?.value || '{}')
  console.log('cfg:', { pay_frequency: cfg.pay_frequency, pay_day_1: cfg.pay_day_1, pay_day_2: cfg.pay_day_2, efficiency_bonus_enabled: cfg.efficiency_bonus_enabled, efficiency_bonus_rate: cfg.efficiency_bonus_rate, overtime_mode: cfg.overtime_mode, overtime_threshold: cfg.overtime_threshold })

  // Try a few candidate pay periods semi-monthly
  const periods = [
    { name: 'Apr 21 - May 5', start: '2026-04-21T00:00:00Z', end: '2026-05-05T23:59:59Z' },
    { name: 'May 6 - May 20', start: '2026-05-06T00:00:00Z', end: '2026-05-20T23:59:59Z' },
    { name: 'May 21 - Jun 5', start: '2026-05-21T00:00:00Z', end: '2026-06-05T23:59:59Z' },
  ]

  for (const p of periods) {
    const r = await s.from('time_clock')
      .select('id,clock_in,clock_out,total_hours,job_id')
      .eq('employee_id', EMP)
      .eq('company_id', 3)
      .gte('clock_in', p.start)
      .lte('clock_in', p.end)
      .not('clock_out', 'is', null)
    const total = (r.data || []).reduce((sum, t) => sum + Number(t.total_hours || 0), 0)
    console.log(`\n${p.name}: ${r.data?.length || 0} rows, Σ ${total.toFixed(2)}h`)
    for (const t of (r.data || [])) {
      console.log(`  ${t.clock_in?.slice(0,16)}  hrs=${t.total_hours}  job=${t.job_id}`)
    }
  }
})()
