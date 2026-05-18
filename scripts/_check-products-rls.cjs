require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const sql = `
    SELECT tablename, policyname, cmd, qual::text, with_check::text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products_services'
    ORDER BY policyname
  `
  // Use a raw call via the pg admin endpoint
  const r = await fetch(process.env.VITE_SUPABASE_URL + '/rest/v1/rpc/sql_admin', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  }).catch(e => ({ ok: false, error: e.message }))
  if (!r.ok) {
    console.log('No RPC sql_admin. Trying direct query via raw API...')
    // Plan B: use information_schema via supabase-js
    const ts = await s.from('information_schema.table_constraints').select('*').limit(0)
    console.log('Cannot query pg_policies directly. Will inspect by attempting an unprivileged write.')
    return
  }
  console.log(await r.text())
})()
