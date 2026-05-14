// Diagnose Tracy's saved-card issue. Look at invoice 32432 and any cards
// on the customer.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const inv = (await s.from('invoices').select('*').eq('id', 32432).single()).data
  console.log('Invoice 32432:', { id: inv?.id, invoice_id: inv?.invoice_id, customer_id: inv?.customer_id, amount: inv?.amount, payment_status: inv?.payment_status })

  if (!inv?.customer_id) return
  const c = (await s.from('customers').select('*').eq('id', inv.customer_id).single()).data
  console.log('\nCustomer:', { id: c?.id, name: c?.name, business_name: c?.business_name, stripe_customer_id: c?.stripe_customer_id })

  const cards = await s.from('customer_payment_methods').select('*').eq('customer_id', inv.customer_id)
  console.log(`\n${cards.data?.length || 0} customer_payment_methods rows:`)
  for (const card of (cards.data || [])) {
    console.log(`  #${card.id} ${card.brand} ****${card.last_four} exp=${card.exp_month}/${card.exp_year} status=${card.status} stripe_pm=${card.stripe_payment_method_id}`)
  }

  // Payments for this invoice
  const pmts = await s.from('payments').select('*').eq('invoice_id', 32432)
  console.log(`\n${pmts.data?.length || 0} payments on this invoice:`)
  for (const p of (pmts.data || [])) {
    console.log(`  #${p.id} $${p.amount} ${p.method} ${p.status} ${p.payment_intent_id || p.stripe_payment_intent_id || ''}`)
  }
})()
