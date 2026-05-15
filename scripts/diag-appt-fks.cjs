// What FKs point at appointments.id?
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Try delete with a fake id to see what happens — actually just inspect via metadata
  // Use raw SQL via fn
  const sql = `
    SELECT tc.table_name, kcu.column_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'appointments' AND ccu.column_name = 'id'
      AND tc.table_schema = 'public'
  `
  // (skipping the SQL — try direct test instead)

  // Pick a recent appointment that has a commission row pointing at it
  const lc = await s.from('lead_commissions').select('appointment_id').eq('company_id', 3).not('appointment_id', 'is', null).limit(1)
  const apptId = lc.data?.[0]?.appointment_id
  console.log('Appointment with commission ref:', apptId)
  if (apptId) {
    // Attempt to delete (we'll rollback by just observing error)
    const del = await s.from('appointments').delete().eq('id', apptId).eq('id', -999) // limit to 0 rows but use the syntax
    console.log('Delete dry-result:', del)
  }
  // Now check what FKs we have by inspecting lead_commissions schema
  const c = (await s.from('lead_commissions').select('*').limit(1)).data?.[0]
  console.log('lead_commissions cols:', Object.keys(c || {}))
})()
