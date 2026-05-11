require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const cos = await s.from('companies').select('*').gte('created_at', since).order('created_at', { ascending: false })
  console.log('Recent companies (last 7 days):')
  console.log(JSON.stringify(cos.data, null, 2))
})()
