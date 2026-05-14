require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const inv = (await s.from('invoices').select('*').eq('id', 32438).single()).data
  console.log(JSON.stringify(inv, null, 2))

  // Maybe a line items / invoice_lines table that sums to a different total
  for (const t of ['invoice_lines', 'invoice_line_items']) {
    const r = await s.from(t).select('*').eq('invoice_id', 32438)
    if (r.error) console.log(`${t}: ${r.error.message}`)
    else console.log(`${t}: ${r.data?.length}`)
  }
})()
