require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // ALL payments — no status filter
  const r = await s.from('payments').select('*').eq('invoice_id', 32438)
  console.log(`payments (all): ${r.data?.length || 0}`)
  for (const p of (r.data || [])) console.log(JSON.stringify(p, null, 2))

  // Also try job-scoped
  const r2 = await s.from('payments').select('*').eq('job_id', 21014)
  console.log(`\npayments by job 21014: ${r2.data?.length || 0}`)
  for (const p of (r2.data || [])) console.log(`  $${p.amount} status=${p.status} invoice_id=${p.invoice_id}`)
})()
