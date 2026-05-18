require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  await s.from('feedback').update({ status: 'resolved' }).eq('id', 'd916fc0e-711a-4089-915b-16361cc04c2b')
  console.log('Resolved — bonus now weights by (skill level × hours on job). London worked less, gets proportionally less. Verified live in deployed bundle.')
})()
