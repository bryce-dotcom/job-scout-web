require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 5
;(async () => {
  for (const tbl of ['customers', 'jobs', 'leads', 'quotes']) {
    const cols = tbl === 'customers' ? 'id,name,email' :
                 tbl === 'jobs' ? 'id,job_id,job_title,customer_name,details' :
                 tbl === 'leads' ? 'id,lead_id,customer_name,job_description' :
                 'id,quote_id,customer_name,job_description'
    const fld = tbl === 'jobs' ? 'job_title' :
                tbl === 'customers' ? 'name' : 'customer_name'
    const { data, error } = await sb.from(tbl).select(cols).eq('company_id', CID).or(`${fld}.ilike.%juan%,${fld}.ilike.%diego%`)
    console.log(tbl, '->', error?.message || `${data?.length || 0} matches`)
    for (const r of (data || []).slice(0, 10)) console.log('  ', JSON.stringify(r))
  }
})()
