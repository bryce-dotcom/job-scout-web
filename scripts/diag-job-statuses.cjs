require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // What statuses actually exist on HHH jobs?
  const r = await s.from('jobs').select('status').eq('company_id', 3)
  const counts = {}
  for (const j of r.data || []) counts[j.status || '(null)'] = (counts[j.status || '(null)'] || 0) + 1
  const sorted = Object.entries(counts).sort(([,a],[,b]) => b-a)
  console.log('Status counts:')
  for (const [st, n] of sorted) console.log(`  ${n.toString().padStart(4)}  ${st}`)

  // Configured job statuses
  const set = (await s.from('settings').select('value').eq('company_id', 3).eq('key', 'job_statuses').maybeSingle()).data
  console.log('\nsettings.job_statuses:')
  console.log(JSON.stringify(set?.value || null, null, 2))
})()
