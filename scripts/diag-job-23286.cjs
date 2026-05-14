require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const j = (await s.from('jobs').select('*').eq('id', 23286).single()).data
  console.log('Job 23286:')
  console.log({
    id: j?.id, job_id: j?.job_id, job_title: j?.job_title,
    customer_id: j?.customer_id, customer_name: j?.customer_name,
    email: j?.email, phone: j?.phone, address: j?.address, job_address: j?.job_address,
    quote_id: j?.quote_id, lead_id: j?.lead_id,
  })

  if (j?.customer_id) {
    const c = (await s.from('customers').select('id,name,business_name,email,phone,address').eq('id', j.customer_id).single()).data
    console.log('\nCustomer record:', c)
  }
  if (j?.quote_id) {
    const q = (await s.from('quotes').select('id,customer_id,lead_id,business_unit').eq('id', j.quote_id).single()).data
    console.log('Quote:', q)
  }
  if (j?.lead_id) {
    const l = (await s.from('leads').select('id,customer_name,email,phone,address,customer_id').eq('id', j.lead_id).single()).data
    console.log('Lead:', l)
  }
})()
