require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.functions.invoke('stripe-merchant-summary', { body: { company_id: 3, days: 30 } })
  console.log(JSON.stringify(data, null, 2))
})()
