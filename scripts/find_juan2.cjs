require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 5
;(async () => {
  for (const term of ['juan', 'diego']) {
    console.log('\n=== term:', term)
    const c = await sb.from('customers').select('id,name,email,address').eq('company_id', CID).or(`name.ilike.%${term}%,address.ilike.%${term}%,business_name.ilike.%${term}%`)
    console.log('customers:', c.data?.length || 0, c.error?.message || '')
    ;(c.data||[]).slice(0,15).forEach(r => console.log(' ', r.id, r.name, '|', r.address))
    const j = await sb.from('jobs').select('id,job_title,customer_name,job_address,details').eq('company_id', CID).or(`job_title.ilike.%${term}%,job_address.ilike.%${term}%,customer_name.ilike.%${term}%`)
    console.log('jobs:', j.data?.length || 0, j.error?.message || '')
    ;(j.data||[]).slice(0,15).forEach(r => console.log(' ', r.id, r.customer_name, '|', r.job_title, '|', r.job_address))
  }
})()
