require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('plaid_transactions').select('plaid_category, plaid_personal_finance_category').limit(1)
  console.log(data)
})()
