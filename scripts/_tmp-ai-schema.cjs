require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Full row at HHH to see all columns
  const r = await s.from('ai_modules').select('*').eq('company_id', 3).limit(2)
  console.log('Sample ai_module rows:')
  for (const m of r.data || []) console.log(JSON.stringify(m, null, 2))

  // agents registry
  const a = await s.from('agents').select('*').limit(10)
  console.log('\nagents registry rows:')
  for (const m of a.data || []) console.log(`  ${m.slug.padEnd(20)} name="${m.name}" trade=${m.trade_category} status=${m.status} order=${m.display_order}`)
})()
