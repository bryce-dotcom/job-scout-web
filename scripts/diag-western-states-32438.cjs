require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const inv = (await s.from('invoices').select('*').eq('id', 32438).single()).data
  console.log('Invoice 32438:')
  console.log({
    invoice_id: inv?.invoice_id,
    customer_id: inv?.customer_id,
    job_id: inv?.job_id,
    amount: inv?.amount,
    discount_applied: inv?.discount_applied,
    credit_card_fee: inv?.credit_card_fee,
    payment_status: inv?.payment_status,
    parent_invoice_id: inv?.parent_invoice_id,
    invoice_type: inv?.invoice_type,
  })

  // Customer
  if (inv?.customer_id) {
    const c = (await s.from('customers').select('id,name,business_name').eq('id', inv.customer_id).single()).data
    console.log('\nCustomer:', c)
  }

  // Payments
  const pmts = await s.from('payments').select('id,amount,payment_method,payment_date,status,notes').eq('invoice_id', 32438)
  console.log(`\n${pmts.data?.length || 0} payments on this invoice:`)
  let totalPaid = 0
  for (const p of (pmts.data || [])) {
    totalPaid += Number(p.amount || 0)
    console.log(`  $${p.amount}  ${p.payment_method || ''}  ${(p.payment_date || '').slice(0,10)}  status=${p.status}`)
  }
  console.log(`Total paid: $${totalPaid}`)
  console.log(`Computed balance: $${(inv.amount || 0) - (inv.discount_applied || 0) + (inv.credit_card_fee || 0) - totalPaid}`)

  // Sibling invoices on the same job
  if (inv?.job_id) {
    const sibs = await s.from('invoices').select('id,invoice_id,amount,payment_status').eq('job_id', inv.job_id)
    console.log(`\n${sibs.data?.length || 0} invoices on job ${inv.job_id}:`)
    for (const i of (sibs.data || [])) console.log(`  #${i.id} ${i.invoice_id} $${i.amount} ${i.payment_status}`)
  }
})()
