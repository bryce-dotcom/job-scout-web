require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r = await s.from('invoices').select('*').eq('id', 32470).single()
  console.log('Sample row:')
  console.log(JSON.stringify(r.data, null, 2))

  // Are there line items?
  const li = await s.from('invoice_line_items').select('id,description,total').eq('invoice_id', 32470).limit(5)
  console.log('\nLine items on #32470:'); console.log(JSON.stringify(li, null, 2))

  // Any payments?
  const pmt = await s.from('payments').select('id,amount,status').eq('invoice_id', 32470)
  console.log('\nPayments on #32470:'); console.log(JSON.stringify(pmt, null, 2))
})()
