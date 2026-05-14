require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Pull item name + description from the SAME quote (2723) for item 1381
  const ql = (await s.from('quote_lines').select('item_name,description,item_id').eq('quote_id', 2723).eq('item_id', 1381).limit(1)).data?.[0]
  console.log('Source quote_line from quote 2723 for item 1381:', ql)
  const item = { name: ql?.item_name, description: ql?.description }
  if (!item.name) { console.log('No source name found in quote 2723'); return }

  const jl = await s.from('job_lines').select('id,item_id,item_name,description').eq('job_id', 23272).is('item_name', null)
  console.log(`\n${jl.data?.length || 0} unnamed job_lines on job 23272 to fix`)

  for (const l of (jl.data || [])) {
    if (l.item_id !== 1381) continue
    await s.from('job_lines').update({ item_name: item.name, description: item.description }).eq('id', l.id)
    console.log(`  ✓ Updated line ${l.id} → "${item.name}"`)
  }

  // Also link the quote's customer back if missing. The lead behind quote 2723 might have a customer.
  const q = (await s.from('quotes').select('id,lead_id,customer_id').eq('id', 2723).single()).data
  console.log('\nQuote 2723:', q)
  if (!q.customer_id && q.lead_id) {
    const lead = (await s.from('leads').select('customer_id,name,business_name').eq('id', q.lead_id).single()).data
    console.log('Lead 89:', lead)
    if (lead?.customer_id) {
      await s.from('quotes').update({ customer_id: lead.customer_id }).eq('id', q.id)
      await s.from('jobs').update({ customer_id: lead.customer_id }).eq('id', 23272)
      console.log(`  ✓ Linked customer ${lead.customer_id} to quote 2723 + job 23272`)
    } else {
      console.log('  (lead 89 has no customer_id)')
    }
  }
})()
