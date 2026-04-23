require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'
const CID = 5
const HCP_CUST = 'cus_43f1c66fbbbc4c3788639b9e37261592'
async function hcp(p) { const r=await fetch(BASE+p,{headers:{Authorization:'Token '+KEY,Accept:'application/json'}}); if(!r.ok){console.log('HCP',r.status,p);return null} return r.json() }
;(async () => {
  const { data: cust } = await sb.from('customers').select('id,name,source_id').eq('company_id',CID).eq('source_system','hcp').eq('source_id',HCP_CUST).single()
  console.log('Customer:', cust?.id, cust?.name)
  const { data: quotes } = await sb.from('quotes').select('id,quote_id,quote_amount,source_id,summary').eq('company_id',CID).eq('customer_id',cust.id)
  console.log('\nQuotes:', quotes?.length)
  for (const q of quotes||[]) {
    console.log(' ', q.quote_id, '$'+q.quote_amount, '|', q.source_id)
    const { data: lines } = await sb.from('quote_lines').select('item_name,description,quantity,price,kind,labor_cost').eq('quote_id',q.id)
    for (const l of lines||[]) console.log('   ·', l.item_name, '\n      desc:', l.description, '\n      qty=',l.quantity,' $',l.price,' kind=',l.kind,' cost=',l.labor_cost)
  }

  const { data: jobs } = await sb.from('jobs').select('id,job_id,job_title,quote_id,source_id,job_total').eq('company_id',CID).eq('customer_id',cust.id)
  console.log('\nJobs:', jobs?.length)
  for (const j of jobs||[]) {
    console.log(' ', j.job_id, '|', j.job_title, '| quote_id=', j.quote_id, '| src=', j.source_id)
    const { data: lines } = await sb.from('job_lines').select('item_name,description,quantity,price,source_id').eq('job_id',j.id)
    console.log('   job_lines:', lines?.length)
    for (const l of lines||[]) console.log('   ·', l.item_name, '|', l.description?.slice(0,80))
    // What does HCP say about the original_estimate_id?
    const hcpJob = await hcp('/jobs/' + j.source_id)
    console.log('   HCP original_estimate_id:', hcpJob?.original_estimate_id, '| work_status:', hcpJob?.work_status)
  }

  const { count } = await sb.from('invoices').select('id',{count:'exact',head:true}).eq('company_id',CID).eq('customer_id',cust.id)
  console.log('\nInvoices for this customer:', count)
  // Count where source_system=hcp WITHOUT customer match (paranoid check)
  const { count: srcInv } = await sb.from('invoices').select('id',{count:'exact',head:true}).eq('company_id',CID).eq('source_system','hcp')
  console.log('Total HCP-imported invoices for company:', srcInv)
})()
