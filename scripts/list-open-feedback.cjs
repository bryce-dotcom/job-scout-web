require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data, error } = await s.from('feedback')
    .select('id,user_email,page_url,message,status,created_at')
    .in('status', ['new','in_progress'])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) { console.error(error); return }
  for (const r of data) {
    console.log(`──────────────`)
    console.log(`[${r.status}] ${r.created_at.slice(0,10)} ${r.user_email}`)
    console.log(`  page: ${r.page_url}`)
    console.log(`  id: ${r.id}`)
    console.log(`  ${r.message.replace(/\n/g, '\n  ').slice(0, 1000)}`)
  }
  console.log(`\nTotal open: ${data.length}`)
})()
