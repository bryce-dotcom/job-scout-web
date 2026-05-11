require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Look at an existing customer to learn columns
  const c = await s.from('customers').select('*').eq('company_id', 3).limit(1)
  console.log('CUSTOMERS sample (HHH):'); console.log(JSON.stringify(c.data?.[0], null, 2))

  const j = await s.from('jobs').select('*').eq('company_id', 3).limit(1)
  console.log('\nJOBS sample (HHH):'); console.log(JSON.stringify(j.data?.[0], null, 2))

  // Recurring jobs — is there a recurring_jobs table?
  const r = await s.from('recurring_jobs').select('*').limit(1)
  console.log('\nRECURRING_JOBS:'); console.log(JSON.stringify(r, null, 2))
})()
