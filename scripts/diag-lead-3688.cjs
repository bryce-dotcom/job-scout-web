require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const lead = (await s.from('leads').select('*').eq('id', 3688).single()).data
  console.log('Lead 3688:')
  console.log({ id: lead?.id, name: lead?.name, business_name: lead?.business_name, status: lead?.status, salesperson_id: lead?.salesperson_id, customer_id: lead?.customer_id, source: lead?.source, customer_name: lead?.customer_name })

  // Audits / projects on this lead
  const aud = await s.from('lighting_audits').select('id,total_project_cost,total_incentive,customer_id,lead_id,created_at').eq('lead_id', 3688)
  console.log(`\nlighting_audits for lead 3688: ${aud.data?.length || 0}`)
  for (const a of (aud.data || [])) console.log(`  #${a.id} total=$${a.total_project_cost} incentive=$${a.total_incentive} created=${a.created_at?.slice(0,10)}`)

  // Quotes
  const q = await s.from('quotes').select('id,quote_id,quote_amount,status,job_id,audit_id,created_at').eq('lead_id', 3688)
  console.log(`\nquotes for lead 3688: ${q.data?.length || 0}`)
  for (const r of (q.data || [])) console.log(`  #${r.id} ${r.quote_id} $${r.quote_amount} ${r.status} audit=${r.audit_id} created=${r.created_at?.slice(0,10)}`)

  // For each quote, its lines
  for (const r of (q.data || [])) {
    const lines = await s.from('quote_lines').select('id,item_name,quantity,price,line_total').eq('quote_id', r.id)
    console.log(`  Quote ${r.id} quote_lines: ${lines.data?.length || 0}`)
    for (const l of (lines.data || [])) console.log(`    - ${l.item_name} qty=${l.quantity} price=${l.price} total=${l.line_total}`)
  }

  // Audit sections / line items
  for (const a of (aud.data || [])) {
    const sec = await s.from('audit_sections').select('id,name,sort_order').eq('audit_id', a.id)
    console.log(`\nAudit ${a.id} sections: ${sec.data?.length || 0}`)
    const items = await s.from('audit_line_items').select('id,description,quantity,unit_price,total,fixture_type_id').eq('audit_id', a.id)
    console.log(`Audit ${a.id} audit_line_items: ${items.data?.length || 0}`)
    for (const i of (items.data?.slice(0,5) || [])) console.log(`  - ${i.description || i.fixture_type_id} qty=${i.quantity} price=${i.unit_price} total=${i.total}`)
  }
})()
