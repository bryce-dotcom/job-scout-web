require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Anything new since our last sweep on 2026-05-11
  const since = '2026-05-11T20:00:00Z'
  const { data, error } = await s.from('feedback')
    .select('id,user_email,page_url,message,status,created_at')
    .gte('created_at', since)
    .in('status', ['new','in_progress'])
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return }
  for (const r of data) {
    console.log(`──────────────`)
    console.log(`[${r.status}] ${r.created_at.slice(0,16).replace('T',' ')} ${r.user_email}`)
    console.log(`  page: ${r.page_url}`)
    console.log(`  id:   ${r.id}`)
    console.log(`  ${r.message.replace(/\n/g, '\n  ').slice(0, 1500)}`)
  }
  console.log(`\nTotal new since ${since}: ${data.length}`)
})()
