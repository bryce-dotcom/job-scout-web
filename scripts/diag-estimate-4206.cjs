require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const e = (await s.from('quotes').select('*').eq('id', 4206).single()).data
  console.log('Estimate 4206:')
  console.log({ id: e?.id, quote_id: e?.quote_id, estimate_name: e?.estimate_name, audit_id: e?.audit_id, lead_id: e?.lead_id, quote_amount: e?.quote_amount, utility_incentive: e?.utility_incentive, created_at: e?.created_at?.slice(0,16), updated_at: e?.updated_at?.slice(0,16) })

  const lines = await s.from('quote_lines').select('id,item_name,quantity,price,line_total,updated_at').eq('quote_id', 4206).order('id')
  console.log(`\n${lines.data?.length || 0} quote_lines (sums to $${(lines.data||[]).reduce((s,l)=>s+(l.line_total||0),0).toFixed(2)}):`)
  for (const l of (lines.data || [])) console.log(`  #${l.id} ${l.item_name} qty=${l.quantity} price=${l.price} total=${l.line_total} updated=${l.updated_at?.slice(0,16)}`)

  if (e?.audit_id) {
    const a = (await s.from('lighting_audits').select('id,est_project_cost,estimated_rebate,updated_at').eq('id', e.audit_id).single()).data
    console.log('\nAudit:', a)
  }
})()
