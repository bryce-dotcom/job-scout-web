require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const noah = (await s.from('employees').select('id,name,role,user_role').eq('email', 'noah@hhh.services').single()).data
  console.log('Noah:', noah)

  // Future appointments for noah
  const since = new Date().toISOString()
  const r = await s.from('appointments')
    .select('id,title,start_time,end_time,salesperson_id,salesperson_ids,lead_id,appointment_type,status')
    .eq('company_id', 3)
    .or(`salesperson_id.eq.${noah.id},salesperson_ids.cs.{${noah.id}}`)
    .gte('start_time', new Date(Date.now() - 7*86400000).toISOString())
    .order('start_time')
    .limit(20)
  console.log(`\nAppointments for Noah (last 7d + future): ${r.data?.length || 0}`)
  for (const a of (r.data || [])) {
    console.log(`  #${a.id} ${a.start_time?.slice(0,16)} "${a.title}" sales=${a.salesperson_id} sales_ids=${JSON.stringify(a.salesperson_ids)} lead=${a.lead_id} type=${a.appointment_type || ''}`)
  }
})()
