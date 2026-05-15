require('dotenv').config({ path: 'C:/JobScout/job-scout-web/.env' })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Past 2-3 periods
  const ranges = [
    { name: 'Apr 16 - Apr 30', start: '2026-04-16T00:00:00Z', end: '2026-04-30T23:59:59Z' },
    { name: 'Apr 1 - Apr 15', start: '2026-04-01T00:00:00Z', end: '2026-04-15T23:59:59Z' },
    { name: 'Mar 16 - Mar 31', start: '2026-03-16T00:00:00Z', end: '2026-03-31T23:59:59Z' },
  ]
  for (const p of ranges) {
    const r = await s.from('lead_commissions').select('id,payment_status,lead_id,amount').eq('employee_id', 18).eq('commission_type', 'appointment_set').gte('created_at', p.start).lte('created_at', p.end)
    const earned = (r.data || []).filter(c => c.payment_status === 'earned').length
    const pending = (r.data || []).filter(c => c.payment_status === 'pending').length
    console.log(`${p.name}: ${r.data?.length} total — earned=${earned} pending=${pending}`)
  }
})()
