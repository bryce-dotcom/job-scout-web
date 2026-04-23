// Reproduce exactly what CustomerDetail.jsx fetches
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // CustomerDetail.jsx line 100-102: .select('*, quote_lines(*)')
  const { data, error } = await sb.from('quotes').select('*, quote_lines(*)').eq('company_id', 5).eq('customer_id', 7604)
  console.log('error:', error?.message)
  console.log('quotes returned:', data?.length)
  for (const q of data || []) {
    console.log('\n  quote', q.id, q.quote_id, '$' + q.quote_amount, 'status:', q.status)
    console.log('    quote_lines via FK join:', q.quote_lines?.length || 0)
    for (const l of (q.quote_lines || []).slice(0, 3)) {
      console.log('      ·', l.item_name, '| desc:', (l.description||'').slice(0,60))
    }
  }
  // Cross-check: direct quote_lines query
  console.log('\n--- direct quote_lines query ---')
  const qIds = (data||[]).map(q => q.id)
  const { data: lines } = await sb.from('quote_lines').select('quote_id,item_name,description').in('quote_id', qIds)
  console.log('direct returned:', lines?.length)
})()
