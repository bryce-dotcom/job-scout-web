require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('companies')
    .select('id, company_name, owner_email, subscription_tier, active, created_at')
    .order('created_at', { ascending: true })
  console.table(data)
})()
