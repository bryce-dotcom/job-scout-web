require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('companies').select('id, company_name, subscription_tier, billing_status, trial_ends_at, billing_notes')
  console.table(data.map(c => ({
    id: c.id, name: c.company_name?.slice(0, 30),
    tier: c.subscription_tier, status: c.billing_status,
    trial_ends: c.trial_ends_at ? c.trial_ends_at.split('T')[0] : '—',
    notes: (c.billing_notes || '').slice(-60),
  })))
})()
