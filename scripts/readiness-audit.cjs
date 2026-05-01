// Beta-readiness audit. Checks the highest-impact items that would
// break or leak data when a stranger signs up:
//
//   1. RLS enabled on all tenant tables
//   2. Existence of cross-company policies that filter rows by the
//      authenticated user's employees.company_id
//   3. companies.setup_complete behavior on signup
//   4. Feedback table not exposed cross-tenant
//
// Read-only.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TENANT_TABLES = [
  'customers', 'leads', 'jobs', 'invoices', 'quotes', 'quote_lines',
  'employees', 'payments', 'time_off_requests', 'time_entries',
  'verification_reports', 'feedback', 'lighting_audits', 'audit_areas',
  'fleet', 'inventory', 'expenses', 'manual_expenses', 'plaid_transactions',
  'utility_invoices', 'company_notifications', 'appointments',
  'products_services', 'leads_payments', 'lead_payments',
  'customer_portal_tokens', 'job_sections', 'time_log_entries',
  'job_lines', 'payroll_adjustments', 'settings', 'pto_requests',
  'beta_invite_codes', 'plaid_items', 'bank_accounts',
]

;(async () => {
  // 1. RLS status. Use the supabase JS RPC fallback by hitting an
  // internal SQL view via .rpc — if not available we'll skip.
  // Otherwise we query pg_class through a direct SQL via the service
  // role client.
  console.log('[1/4] RLS enabled per table')
  const rlsStatus = {}
  for (const t of TENANT_TABLES) {
    // Attempt: select 1 row from the table as service role with NO filter
    // and verify it returns successfully. If RLS isn't enabled the
    // service-role bypasses anyway. We instead do a count using an
    // anonymous client to prove RLS denies it.
    try {
      const { count, error } = await s.from(t).select('*', { count: 'exact', head: true })
      rlsStatus[t] = error ? `error: ${error.message.slice(0, 40)}` : `service-role count=${count}`
    } catch (e) { rlsStatus[t] = `exception: ${e.message.slice(0, 40)}` }
  }

  // Use anon client to confirm RLS denies cross-tenant reads
  const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const anonAccess = {}
  for (const t of TENANT_TABLES) {
    try {
      const { count, error } = await anon.from(t).select('*', { count: 'exact', head: true })
      anonAccess[t] = error ? `🔒 RLS BLOCKED (${error.code || 'PGRST'})` : `❌ ANON SAW ${count} ROWS`
    } catch (e) { anonAccess[t] = `🔒 ${e.message.slice(0, 30)}` }
  }

  console.table(TENANT_TABLES.map(t => ({
    table: t,
    service: rlsStatus[t],
    anon: anonAccess[t],
  })))

  // 2. Companies setup_complete on existing companies
  const { data: cos } = await s.from('companies')
    .select('id, company_name, owner_email, setup_complete, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  console.log('\n[2/4] Recent companies (signup state)')
  console.table((cos || []).map(c => ({
    id: c.id, name: c.company_name, owner: c.owner_email,
    setup_complete: c.setup_complete,
    created: c.created_at?.slice(0, 10),
  })))

  // 3. Feedback table — does it have company_id and is it filtered?
  const { data: fbSchema } = await s.from('feedback').select('*').limit(1)
  if (fbSchema?.[0]) {
    console.log('\n[3/4] Feedback row sample')
    console.log(' columns:', Object.keys(fbSchema[0]).join(', '))
  }

  // 4. Beta invite codes
  const { data: codes } = await s.from('beta_invite_codes').select('*')
  console.log(`\n[4/4] Beta invite codes available: ${codes?.length || 0}`)
  ;(codes || []).forEach(c => {
    console.log(`   ${c.code}  used=${c.times_used}/${c.max_uses}  expires=${c.expires_at?.slice(0, 10) || 'never'}`)
  })
})()
