require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const lead = (await s.from('leads').select('*').eq('id', 3688).single()).data
  console.log('Lead:'); console.log(JSON.stringify(lead, null, 2))

  const quote = (await s.from('quotes').select('*').eq('id', 4419).single()).data
  console.log('\nQuote 4419:'); console.log(JSON.stringify(quote, null, 2))

  // Audits without lead_id link but with same customer
  const ad = await s.from('lighting_audits').select('id,lead_id,customer_id,project_name,total_project_cost,total_incentive,status,created_at').eq('lead_id', 3688)
  console.log('\nAudits for lead 3688:'); console.log(JSON.stringify(ad.data, null, 2))
})()
