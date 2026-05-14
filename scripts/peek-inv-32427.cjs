require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const inv = (await s.from('invoices').select('*').eq('id', 32427).single()).data
  console.log('Invoice 32427:')
  console.log({
    business_unit: inv?.business_unit,
    customer_id: inv?.customer_id,
    invoice_id: inv?.invoice_id,
    amount: inv?.amount,
    job_id: inv?.job_id,
  })

  // Check the actual PDF body — look at job_description
  if (inv) console.log('\njob_description preview:', (inv.job_description || '').slice(0, 300))

  // Show what business units HHH has (might be on a different table or company.business_units array)
  const co = (await s.from('companies').select('id,business_units,address,remit_to_address').eq('id', 3).single()).data
  console.log('\nHHH:')
  console.log(co)
})()
