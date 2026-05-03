require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TABLES = [
  'companies','employees','customers','leads','quotes','quote_lines',
  'jobs','job_lines','job_sections','invoices','payments','lead_payments',
  'time_off_requests','time_log_entries','verification_reports',
  'verification_photos','appointments','expenses','utility_invoices',
  'payroll_adjustments','company_agents','agents','feedback','settings',
  'company_notifications','customer_portal_tokens','file_attachments',
  'lighting_audits','audit_areas','fixture_types','utility_providers',
  'utility_programs','rebate_rates','prescriptive_measures',
  'incentives','helpers','products_services','inventory','fleet',
  'fleet_maintenance','fleet_rentals','expense_categories','plaid_transactions',
]

;(async () => {
  const out = { taken_at: new Date().toISOString(), counts: {} }
  for (const t of TABLES) {
    try {
      const { count, error } = await s.from(t).select('*', { count: 'exact', head: true })
      out.counts[t] = error ? `ERR: ${error.message}` : count
    } catch (e) { out.counts[t] = `EXC: ${e.message}` }
  }
  const file = path.join('backups', `snapshot_${process.argv[2] || 'now'}.json`)
  fs.writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`Wrote ${file}`)
  console.log('Total rows across tracked tables:', Object.values(out.counts).reduce((a,b) => typeof b === 'number' ? a + b : a, 0))
})()
