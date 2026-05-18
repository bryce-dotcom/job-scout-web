require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('employees').select('id,name,email,active,company_id,role,user_role,is_admin').ilike('email', 'alayda%')
  console.log(JSON.stringify(r.data, null, 2))
})()
