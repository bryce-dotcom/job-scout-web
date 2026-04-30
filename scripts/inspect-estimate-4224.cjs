require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('quotes').select('*').eq('id', 4224).maybeSingle()
  console.log(JSON.stringify(data, null, 2))
})()
