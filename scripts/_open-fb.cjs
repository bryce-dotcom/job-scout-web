require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('feedback').select('id,user_email,page_url,message,status,created_at').in('status', ['new','in_progress']).order('created_at',{ascending:false}).limit(30)
  for (const f of (r.data||[])) {
    const who = (f.user_email||'').split('@')[0]
    console.log(`[${f.status==='new'?'NEW':'in-progress'}] ${f.created_at.slice(0,16)} ${who.padEnd(12)} ${f.page_url}`)
    console.log(`  ${f.message.replace(/\n+/g,' ').slice(0,260)}`)
    console.log(`  id: ${f.id}\n`)
  }
})()
