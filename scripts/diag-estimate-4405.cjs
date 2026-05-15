require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const e = (await s.from('quotes').select('*').eq('id', 4405).single()).data
  console.log('Estimate 4405:')
  console.log({ id: e?.id, lead_id: e?.lead_id, audit_id: e?.audit_id, quote_amount: e?.quote_amount, utility_incentive: e?.utility_incentive, summary: e?.summary?.slice(0,80) })

  if (e?.audit_id) {
    const a = (await s.from('lighting_audits').select('*').eq('id', e.audit_id).single()).data
    console.log('\nAudit:')
    console.log({ id: a?.id, annual_savings_kwh: a?.annual_savings_kwh, annual_savings_dollars: a?.annual_savings_dollars, estimated_rebate: a?.estimated_rebate, total_existing_watts: a?.total_existing_watts, total_proposed_watts: a?.total_proposed_watts })

    if (a?.notes) {
      try {
        const pd = JSON.parse(a.notes)
        console.log('\nfinancials from notes:')
        console.log(JSON.stringify(pd?.financials || {}, null, 2))
      } catch {}
    }
  }
})()
