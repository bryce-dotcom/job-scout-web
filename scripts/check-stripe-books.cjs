require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data: ba } = await s.from('bank_accounts').select('*').eq('company_id', 3).eq('provider', 'stripe')
  console.log('Stripe bank_account row:')
  console.table(ba.map(b => ({
    name: b.name, current: b.current_balance, available: b.available_balance,
    pending: b.pending_balance, last_synced: b.last_synced?.slice(0, 19),
  })))
  const { data: tx } = await s.from('plaid_transactions').select('date, amount, name, source_id').eq('company_id', 3).eq('source_system', 'stripe').order('date', { ascending: false }).limit(10)
  console.log('\nLast 10 Stripe payouts imported as Books transactions:')
  console.table(tx)
})()
