require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  for (const t of ['customers','jobs','quotes','quote_lines','job_lines','invoices','payments','leads']) {
    const { data, error } = await sb.from(t).select('*').limit(1)
    if (error) { console.log(t, 'ERR', error.message); continue }
    console.log('\n='+t+'=')
    console.log(Object.keys(data?.[0]||{}).join(', '))
  }
})()
