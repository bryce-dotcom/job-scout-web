require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const tables = ['customers', 'leads', 'jobs', 'employees', 'companies', 'beta_invite_codes', 'feedback']
  console.log('Table              | RLS on | Forced | Policies')
  console.log('-------------------+--------+--------+---------')
  for (const t of tables) {
    const { data } = await s.rpc('check_rls_state', { target_table: t })
    const r = data?.[0]
    if (r) {
      console.log(`${t.padEnd(18)} | ${String(r.rls_enabled).padEnd(6)} | ${String(r.rls_forced).padEnd(6)} | ${r.policy_count}`)
    }
  }
})()
