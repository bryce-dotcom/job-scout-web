require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const e = (await s.from('quotes').select('*').eq('id', 4418).single()).data
  console.log('Estimate 4418:')
  console.log({
    id: e?.id, quote_id: e?.quote_id, lead_id: e?.lead_id, customer_id: e?.customer_id, audit_id: e?.audit_id,
    quote_amount: e?.quote_amount, utility_incentive: e?.utility_incentive, status: e?.status,
    estimate_name: e?.estimate_name, salesperson_id: e?.salesperson_id, business_unit: e?.business_unit,
    job_id: e?.job_id, created_at: e?.created_at,
  })

  // Lines on this quote
  const lines = await s.from('quote_lines').select('id,item_id,item_name,description,quantity,price,line_total').eq('quote_id', 4418)
  console.log(`\nquote_lines: ${lines.data?.length || 0}`)
  for (const l of (lines.data || []).slice(0, 10)) console.log(`  - ${l.item_name || ''}  qty=${l.quantity}  price=${l.price}  total=${l.line_total}`)

  // If there's an audit, its line items
  if (e?.audit_id) {
    const a = (await s.from('lighting_audits').select('id,project_name,total_project_cost,total_incentive').eq('id', e.audit_id).single()).data
    console.log('\nLighting audit:', a)
    const ali = await s.from('audit_line_items').select('id,description,quantity,unit_price,total,fixture_type_id').eq('audit_id', e.audit_id)
    console.log(`audit_line_items: ${ali.data?.length || 0}`)
    for (const l of (ali.data || []).slice(0, 10)) console.log(`  - desc="${l.description}" fixture=${l.fixture_type_id} qty=${l.quantity} price=${l.unit_price} total=${l.total}`)
  } else {
    console.log('\n(no audit_id on quote)')
    // Maybe there's an audit for this lead/customer
    if (e?.lead_id) {
      const aud = await s.from('lighting_audits').select('id,project_name,lead_id,customer_id').eq('lead_id', e.lead_id)
      console.log(`Audits for lead ${e.lead_id}: ${aud.data?.length || 0}`)
      for (const a of (aud.data || [])) console.log(`  #${a.id} ${a.project_name}`)
    }
  }
})()
