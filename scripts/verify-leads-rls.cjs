require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN = createClient(URL, SERVICE)

;(async () => {
  console.log('=== 1. Anon SELECT — must be 0 rows ===')
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const { count: anonR, error: anonRErr } = await anon.from('leads').select('*', { count: 'exact', head: true })
  console.log(`   ${anonR === 0 ? '✓' : '✗'} anon sees ${anonR} leads (err: ${anonRErr?.message || 'none'})`)

  console.log('\n=== 2. Anon UPDATE on signature column — should succeed ===')
  // Find a real lead id to test against
  const { data: aLead } = await ADMIN.from('leads').select('id').eq('company_id', 3).limit(1).single()
  const { error: anonUpErr, status } = await anon.from('leads').update({
    customer_signature_method: 'test_anon_' + Date.now()
  }).eq('id', aLead.id).select()
  console.log(`   ${!anonUpErr ? '✓' : '✗'} anon UPDATE signature_method on lead ${aLead.id}: status=${status}, err=${anonUpErr?.message || 'none'}`)

  console.log('\n=== 3. Anon UPDATE on non-signature column — should fail ===')
  const { error: anonBadErr } = await anon.from('leads').update({
    customer_name: 'HACKED'
  }).eq('id', aLead.id).select()
  console.log(`   ${anonBadErr ? '✓' : '✗'} anon UPDATE customer_name blocked: ${anonBadErr?.message || 'WROTE — BAD'}`)

  console.log('\n=== 4. Service sees all leads ===')
  const { count: svcCount } = await ADMIN.from('leads').select('*', { count: 'exact', head: true })
  console.log(`   ${svcCount > 1000 ? '✓' : '✗'} service sees ${svcCount} leads`)

  console.log('\n=== 5. Authenticated HHH user — sees only HHH leads ===')
  const TEST_EMAIL = `rls-3b-${Date.now()}@hhh.services`
  const TEST_PASS = 'D_' + Math.random().toString(36).slice(2, 10)
  let aid = null, eid = null
  try {
    const { data: au } = await ADMIN.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASS, email_confirm: true })
    aid = au.user.id
    const { data: emp } = await ADMIN.from('employees').insert({ company_id: 3, name: 'RLS 3b', email: TEST_EMAIL, role: 'Sales', user_role: 'User', active: true }).select().single()
    eid = emp.id
    const u = createClient(URL, ANON, { auth: { persistSession: false } })
    await u.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS })
    const { count: uCount } = await u.from('leads').select('*', { count: 'exact', head: true })
    const { count: nonHHH } = await u.from('leads').select('*', { count: 'exact', head: true }).neq('company_id', 3)
    console.log(`   ${uCount > 100 ? '✓' : '✗'} HHH-user sees ${uCount} leads`)
    console.log(`   ${nonHHH === 0 ? '✓' : '✗'} HHH-user sees ${nonHHH} non-HHH leads (must be 0)`)

    // Check INSERT works
    const { data: ins, error: insErr } = await u.from('leads').insert({
      company_id: 3, customer_name: 'RLS 3b test lead', status: 'New'
    }).select().single()
    console.log(`   ${ins ? '✓' : '✗'} HHH-user can INSERT lead: ${insErr?.message || 'OK id=' + ins?.id}`)
    if (ins) await ADMIN.from('leads').delete().eq('id', ins.id)

    // Check INSERT into ANOTHER company is blocked
    const { error: bad } = await u.from('leads').insert({ company_id: 4, customer_name: 'CROSS-TENANT INSERT', status: 'New' }).select()
    console.log(`   ${bad ? '✓' : '✗'} HHH-user can NOT insert into company 4: ${bad?.message || 'WROTE — BAD'}`)
  } finally {
    if (eid) await ADMIN.from('employees').delete().eq('id', eid)
    if (aid) await ADMIN.auth.admin.deleteUser(aid)
  }
})()
