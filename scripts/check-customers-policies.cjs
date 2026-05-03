require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Use raw SQL via RPC to check policies
  const { data, error } = await s.rpc('exec_sql', { sql: "SELECT polname, polpermissive, polroles::text, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr FROM pg_policy WHERE polrelid = 'public.customers'::regclass" })
  if (error && error.message.includes('exec_sql')) {
    // Fallback: just describe what we know
    console.log('Cannot introspect via RPC — assuming clean slate.')
    console.log('Will write migration to DROP IF EXISTS first, then create policy.')
  } else {
    console.log('customers policies:', data)
  }
  // Also check if RLS is enabled
  const { data: tbl } = await s.from('information_schema.tables').select('*').eq('table_name','customers').maybeSingle().catch(() => ({ data: null }))
  console.log('customers in information_schema:', tbl ? 'yes' : 'unknown')
})()
