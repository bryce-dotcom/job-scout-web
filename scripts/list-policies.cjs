require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  for (const t of ['customers', 'leads', 'jobs']) {
    const { data } = await s.rpc('list_policies', { target_table: t })
    console.log(`\n=== ${t} ===`)
    ;(data || []).forEach(p => {
      console.log(`  ${p.policy_name}  ${p.cmd}  roles=${p.roles?.join(',')}`)
      console.log(`    USING: ${p.qual}`)
      if (p.with_check) console.log(`    CHECK: ${p.with_check}`)
    })
  }
})()
