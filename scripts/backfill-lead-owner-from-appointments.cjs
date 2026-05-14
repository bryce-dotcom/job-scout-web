// For any "Appointment Set" lead with no lead_owner_id, set it to the
// salesperson_id. That way Cole sees Tracy's appointments in Lenard's
// "My Projects" picker and doesn't have to recreate the lead from
// scratch (which orphans the setter commission).
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
;(async () => {
  const r = await s.from('leads')
    .select('id,customer_name,status,salesperson_id,lead_owner_id,appointment_id')
    .eq('company_id', 3)
    .is('lead_owner_id', null)
    .not('salesperson_id', 'is', null)
    .eq('status', 'Appointment Set')
  console.log(`Leads to update: ${r.data?.length || 0}`)
  for (const l of (r.data || []).slice(0, 10)) console.log(`  #${l.id} "${l.customer_name}" sales=${l.salesperson_id} appt=${l.appointment_id}`)

  if (!APPLY) { console.log('\n[DRY RUN] Pass --apply.'); return }
  for (const l of r.data || []) {
    await s.from('leads').update({ lead_owner_id: l.salesperson_id }).eq('id', l.id)
  }
  console.log(`✓ Set lead_owner_id on ${r.data?.length || 0} leads.`)
})()
