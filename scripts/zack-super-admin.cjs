require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Inspect his employee row
  const emp = await s.from('employees').select('*').eq('company_id', 9)
  console.log('Employees at Antonino:')
  console.log(JSON.stringify(emp.data, null, 2))

  // Find the owner
  const owner = emp.data?.find(e => e.is_owner) || emp.data?.[0]
  if (!owner) { console.error('No employee found at company 9'); return }
  console.log(`\nUpgrading employee #${owner.id} (${owner.email}) to full admin...`)

  // Bump company to field_boss for the trial
  await s.from('companies').update({ subscription_tier: 'field_boss' }).eq('id', 9)
  console.log('  ✓ Company subscription tier → field_boss')

  // role + user_role are already 'Owner'/'Admin'. Just flip is_admin to true so RLS
  // policies that check the boolean grant him full access. Skip is_developer (dev-only).
  const updates = { is_admin: true, has_hr_access: true }
  const { error: empErr } = await s.from('employees').update(updates).eq('id', owner.id)
  if (empErr) { console.error(empErr); return }
  console.log(`  ✓ Employee #${owner.id} → ${JSON.stringify(updates)}`)

  // Verify
  const verify = await s.from('companies').select('id,company_name,subscription_tier,billing_status,trial_ends_at').eq('id', 9).single()
  console.log('\nCompany after:')
  console.log(JSON.stringify(verify.data, null, 2))

  const verifyEmp = await s.from('employees').select('*').eq('id', owner.id).single()
  console.log('\nEmployee after:')
  console.log(JSON.stringify({
    id: verifyEmp.data.id,
    email: verifyEmp.data.email,
    is_owner: verifyEmp.data.is_owner,
    role: verifyEmp.data.role,
    is_admin: verifyEmp.data.is_admin,
  }, null, 2))
})()
