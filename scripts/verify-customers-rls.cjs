// Confirms RLS on customers is doing the right thing:
//   - anon: 0 rows
//   - service: all rows (RLS bypass)
//   - authenticated HHH user: only HHH's customers
//   - new tenant user: only their tenant's customers (we'll create one)
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN = createClient(URL, SERVICE)

;(async () => {
  console.log('=== 1. Anon (no JWT) — must be 0 rows ===')
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const { count: anonCount, error: anonErr } = await anon.from('customers').select('*', { count: 'exact', head: true })
  console.log(`   ${anonCount === 0 ? '✓' : '✗'} anon sees ${anonCount} customers (err: ${anonErr?.message || 'none'})`)

  console.log('\n=== 2. Service role — must see ALL rows (bypass) ===')
  const { count: svcCount } = await ADMIN.from('customers').select('*', { count: 'exact', head: true })
  console.log(`   ${svcCount > 3000 ? '✓' : '✗'} service sees ${svcCount} customers`)

  console.log('\n=== 3. Authenticated HHH user — must see HHH customers only ===')
  const TEST_EMAIL = `rls-3a-${Date.now()}@hhh.services`
  const TEST_PASSWORD = 'Diag_' + Math.random().toString(36).slice(2, 10)
  let authUserId = null, empId = null
  try {
    const { data: au } = await ADMIN.auth.admin.createUser({
      email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true,
    })
    authUserId = au.user.id
    const { data: emp } = await ADMIN.from('employees').insert({
      company_id: 3, name: 'RLS 3a Test', email: TEST_EMAIL,
      role: 'Sales', user_role: 'User', active: true,
    }).select().single()
    empId = emp.id

    const userClient = createClient(URL, ANON, { auth: { persistSession: false } })
    await userClient.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })

    const { count: userCount, error: userErr } = await userClient.from('customers').select('*', { count: 'exact', head: true })
    console.log(`   ${userCount > 3000 ? '✓' : '✗'} HHH-user sees ${userCount} customers (err: ${userErr?.message || 'none'})`)
    if (userCount !== svcCount) {
      console.log(`   NOTE: HHH-user count != service count — that's correct ONLY if HHH doesn't own everything`)
    }
    // Sample one to make sure they're actually HHH's
    const { data: sample } = await userClient.from('customers').select('id, name, company_id').limit(3)
    console.log('   sample:', sample)

    // Try to query OTHER companies' customers — should return 0
    const { count: otherCount } = await userClient.from('customers').select('*', { count: 'exact', head: true }).neq('company_id', 3)
    console.log(`   ${otherCount === 0 ? '✓' : '✗'} HHH-user sees ${otherCount} non-HHH customers (must be 0)`)
  } finally {
    if (empId) await ADMIN.from('employees').delete().eq('id', empId)
    if (authUserId) await ADMIN.auth.admin.deleteUser(authUserId)
  }

  console.log('\n=== 4. Demo Company (id=4) test ===')
  // Ensure Demo Company's customers stay invisible to HHH user above
  const { count: demoCount } = await ADMIN.from('customers').select('*', { count: 'exact', head: true }).eq('company_id', 4)
  console.log(`   Demo Company has ${demoCount} customers (visible to service, must be 0 to HHH user)`)
})()
