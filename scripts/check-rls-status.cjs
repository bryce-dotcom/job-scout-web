// Direct check of RLS state via pg_class
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Get RLS status for our tables
  const { data, error } = await s.rpc('get_rls_status')
  if (error) {
    // No such function — try a raw SQL via supabase-js
    console.log('No RPC; trying direct table introspection...')
    const tables = ['customers', 'leads', 'jobs', 'employees', 'companies', 'beta_invite_codes']
    for (const t of tables) {
      // Use the rest API directly to get pg_class info via PostgREST
      const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql`
      // We don't have exec_sql; use the supabase-js raw query if possible
    }
    return
  }
  console.table(data)
})()
