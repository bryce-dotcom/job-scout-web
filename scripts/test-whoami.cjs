// Calls whoami() three ways:
// 1. As anon (no JWT) -> should return jwt_email=null, empty company_ids
// 2. As Bryce (signed in) -> should resolve to company_id=3
// 3. As another HHH employee (signed in) -> should also resolve to 3
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const ADMIN = createClient(URL, SERVICE)

async function callAsUser(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: signin, error: signErr } = await c.auth.signInWithPassword({ email, password })
  if (signErr) return { error: 'sign-in failed: ' + signErr.message }
  const { data, error } = await c.rpc('whoami')
  if (error) return { error: error.message }
  return data
}

;(async () => {
  console.log('=== 1. Anon call (no JWT) ===')
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: anonR, error: anonE } = await anon.rpc('whoami')
  console.log(anonE ? 'ERR: ' + anonE.message : JSON.stringify(anonR, null, 2))

  console.log('\n=== 2. Service-role call (no JWT context) ===')
  const { data: svcR } = await ADMIN.rpc('whoami')
  console.log(JSON.stringify(svcR, null, 2))

  console.log('\nTo test as a real user, run:')
  console.log('  node scripts/test-whoami.cjs <email> <password>')
  if (process.argv[2] && process.argv[3]) {
    console.log(`\n=== 3. Authenticated call as ${process.argv[2]} ===`)
    const r = await callAsUser(process.argv[2], process.argv[3])
    console.log(JSON.stringify(r, null, 2))
  }
})()
