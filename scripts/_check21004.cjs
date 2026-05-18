require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const j = await s.from('jobs').select('id,customer_id,quote_id,lead_id,job_title,customer:customers!customer_id(id,name,business_name),quote:quotes!quote_id(id,quote_id,customer_id)').eq('id', 21004).single()
  console.log(JSON.stringify(j, null, 2))
})()
