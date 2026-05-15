require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('plaid_transactions').select('id,date,amount,name,merchant_name,plaid_category,plaid_transaction_id,is_transfer,pending').eq('company_id', 3).like('plaid_transaction_id', 'stripe_%').order('date', { ascending: false }).limit(20)
  console.log(`stripe_-prefixed transactions: ${r.data?.length || 0}`)
  for (const t of r.data || []) {
    console.log(`  ${t.date} ${t.amount}  "${t.name}"  pending=${t.pending}  cat=${JSON.stringify(t.plaid_category)}`)
  }

  // bank_accounts
  const ba = await s.from('bank_accounts').select('id,name,provider,current_balance,available_balance,pending_balance,last_synced').eq('company_id', 3)
  console.log(`\nbank_accounts: ${ba.data?.length || 0}`)
  for (const b of ba.data || []) console.log(`  ${b.name}  provider=${b.provider}  current=${b.current_balance}  avail=${b.available_balance}  pending=${b.pending_balance}  synced=${b.last_synced?.slice(0,16)}`)
})()
