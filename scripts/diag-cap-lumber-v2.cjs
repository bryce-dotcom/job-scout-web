require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Try quote_lines (the actual table name per QuoteDetail.jsx)
  const ql = await s.from('quote_lines').select('*').eq('quote_id', 2723)
  console.log(`quote_lines on quote 2723: ${ql.data?.length || 0}`)
  for (const l of (ql.data || [])) console.log(`  - ${JSON.stringify(l).slice(0,200)}`)

  // The Cole one — lead 3688
  const leadQ = await s.from('quotes').select('id,quote_id,summary,notes,quote_amount,status,job_id').eq('lead_id', 3688)
  console.log('\nQuotes for lead 3688:')
  console.log(JSON.stringify(leadQ.data, null, 2))

  // For each of those quotes, see if it has lines
  for (const q of (leadQ.data || [])) {
    const lines = await s.from('quote_lines').select('id,description,total').eq('quote_id', q.id)
    console.log(`\nQuote ${q.quote_id} (id=${q.id}) lines: ${lines.data?.length || 0}`)
  }

  // Schema check — what table holds line items for a quote?
  console.log('\n--- Trying to insert/inspect schema for sample columns')
  const cols = await s.from('quote_lines').select('*').limit(1)
  console.log(JSON.stringify(cols.data?.[0], null, 2))
})()
