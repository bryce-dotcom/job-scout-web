require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await sb.from('employees').select('*').limit(1)
  console.log(Object.keys(data?.[0] || {}).filter(k => k.includes('user') || k.includes('auth')).join(', '))
  console.log('all:', Object.keys(data?.[0] || {}).join(', '))
})()
