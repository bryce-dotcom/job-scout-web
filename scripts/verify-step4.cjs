require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const REVOKED = [
  'appointments','bookings','routes',
  'time_off_requests','time_log','time_clock',
  'verification_reports','verification_photos',
  'expenses','manual_expenses','expense_categories',
  'utility_invoices','incentives','bank_accounts','liabilities','customer_payment_methods',
  'payroll_runs','paystubs','lead_commissions','setter_commissions','labor_rates',
  'communications_log','audit_log','deal_activities','company_notifications',
  'ai_messages','ai_sessions',
  'document_packages','custom_forms',
  'inventory','fleet','fleet_maintenance','fleet_rentals','assets',
  'lighting_audits','audit_areas',
  'products_services','product_groups',
  'reports','saved_queries','search_index','sync_log','webhook_form','feedback'
]

const KEEP_OPEN = [
  'companies','employees','agents','ai_modules','settings','helpers','company_agents',
  'utility_providers','utility_programs','prescriptive_measures'
]

;(async () => {
  const ADMIN = createClient(URL, SERVICE)
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })

  console.log('=== TABLES THAT SHOULD BE REVOKED FROM ANON ===')
  let leaks = 0
  for (const t of REVOKED) {
    const { count, error } = await anon.from(t).select('*', { count: 'exact', head: true })
    const blocked = error || count === null || count === 0
    if (!blocked) {
      console.log(`  ✗ LEAK: ${t} — anon sees ${count} rows`)
      leaks++
    }
  }
  console.log(`  ${leaks === 0 ? '✓ All revoked tables are inaccessible to anon' : `✗ ${leaks} tables still leak`}`)

  console.log('\n=== TABLES THAT SHOULD STAY OPEN TO ANON ===')
  let broken = 0
  for (const t of KEEP_OPEN) {
    const { count, error } = await anon.from(t).select('*', { count: 'exact', head: true })
    if (error && !error.message.includes('permission')) {
      console.log(`  ! ${t}: ${error.message}`)
    } else if (count === null || error?.message?.includes('permission')) {
      console.log(`  ✗ BROKE: ${t} is now blocked from anon (was supposed to stay open)`)
      broken++
    } else {
      console.log(`  ✓ ${t}: anon sees ${count} rows (kept open as intended)`)
    }
  }
  if (broken > 0) console.log(`\n  ✗ ${broken} tables that should stay open are now blocked`)

  console.log('\n=== AUTHENTICATED USER STILL SEES THEIR DATA ===')
  const TEST_EMAIL = `step4-${Date.now()}@hhh.services`
  const TEST_PASS = 'D_' + Math.random().toString(36).slice(2, 10)
  let aid = null, eid = null
  try {
    const { data: au } = await ADMIN.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASS, email_confirm: true })
    aid = au.user.id
    const { data: emp } = await ADMIN.from('employees').insert({ company_id: 3, name: 'Step 4', email: TEST_EMAIL, role: 'Admin', user_role: 'Admin', active: true }).select().single()
    eid = emp.id
    const u = createClient(URL, ANON, { auth: { persistSession: false } })
    await u.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS })
    let authBroken = 0
    for (const t of REVOKED.slice(0, 8)) {
      const { count, error } = await u.from(t).select('*', { count: 'exact', head: true })
      if (error) { console.log(`  ✗ AUTH BROKE on ${t}: ${error.message}`); authBroken++ }
      else console.log(`  ✓ ${t}: authenticated user sees ${count} rows`)
    }
    if (authBroken > 0) console.log(`\n  ${authBroken} tables broke for authenticated users — must add GRANT to authenticated role`)
  } finally {
    if (eid) await ADMIN.from('employees').delete().eq('id', eid)
    if (aid) await ADMIN.auth.admin.deleteUser(aid)
  }
})()
