require('dotenv').config()
const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'
const CUST = 'cus_43f1c66fbbbc4c3788639b9e37261592'
async function hcp(p) { const r=await fetch(BASE+p,{headers:{Authorization:'Token '+KEY,Accept:'application/json'}}); if(!r.ok){console.log(r.status,p);return null} return r.json() }
;(async () => {
  // Test #1: filter via customer_id query param
  const a = await hcp(`/invoices?customer_id=${CUST}&page_size=10`)
  console.log('customer_id query → count:', a?.invoices?.length, '| first cust id:', a?.invoices?.[0]?.customer?.id)

  // Test #2: nested customer.id
  const b = await hcp(`/invoices?customer[id]=${CUST}&page_size=10`)
  console.log('customer[id] query → count:', b?.invoices?.length)

  // Test #3: examine what fields exist on an invoice
  const inv0 = a?.invoices?.[0]
  if (inv0) console.log('\ninvoice keys:', Object.keys(inv0).join(','), '\n  customer.id:', inv0.customer?.id)

  // Get jobs for this customer first, then look up invoices via job
  const jobs = (await hcp(`/jobs?customer_id=${CUST}&page_size=20`))?.jobs || []
  console.log('\njobs for customer:', jobs.length)
  for (const j of jobs) console.log('  job', j.id, '| invoice_number:', j.invoice_number, '| invoice_id:', j.invoice_id)
})()
