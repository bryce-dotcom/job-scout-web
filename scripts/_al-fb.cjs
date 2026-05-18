require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('feedback').select('id,page_url,message,status,created_at').eq('user_email','alayda@hhh.services').in('status',['new','in_progress']).order('created_at',{ascending:false}).limit(10)
  for (const f of (r.data||[])) console.log(`[${f.status}] ${f.created_at.slice(0,16)} ${f.page_url}\n  ${f.message.slice(0,300)}\n  id: ${f.id}\n`)
})()
