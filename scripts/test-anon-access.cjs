// Direct test of anon-role access. Bypass any other env contamination.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

console.log('SUPABASE_URL:', process.env.VITE_SUPABASE_URL)
console.log('ANON_KEY length:', process.env.VITE_SUPABASE_ANON_KEY?.length)
console.log('ANON_KEY first 30:', process.env.VITE_SUPABASE_ANON_KEY?.slice(0, 30))
console.log('SERVICE_KEY first 30:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 30))

const anon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

;(async () => {
  // Try to actually fetch rows
  const { data, error, status, count } = await anon
    .from('customers')
    .select('id, name', { count: 'exact' })
    .limit(2)
  console.log('\nResult:')
  console.log('  status:', status)
  console.log('  error:', error?.code, error?.message)
  console.log('  count:', count)
  console.log('  rows returned:', data?.length)
  console.log('  first 2:', data?.slice(0, 2))
})()
