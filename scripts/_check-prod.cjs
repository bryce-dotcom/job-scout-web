require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('products_services').select('id,name,in_utility_scope,suggest_in_lenard,floor_price,ceiling_price').limit(1)
  console.log(JSON.stringify(r, null, 2))
})()
