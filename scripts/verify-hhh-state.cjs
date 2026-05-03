// Quick automated check that HHH's data is intact and accessible
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const checks = [
    ['HHH company exists', async () => {
      const { data } = await s.from('companies').select('id, company_name').eq('id', 3).maybeSingle()
      return data ? `OK (${data.company_name})` : 'MISSING'
    }],
    ['HHH employees count', async () => {
      const { count } = await s.from('employees').select('*', { count: 'exact', head: true }).eq('company_id', 3).eq('active', true)
      return count > 0 ? `OK (${count} active)` : 'NONE'
    }],
    ['HHH AI agents enabled', async () => {
      const { count } = await s.from('company_agents').select('*', { count: 'exact', head: true }).eq('company_id', 3)
      return count >= 7 ? `OK (${count} agents)` : `LOW (${count})`
    }],
    ['HHH customers', async () => {
      const { count } = await s.from('customers').select('*', { count: 'exact', head: true }).eq('company_id', 3)
      return count > 0 ? `OK (${count})` : 'NONE'
    }],
    ['HHH jobs', async () => {
      const { count } = await s.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', 3)
      return count > 0 ? `OK (${count})` : 'NONE'
    }],
    ['Beta invite codes ready', async () => {
      const { data } = await s.from('beta_invite_codes').select('code, max_uses, times_used')
      const ready = (data || []).filter(c => c.times_used < c.max_uses)
      return ready.length > 0 ? `OK (${ready.length} codes)` : 'NONE'
    }],
    ['RLS state (should be OFF after revert)', async () => {
      // anon-key test: should still see data because RLS is off
      const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
      const { count, error } = await anon.from('customers').select('*', { count: 'exact', head: true })
      return error ? `ERR ${error.message}` : count > 100 ? `OPEN (anon sees ${count} rows — expected post-revert)` : 'LOCKED?'
    }],
  ]

  for (const [name, fn] of checks) {
    try {
      const r = await fn()
      console.log(`  ${r.startsWith('OK') || r.startsWith('OPEN') ? '✓' : '✗'} ${name}: ${r}`)
    } catch (e) { console.log(`  ✗ ${name}: ERROR ${e.message}`) }
  }
})()
