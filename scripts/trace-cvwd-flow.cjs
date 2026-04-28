// Trace Central Valley Water District through customer -> estimate -> job
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Customers
  const { data: custs } = await s.from('customers')
    .select('id, name, email, phone, created_at')
    .or('name.ilike.%central%valley%,name.ilike.%cvwd%,name.ilike.%water%district%')
    .eq('company_id', 3)
  console.log('Customers (any "central valley" / "water district" / cvwd):')
  console.table(custs)

  // Estimate 4206 specifically
  const { data: est } = await s.from('quotes').select('*').eq('id', 4206).maybeSingle()
  console.log('\nEstimate 4206:')
  console.log(JSON.stringify(est, null, 2))

  // Customer 7600
  const { data: cust7600 } = await s.from('customers').select('*').eq('id', 7600).maybeSingle()
  console.log('\nCustomer 7600:')
  console.log(JSON.stringify(cust7600, null, 2))

  // Quotes for these customers
  if (custs?.length) {
    const ids = custs.map(c => c.id)
    const { data: cQuotes } = await s.from('quotes')
      .select('id, quote_id, estimate_name, status, quote_amount, lead_id, customer_id, approved_date, created_at')
      .or(`customer_id.in.(${ids.join(',')})`)
    console.log('\nQuotes for those customers:')
    console.table(cQuotes)
  }

  // Jobs that mention central valley
  const { data: jobs } = await s.from('jobs')
    .select('id, job_id, job_title, status, customer_id, lead_id, start_date, created_at, customer:customers!customer_id(name)')
    .or('job_title.ilike.%central valley%,job_title.ilike.%water district%')
    .eq('company_id', 3)
  console.log('\nJobs mentioning Central Valley:')
  console.table((jobs || []).map(j => ({
    id: j.id, job_id: j.job_id, title: j.job_title, customer: j.customer?.name,
    status: j.status, start: j.start_date?.split('T')[0], created: j.created_at?.split('T')[0],
  })))

  // Most recent jobs created today (Doug was working today)
  const today = new Date(); today.setHours(0,0,0,0)
  const { data: recent } = await s.from('jobs')
    .select('id, job_id, job_title, status, customer:customers!customer_id(name), start_date, created_at')
    .gte('created_at', today.toISOString())
    .eq('company_id', 3)
    .order('created_at', { ascending: false })
  console.log(`\nJobs created today (${recent?.length || 0}):`)
  console.table((recent || []).map(j => ({
    id: j.id, title: j.job_title, customer: j.customer?.name,
    status: j.status, start: j.start_date,
    created: j.created_at,
  })))
})()
