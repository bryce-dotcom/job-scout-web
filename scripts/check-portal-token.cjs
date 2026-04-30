require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Estimate 4224's portal_token
  const TOKEN = '1abf3607-aae9-44a0-933d-87b62e9b61fa'

  // Check the customer_portal_tokens table
  const { data: rows, error } = await s.from('customer_portal_tokens')
    .select('*')
    .eq('token', TOKEN)
  console.log('customer_portal_tokens for estimate 4224 token:', rows)
  if (error) console.error(error)

  // Also, all tokens for quote 4224
  const { data: byQuote } = await s.from('customer_portal_tokens')
    .select('*')
    .eq('quote_id', 4224)
  console.log('\nAll tokens for quote_id=4224:', byQuote)

  // And let's see the recent expired/active distribution
  const { data: recent } = await s.from('customer_portal_tokens')
    .select('id, token, quote_id, document_type, expires_at, is_revoked, access_count, accessed_at, created_at')
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
  console.log('\nRecent customer_portal_tokens (last 30d):')
  console.table(recent.map(r => ({
    id: r.id, token: r.token?.slice(0, 12) + '...', quote_id: r.quote_id, type: r.document_type,
    expires: r.expires_at?.slice(0, 10),
    is_revoked: r.is_revoked,
    accesses: r.access_count,
    last_access: r.accessed_at?.slice(0, 16),
    created: r.created_at?.slice(0, 10),
  })))
})()
