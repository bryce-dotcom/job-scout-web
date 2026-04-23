// One-shot cleanup for the 200 invoices that got mis-attributed
// to customer 7604 (Skaggs/Juan Diego) by the first run of
// hcp_import_one_customer.cjs before we discovered HCP /invoices
// doesn't honor customer_id filter. Safe to run more than once;
// matches only HCP-source invoices on customer 7604.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data: cust } = await sb.from('customers').select('id').eq('company_id',5)
    .eq('source_system','hcp').eq('source_id','cus_43f1c66fbbbc4c3788639b9e37261592').single()
  console.log('cust:', cust?.id)
  // Delete payments first (FK)
  const { count: pCount } = await sb.from('payments').delete({ count: 'exact' })
    .eq('company_id',5).eq('source_system','hcp').eq('customer_id',cust.id)
  console.log('deleted payments:', pCount)
  const { count: iCount } = await sb.from('invoices').delete({ count: 'exact' })
    .eq('company_id',5).eq('source_system','hcp').eq('customer_id',cust.id)
  console.log('deleted invoices:', iCount)
})()
