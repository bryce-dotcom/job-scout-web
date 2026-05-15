require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  await s.from('feedback').update({ status: 'resolved' }).eq('id', 'b1d647e3-5291-4c17-8ed4-1ca099a3069e')
  console.log('Noah appointments — resolved with Only Mine toggle')
})()
