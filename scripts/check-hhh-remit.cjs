require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const c = (await s.from('companies').select('id,company_name,address,remit_to_address,remit_to_email').eq('id', 3).single()).data
  console.log(JSON.stringify(c, null, 2))
})()
