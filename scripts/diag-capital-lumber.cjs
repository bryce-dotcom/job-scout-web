require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Job
  const job = (await s.from('jobs').select('*').eq('id', 23272).single()).data
  console.log('JOB 23272 details/notes:')
  console.log({ details: job.details, notes: job.notes, customer_id: job.customer_id, quote_id: job.quote_id, status: job.status })

  // Quote 2723
  const q = (await s.from('quotes').select('*').eq('id', 2723).single()).data
  console.log('\nQUOTE 2723:')
  console.log({ id: q.id, summary: q.summary, notes: q.notes, estimate_message: q.estimate_message, customer_id: q.customer_id, lead_id: q.lead_id, status: q.status, job_id: q.job_id })

  // Quote line items
  const lines = (await s.from('quote_line_items').select('*').eq('quote_id', 2723)).data
  console.log(`\n${lines?.length || 0} QUOTE_LINE_ITEMS on quote 2723:`)
  for (const l of (lines || [])) console.log(`  - ${l.description || l.name || ''} qty=${l.quantity} price=${l.price} total=${l.total}`)

  // Job line items
  const jli = (await s.from('job_line_items').select('*').eq('job_id', 23272)).data
  console.log(`\n${jli?.length || 0} JOB_LINE_ITEMS on job 23272`)

  // Job sections
  const js = (await s.from('job_sections').select('*').eq('job_id', 23272)).data
  console.log(`${js?.length || 0} JOB_SECTIONS on job 23272`)
})()
