require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data: ca, error } = await s.from('company_agents').select('*').eq('company_id', 3)
  console.log('error:', error)
  console.log('rows:', ca?.length, ca)

  // Also look at AgentRequired logic
  const { data: any } = await s.from('company_agents').select('*').limit(5)
  console.log('\nFirst 5 company_agents (any company):')
  console.table(any)
})()
