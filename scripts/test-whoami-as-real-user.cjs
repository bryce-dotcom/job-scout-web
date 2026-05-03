// Create a throwaway HHH employee + auth user, sign in as them, call
// whoami(), then clean up. Proves JWT-to-company resolution works.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN = createClient(URL, SERVICE)

const TEST_EMAIL = `rls-diag-${Date.now()}@hhh.services`
const TEST_PASSWORD = 'DiagnosticOnly_' + Math.random().toString(36).slice(2, 10)
const HHH_COMPANY_ID = 3

;(async () => {
  let authUserId = null, empId = null
  try {
    console.log('1. Creating throwaway auth user...')
    const { data: authData, error: aErr } = await ADMIN.auth.admin.createUser({
      email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true,
    })
    if (aErr) throw aErr
    authUserId = authData.user.id
    console.log(`   auth user: ${authUserId}`)

    console.log('2. Inserting employee row in HHH...')
    const { data: emp, error: eErr } = await ADMIN.from('employees').insert({
      company_id: HHH_COMPANY_ID,
      name: 'RLS Diagnostic',
      email: TEST_EMAIL,
      role: 'Sales',
      user_role: 'User',
      active: true,
    }).select().single()
    if (eErr) throw eErr
    empId = emp.id
    console.log(`   employee: ${empId}`)

    console.log('3. Signing in as throwaway user...')
    const userClient = createClient(URL, ANON, { auth: { persistSession: false } })
    const { error: sErr } = await userClient.auth.signInWithPassword({
      email: TEST_EMAIL, password: TEST_PASSWORD,
    })
    if (sErr) throw sErr

    console.log('4. Calling whoami() as authenticated HHH employee...')
    const { data: who, error: wErr } = await userClient.rpc('whoami')
    if (wErr) throw wErr
    console.log(JSON.stringify(who, null, 2))

    console.log('\n5. SECONDARY CHECK — direct query against employees with the auth')
    const { data: empSelf } = await userClient.from('employees').select('id, name, company_id').eq('email', TEST_EMAIL)
    console.log('   self-lookup result:', empSelf)

    console.log('\n=== JUDGEMENT ===')
    if (who.resolved_company_ids?.includes(HHH_COMPANY_ID)) {
      console.log(`✓ JWT resolution WORKS — got company_ids: [${who.resolved_company_ids}]`)
      console.log('  Safe to proceed with RLS rollout.')
    } else {
      console.log(`✗ JWT resolution FAILED — got: ${JSON.stringify(who.resolved_company_ids)}`)
      console.log('  RLS rollout is NOT safe. Stop and debug.')
    }
  } catch (err) {
    console.error('FAIL:', err.message)
  } finally {
    console.log('\n6. Cleaning up...')
    if (empId) await ADMIN.from('employees').delete().eq('id', empId)
    if (authUserId) await ADMIN.auth.admin.deleteUser(authUserId)
    console.log('   done')
  }
})()
