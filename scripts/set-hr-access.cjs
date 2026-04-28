// Grant HR access to Alayda; revoke from Tracy.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  // Find both
  const { data: emps } = await s.from('employees')
    .select('id, name, email, has_hr_access, user_role, role')
    .or('name.ilike.%alayda%,name.ilike.%tracy%')
    .eq('company_id', 3)
  console.log('Before:')
  console.table(emps)

  const alayda = emps.find(e => /alayda/i.test(e.name))
  const tracy = emps.find(e => /tracy/i.test(e.name))

  if (alayda) {
    await s.from('employees').update({ has_hr_access: true }).eq('id', alayda.id)
    console.log(`-> Granted HR access to ${alayda.name} (id ${alayda.id})`)
  } else {
    console.warn('No Alayda found')
  }
  if (tracy) {
    await s.from('employees').update({ has_hr_access: false }).eq('id', tracy.id)
    console.log(`-> Revoked HR access from ${tracy.name} (id ${tracy.id})`)
  } else {
    console.warn('No Tracy found')
  }

  const { data: after } = await s.from('employees')
    .select('id, name, email, has_hr_access, user_role, role')
    .or('name.ilike.%alayda%,name.ilike.%tracy%')
    .eq('company_id', 3)
  console.log('\nAfter:')
  console.table(after)
})()
