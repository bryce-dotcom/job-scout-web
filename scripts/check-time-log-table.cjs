require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // time_log (singular) — what the bonus calc reads
  const tl = await s.from('time_log').select('*').eq('job_id', 21014)
  console.log(`time_log rows on job 21014: ${tl.data?.length || 0} (error: ${tl.error?.message || 'none'})`)
  for (const t of (tl.data || [])) {
    console.log(JSON.stringify(t, null, 2))
  }

  // Sample of time_log
  const sample = (await s.from('time_log').select('*').limit(1)).data?.[0]
  console.log('\ntime_log columns:', Object.keys(sample || {}))
  console.log('sample:', JSON.stringify(sample, null, 2))

  // How many time_log rows exist company-wide for HHH?
  const cnt = await s.from('time_log').select('id', { count: 'exact', head: true }).eq('company_id', 3)
  console.log(`\nTotal HHH time_log rows: ${cnt.count}`)

  // How many time_clock rows?
  const tcCnt = await s.from('time_clock').select('id', { count: 'exact', head: true }).eq('company_id', 3)
  console.log(`Total HHH time_clock rows: ${tcCnt.count}`)
})()
