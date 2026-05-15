require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const tracy = (await s.from('employees').select('id,name').eq('email', 'tracy@hhh.services').single()).data
  console.log('Tracy:', tracy)

  const co = (await s.from('companies').select('setter_qualification_rule,commission_requires_quote').eq('id', 3).single()).data
  console.log('HHH settings:', co)

  // Tracy's setter commissions
  const period = { start: '2026-05-01T00:00:00Z', end: '2026-05-15T23:59:59Z' }
  const r = await s.from('lead_commissions').select('id,lead_id,appointment_id,amount,payment_status,created_at,commission_type').eq('employee_id', tracy.id).eq('commission_type', 'appointment_set').gte('created_at', period.start).lte('created_at', period.end).order('created_at', { ascending: false })
  console.log(`\nTracy's setter commissions ${period.start.slice(0,10)} - ${period.end.slice(0,10)}: ${r.data?.length || 0}`)
  const earned = (r.data || []).filter(c => c.payment_status === 'earned')
  const pending = (r.data || []).filter(c => c.payment_status === 'pending')
  console.log(`  earned: ${earned.length}, pending: ${pending.length}`)

  // For each earned, check if there's actually a quote on the lead
  console.log('\nEarned rows — verify a quote exists on each lead:')
  for (const c of earned) {
    const q = await s.from('quotes').select('id,quote_id,status,created_at').eq('lead_id', c.lead_id).limit(1)
    const hasQuote = (q.data || []).length > 0
    console.log(`  comm #${c.id} lead=${c.lead_id} amt=$${c.amount} ${hasQuote ? '✓ quote exists' : '✗ NO QUOTE'}`)
  }
})()
