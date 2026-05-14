require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const jl = await s.from('job_lines').select('*').eq('job_id', 23272)
  console.log(JSON.stringify(jl.data, null, 2))
})()
