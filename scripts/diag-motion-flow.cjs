require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const inv = (await s.from('invoices').select('*').eq('id', 30278).single()).data
  console.log('Invoice 30278:')
  console.log({
    invoice_id: inv?.invoice_id,
    customer_id: inv?.customer_id,
    amount: inv?.amount,
    discount_applied: inv?.discount_applied,
    credit_card_fee: inv?.credit_card_fee,
    payment_status: inv?.payment_status,
    parent_invoice_id: inv?.parent_invoice_id,
    invoice_type: inv?.invoice_type,
  })

  const pmts = await s.from('payments').select('id,amount,payment_method,date,status').eq('invoice_id', 30278).order('date')
  console.log(`\n${pmts.data?.length || 0} payments:`)
  for (const p of (pmts.data || [])) console.log(`  ${p.date} $${p.amount} ${p.payment_method} ${p.status}`)

  const plans = await s.from('payment_plans').select('*').eq('invoice_id', 30278)
  console.log(`\n${plans.data?.length || 0} payment_plans`)
  for (const p of (plans.data || [])) console.log(JSON.stringify(p, null, 2))
})()
