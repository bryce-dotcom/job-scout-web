require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN = createClient(URL, SERVICE)

;(async () => {
  for (const table of ['quotes', 'quote_lines']) {
    console.log(`\n===== ${table} =====`)
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { count: a } = await anon.from(table).select('*', { count: 'exact', head: true })
    console.log(`  anon sees: ${a === null ? 'denied' : a + ' rows'}`)
    const { count: s } = await ADMIN.from(table).select('*', { count: 'exact', head: true })
    console.log(`  service sees: ${s} rows`)
  }

  const TEST_EMAIL = `rls-3c-${Date.now()}@hhh.services`
  const TEST_PASS = 'D_' + Math.random().toString(36).slice(2, 10)
  let aid = null, eid = null
  try {
    const { data: au } = await ADMIN.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASS, email_confirm: true })
    aid = au.user.id
    const { data: emp } = await ADMIN.from('employees').insert({ company_id: 3, name: 'RLS 3c', email: TEST_EMAIL, role: 'Sales', user_role: 'User', active: true }).select().single()
    eid = emp.id
    const u = createClient(URL, ANON, { auth: { persistSession: false } })
    await u.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS })
    const { count: q } = await u.from('quotes').select('*', { count: 'exact', head: true })
    const { count: ql } = await u.from('quote_lines').select('*', { count: 'exact', head: true })
    const { count: qNotHHH } = await u.from('quotes').select('*', { count: 'exact', head: true }).neq('company_id', 3)
    console.log(`\n  HHH user: ${q} quotes, ${ql} quote_lines (cross-tenant: ${qNotHHH})`)
  } finally {
    if (eid) await ADMIN.from('employees').delete().eq('id', eid)
    if (aid) await ADMIN.auth.admin.deleteUser(aid)
  }
})()
