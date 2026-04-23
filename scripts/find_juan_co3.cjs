require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async()=>{
  for (const term of ['juan','diego','skagg']) {
    console.log('\n=== co=3 term:', term)
    for (const tbl of ['customers','quotes','jobs','leads']) {
      const fld = tbl==='customers' ? 'name' : (tbl==='jobs'?'job_title':(tbl==='leads'?'customer_name':'estimate_name'))
      const orFilter = tbl==='customers'
        ? `name.ilike.%${term}%,business_name.ilike.%${term}%,address.ilike.%${term}%`
        : tbl==='jobs'
        ? `job_title.ilike.%${term}%,customer_name.ilike.%${term}%,details.ilike.%${term}%,job_address.ilike.%${term}%`
        : tbl==='leads'
        ? `customer_name.ilike.%${term}%,job_title.ilike.%${term}%,address.ilike.%${term}%,notes.ilike.%${term}%`
        : `estimate_name.ilike.%${term}%,summary.ilike.%${term}%,job_title.ilike.%${term}%,notes.ilike.%${term}%`
      const { data, error } = await sb.from(tbl).select('id,company_id,*').eq('company_id',3).or(orFilter)
      console.log(' ', tbl, '->', error?.message || (data?.length||0))
      for (const r of (data||[]).slice(0,5)) {
        const sample = tbl==='customers' ? `${r.name} | ${r.business_name||''} | ${r.address||''}`
          : tbl==='jobs' ? `${r.job_id||''} | ${r.customer_name||''} | ${r.job_title||''} | ${r.job_address||''}`
          : tbl==='leads' ? `${r.lead_id||''} | ${r.customer_name||''} | ${r.job_title||''}`
          : `${r.quote_id||''} | $${r.quote_amount} | ${r.estimate_name||r.summary||r.job_title||''}`
        console.log('     ', r.id, '|', sample)
      }
    }
  }
})()
