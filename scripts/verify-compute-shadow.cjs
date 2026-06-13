// One-shot verification of the compute wallet Phase 0 deploy.
//
// Creates the temp UI-test user (company 3), makes one real ai-map-columns
// call with that user's JWT, then confirms the shadow metering landed:
//   - ai_usage row (wrapper metering, company attributed via JWT fallback)
//   - compute_ledger row with type='shadow' (Phase 0 wallet metering)
// Cleans the temp user up afterwards either way.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const URL = process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const admin = createClient(URL, SERVICE)
const EMAIL = 'zz-ui-test-temp@hhh.services'
const PASS = 'UiTest!' + Math.random().toString(36).slice(2, 10)

async function cleanup() {
  await admin.from('employees').delete().eq('email', EMAIL)
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const found = (list?.users || []).find((x) => x.email === EMAIL)
  if (found) await admin.auth.admin.deleteUser(found.id)
}

;(async () => {
  let failed = false
  try {
    // 1. temp user on company 3 (same pattern as ui-test-user.cjs)
    await cleanup() // in case a previous run left it behind
    const { data: u, error: uErr } = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true })
    if (uErr) throw new Error('auth create failed: ' + uErr.message)
    const { error: eErr } = await admin.from('employees').insert({
      company_id: 3, name: 'ZZ UI Test (temp)', email: EMAIL,
      role: 'Admin', user_role: 'Admin', active: true, is_admin: true,
    })
    if (eErr) throw new Error('employee insert failed: ' + eErr.message)

    // 2. sign in → user JWT
    const userClient = createClient(URL, ANON)
    const { data: sess, error: sErr } = await userClient.auth.signInWithPassword({ email: EMAIL, password: PASS })
    if (sErr) throw new Error('sign-in failed: ' + sErr.message)
    const jwt = sess.session.access_token

    // 3. real AI call: ai-map-columns (haiku, tiny). companyId is null at the
    // call site → wrapper resolves company 3 from this JWT via _shared/auth.ts.
    const t0 = Date.now()
    const res = await fetch(`${URL}/functions/v1/ai-map-columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: ANON },
      body: JSON.stringify({
        headers: ['Item Name', 'Cost Each', 'Sell Price'],
        sampleRows: [['LED Panel 2x4', '42.50', '89.00'], ['Ballast Bypass Tube', '6.10', '14.00']],
      }),
    })
    const fnBody = await res.json().catch(() => ({}))
    console.log(`ai-map-columns -> HTTP ${res.status} in ${Date.now() - t0}ms`, JSON.stringify(fnBody).slice(0, 200))
    if (!res.ok) throw new Error('function call failed')

    // 4. metering rows (give the fire-and-forget writes a moment)
    await new Promise((r) => setTimeout(r, 2500))
    const sinceIso = new Date(t0 - 5000).toISOString()

    const { data: usage } = await admin.from('ai_usage').select('company_id, feature, model, input_tokens, output_tokens, est_cost_usd, success')
      .eq('feature', 'ai-map-columns').gte('created_at', sinceIso).order('id', { ascending: false }).limit(1)
    console.log('ai_usage row:', JSON.stringify(usage))

    const { data: ledger } = await admin.from('compute_ledger').select('company_id, type, feature_slug, agent_slug, model, input_tokens, output_tokens, cost_usd, credits')
      .eq('feature_slug', 'ai-map-columns').gte('ts', sinceIso).order('id', { ascending: false }).limit(1)
    console.log('compute_ledger row:', JSON.stringify(ledger))

    const ok =
      usage?.length === 1 && usage[0].company_id === 3 && usage[0].success === true &&
      ledger?.length === 1 && ledger[0].company_id === 3 && ledger[0].type === 'shadow' &&
      ledger[0].agent_slug === null && ledger[0].credits >= 1
    console.log(ok ? 'VERIFY PASS' : 'VERIFY FAIL')
    failed = !ok
  } catch (e) {
    console.error('VERIFY ERROR:', e.message)
    failed = true
  } finally {
    await cleanup()
    console.log('temp user cleaned up')
    process.exit(failed ? 1 : 0)
  }
})()
