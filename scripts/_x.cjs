require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const j = (await s.from('jobs').select('id,status,allotted_time_hours,job_title').eq('id', 21004).single()).data
  console.log('Job:', j)
  const cfg = (await s.from('settings').select('value').eq('company_id', 3).eq('key', 'payroll_config').maybeSingle()).data
  let c = {}
  try { c = JSON.parse(cfg?.value || '{}') } catch {}
  console.log('Bonus:', { enabled: c.efficiency_bonus_enabled, rate: c.efficiency_bonus_rate })
})()
