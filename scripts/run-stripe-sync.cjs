require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data, error } = await s.functions.invoke('stripe-sync-books', { body: { company_id: 3 } })
  console.log('result:', JSON.stringify(data, null, 2))
  if (error) console.error('err:', error)
})()
