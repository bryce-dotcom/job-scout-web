require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  for (const t of ['job_line_items', 'job_lines', 'job_sections']) {
    const r = await s.from(t).select('*').limit(1)
    console.log(`${t}:`)
    if (r.error) console.log(`  ERROR: ${r.error.message}`)
    else console.log('  ', JSON.stringify(r.data?.[0], null, 2))
    console.log()
  }
})()
