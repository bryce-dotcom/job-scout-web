require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  for (const t of ['quote_lines', 'job_lines']) {
    const { data, error } = await sb.from(t).select('*').limit(1)
    console.log('\n=== ' + t + ' ===')
    if (error) { console.log('ERR', error.message); continue }
    console.log('cols:', Object.keys(data?.[0] || {}).join(', '))
  }
  // Also check file_attachments table
  const r = await sb.from('file_attachments').select('*').limit(1)
  console.log('\n=== file_attachments ===')
  console.log('err:', r.error?.message || 'OK')
  console.log('cols:', Object.keys(r.data?.[0] || {}).join(', '))
})()
