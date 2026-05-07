require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('plaid_transactions').select('*').eq('company_id', 3).order('created_at', { ascending: false }).limit(2)
  if (data?.[0]) console.log('columns:', Object.keys(data[0]).join(', '))
})()
