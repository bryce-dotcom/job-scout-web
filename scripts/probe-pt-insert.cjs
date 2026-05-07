require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data, error } = await s.from('plaid_transactions').insert({
    company_id: 3,
    plaid_transaction_id: 'stripe_test_' + Date.now(),
    amount: -100,
    date: '2026-05-07',
    authorized_date: '2026-05-07',
    name: 'Stripe Payout',
    merchant_name: 'Stripe',
    plaid_category: 'Stripe Payout',
    is_transfer: true,
    pending: false,
    notes: 'probe',
  }).select()
  console.log('insert error:', error)
  console.log('insert data:', data)
  // Cleanup
  if (data?.[0]) await s.from('plaid_transactions').delete().eq('id', data[0].id)
})()
