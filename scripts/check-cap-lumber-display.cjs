require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const jl = await s.from('job_lines').select('*').eq('job_id', 23272)
  console.log(`job_lines on job 23272: ${jl.data?.length || 0}`)
  for (const l of (jl.data || [])) console.log(`  - ${l.item_name || l.description || ''} qty=${l.quantity} price=${l.price} total=${l.total}`)

  // Job header info
  const job = (await s.from('jobs').select('*').eq('id', 23272).single()).data
  console.log('\nJob header:')
  console.log({
    customer_id: job.customer_id,
    customer_name: job.customer_name,
    business_name: job.business_name,
    details: job.details,
    notes: job.notes,
    job_total: job.job_total,
    address: job.address || job.job_address,
  })

  // Quote
  const q = (await s.from('quotes').select('customer_id,summary,notes,estimate_message,quote_amount').eq('id', 2723).single()).data
  console.log('\nQuote 2723 source data:')
  console.log(q)

  // Job sections
  const js = await s.from('job_sections').select('*').eq('job_id', 23272)
  console.log(`\njob_sections: ${js.data?.length || 0}`)
})()
