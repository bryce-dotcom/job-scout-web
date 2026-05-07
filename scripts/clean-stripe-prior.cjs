require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Delete any prior Stripe inserts that landed without dedupe keys
  const { count, error } = await s.from('plaid_transactions').delete({ count: 'exact' })
    .eq('company_id', 3)
    .eq('merchant_name', 'Stripe')
    .is('plaid_transaction_id', null)
  if (error) console.error(error)
  console.log('Deleted prior unkey-ed Stripe rows:', count)
})()
