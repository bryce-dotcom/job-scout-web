require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const ids = [
    '1c534766-5e11-4703-91cf-7a496b766130', // Utility Invoice should say Customer invoice
    '5c94d73d-b2f4-447d-a81a-c83f22f8594d', // Alison: don't say "Utility Invoice" at top; show incentive as deduction
  ]
  const { data, error } = await s.from('feedback')
    .update({ status: 'resolved' })
    .in('id', ids)
    .select('id,message,status')
  if (error) { console.error(error); return }
  console.log('Resolved:')
  for (const r of data) console.log(`  ${r.id} → ${r.status}`)
})()
