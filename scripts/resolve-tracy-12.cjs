require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  for (const id of ['96de0f43-ab76-4892-85c0-700abeecc122', 'f3106057-ff57-4aa1-827b-be90ee6c8ba1']) {
    const { error } = await s.from('feedback').update({ status: 'resolved' }).eq('id', id)
    if (error) console.error(id, error)
    else console.log(`✓ ${id.slice(0,8)} resolved`)
  }
})()
