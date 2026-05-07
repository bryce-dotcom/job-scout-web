require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('payments').select('*').limit(1)
  if (data && data[0]) console.log('payments columns:', Object.keys(data[0]).sort().join(', '))
})()
