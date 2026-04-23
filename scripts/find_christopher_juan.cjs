// Find Christopher's freshly-built Juan Diego estimate in JobScout.
// Could be by quote.summary, customer name, lead, or job title.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 5
;(async () => {
  // Christopher's employee row
  const { data: emp } = await sb.from('employees').select('id,name,email').eq('company_id',CID).ilike('name','%christopher%')
  console.log('Christopher employees:', emp?.length)
  for (const e of emp||[]) console.log('  ', e.id, e.name, e.email)
  const empIds = (emp||[]).map(e => e.id)

  // Recent quotes from Christopher OR with Juan Diego in any text
  console.log('\n--- recent quotes by christopher ---')
  if (empIds.length) {
    const { data: qs } = await sb.from('quotes').select('id,quote_id,customer_id,salesperson_id,quote_amount,summary,estimate_name,job_title,notes,created_at').eq('company_id',CID).in('salesperson_id', empIds).order('created_at',{ascending:false}).limit(10)
    for (const q of qs||[]) {
      console.log(' ', q.id, q.quote_id, '$'+q.quote_amount, '|', q.estimate_name||q.summary||q.job_title||'(no title)', '|', q.created_at?.slice(0,10))
      const { data: ll } = await sb.from('quote_lines').select('item_name,description,quantity,price').eq('quote_id',q.id)
      console.log('     lines:', ll?.length)
      for (const l of ll||[]) console.log('       ·', l.item_name, '| qty', l.quantity, '$',l.price)
    }
  }

  console.log('\n--- quotes with juan/diego in any text ---')
  const { data: qj } = await sb.from('quotes').select('id,quote_id,customer_id,salesperson_id,quote_amount,summary,estimate_name,job_title,notes,created_at').eq('company_id',CID).or('summary.ilike.%juan%,estimate_name.ilike.%juan%,job_title.ilike.%juan%,notes.ilike.%juan%,summary.ilike.%diego%,estimate_name.ilike.%diego%,job_title.ilike.%diego%')
  console.log(' matches:', qj?.length)
  for (const q of qj||[]) {
    console.log(' ', q.id, q.quote_id, '$'+q.quote_amount, '| created', q.created_at?.slice(0,10))
    console.log('   estimate_name:', q.estimate_name)
    console.log('   summary:', q.summary)
    console.log('   job_title:', q.job_title)
    console.log('   sp:', q.salesperson_id, '| cust:', q.customer_id)
    const { data: ll } = await sb.from('quote_lines').select('item_name,description,quantity,price').eq('quote_id',q.id)
    console.log('   lines:', ll?.length)
    for (const l of ll||[]) console.log('     ·', l.item_name, '| qty',l.quantity,'$',l.price,'| desc:',(l.description||'').slice(0,60))
  }

  console.log('\n--- leads with juan/diego ---')
  const { data: ld } = await sb.from('leads').select('id,lead_id,customer_name,job_title,salesperson_id,created_at').eq('company_id',CID).or('customer_name.ilike.%juan%,job_title.ilike.%juan%,customer_name.ilike.%diego%,job_title.ilike.%diego%')
  console.log(' matches:', ld?.length)
  for (const l of ld||[]) console.log(' ', l.id, l.lead_id, '|', l.customer_name, '|', l.job_title, '| sp:', l.salesperson_id, '|', l.created_at?.slice(0,10))
})()
