// Spin up a brand-new tenant via the beta-signup edge function
// (exactly like a real user signing up), then verify they see ONLY
// their own data — never HHH's. Cleans up after itself.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN = createClient(URL, SERVICE)

const TENANT_EMAIL = `step6-test-${Date.now()}@example.com`
const TENANT_PASS = 'Step6_' + Math.random().toString(36).slice(2, 10) + '!'
const TENANT_COMPANY = `Step6 Test Tenant ${Date.now()}`
const INVITE_CODE = 'JOBSCOUT-BETA-2026'

;(async () => {
  console.log(`Signing up ${TENANT_EMAIL} at ${TENANT_COMPANY}...`)

  // Try with ToS NOT accepted — should fail
  console.log('\n--- ToS-acceptance gate ---')
  const guard = await fetch(`${URL}/functions/v1/beta-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ email: TENANT_EMAIL, password: TENANT_PASS, companyName: TENANT_COMPANY, inviteCode: INVITE_CODE })
  })
  const guardJson = await guard.json()
  console.log(`  ${guard.status === 400 && guardJson.error?.includes('Terms') ? '✓' : '✗'} signup without ToS: status=${guard.status}, error=${guardJson.error}`)

  // Now do real signup with ToS
  console.log('\n--- Real signup with ToS ---')
  const signup = await fetch(`${URL}/functions/v1/beta-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      email: TENANT_EMAIL, password: TENANT_PASS, companyName: TENANT_COMPANY,
      inviteCode: INVITE_CODE, tosAccepted: true, tosVersion: 'v1-2026-05-07',
    })
  })
  const signupJson = await signup.json()
  console.log(`  status=${signup.status}, body=${JSON.stringify(signupJson)}`)
  if (!signupJson.success) {
    console.log('  ✗ signup failed; aborting')
    return
  }
  const { companyId, employeeId } = signupJson
  console.log(`  ✓ tenant created: company=${companyId}, employee=${employeeId}`)

  // Confirm ToS columns are set
  const { data: co } = await ADMIN.from('companies').select('id, company_name, tos_accepted_at, tos_version, tos_accepted_ip').eq('id', companyId).single()
  console.log(`  ✓ tos_accepted_at: ${co.tos_accepted_at ? 'set' : 'MISSING'}`)
  console.log(`  ✓ tos_version: ${co.tos_version}`)

  // Sign in as the new tenant
  console.log('\n--- Tenant-isolation checks (signed in as new tenant) ---')
  const u = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: signErr } = await u.auth.signInWithPassword({ email: TENANT_EMAIL, password: TENANT_PASS })
  if (signErr) { console.log('sign-in error:', signErr.message); return }

  const tables = ['customers','leads','quotes','quote_lines','jobs','job_lines','job_sections','invoices','payments','lead_payments']
  let leakage = 0
  for (const t of tables) {
    const { count: own } = await u.from(t).select('*', { count: 'exact', head: true })
    const { count: hhh } = await u.from(t).select('*', { count: 'exact', head: true }).eq('company_id', 3)
    const ok = (own === 0 || own !== null) && hhh === 0
    if (!ok) leakage++
    console.log(`  ${ok ? '✓' : '✗'} ${t}: own=${own}, HHH-visible=${hhh}`)
  }
  if (leakage > 0) console.log(`\n✗ ${leakage} tables leaked HHH data to the new tenant`)
  else console.log(`\n✓ Tenant sees ZERO HHH data across all 10 RLS-locked tables`)

  // Verify the new tenant has its sample seeded data via service-role
  const { count: seedC } = await ADMIN.from('customers').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
  const { count: seedJ } = await ADMIN.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
  console.log(`\n  Sample data seeded into new tenant: ${seedC} customers, ${seedJ} jobs`)

  // Tenant can see their own seeded data
  const { count: ownVisibleC } = await u.from('customers').select('*', { count: 'exact', head: true })
  console.log(`  Tenant can see own data: ${ownVisibleC} customers visible (expected: ${seedC})`)

  // Cleanup
  console.log('\n--- Cleanup ---')
  // Delete tenant data
  const tenantTables = ['quote_lines','quotes','job_lines','job_sections','jobs','lead_payments','payments','invoices','customers','leads','employees','company_agents']
  for (const t of tenantTables) await ADMIN.from(t).delete().eq('company_id', companyId)
  await ADMIN.from('settings').delete().eq('company_id', companyId)
  await ADMIN.from('companies').delete().eq('id', companyId)
  // Delete auth user
  const { data: list } = await ADMIN.auth.admin.listUsers({ page: 1, perPage: 200 })
  const u2 = list?.users?.find(x => x.email === TENANT_EMAIL)
  if (u2) await ADMIN.auth.admin.deleteUser(u2.id)
  // Decrement invite code usage
  const { data: code } = await ADMIN.from('beta_invite_codes').select('*').eq('code', INVITE_CODE).single()
  if (code) await ADMIN.from('beta_invite_codes').update({ times_used: Math.max(0, code.times_used - 1) }).eq('id', code.id)
  console.log('  cleanup complete')
})()
