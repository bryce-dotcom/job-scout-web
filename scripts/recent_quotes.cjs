require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async()=>{
  // Look at the 25 most recent quotes for any company
  const { data: qs } = await sb.from('quotes').select('id,company_id,quote_id,customer_id,salesperson_id,quote_amount,estimate_name,job_title,summary,created_at').order('created_at',{ascending:false}).limit(25)
  console.log('Most recent quotes:')
  for (const q of qs||[]) {
    const { data: c } = await sb.from('customers').select('name,business_name').eq('id', q.customer_id).maybeSingle()
    const { data: e } = q.salesperson_id ? await sb.from('employees').select('name').eq('id', q.salesperson_id).maybeSingle() : { data: null }
    const { count } = await sb.from('quote_lines').select('id',{count:'exact',head:true}).eq('quote_id',q.id)
    console.log(`  co=${q.company_id} qid=${q.quote_id} | cust=${c?.name||'?'}/${c?.business_name||''} | sp=${e?.name||'?'} | $${q.quote_amount} | lines=${count} | ${q.created_at?.slice(0,10)} | title:${q.estimate_name||q.job_title||q.summary||''}`)
  }
})()
