require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('agents').select('id, slug, name, description').in('slug', ['zach-yard-yeti', 'arnie-og']).order('slug')
  console.table(data)
})()
