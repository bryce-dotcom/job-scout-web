require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN = createClient(URL, SERVICE)
;(async () => {
  for (const t of ['invoices','payments','lead_payments']) {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { count: a } = await anon.from(t).select('*', { count: 'exact', head: true })
    const { count: s } = await ADMIN.from(t).select('*', { count: 'exact', head: true })
    console.log(`${t}: anon=${a === null ? 'denied' : a} | service=${s}`)
  }

  const TEST_EMAIL = `rls-3e-${Date.now()}@hhh.services`
  const TEST_PASS = 'D_' + Math.random().toString(36).slice(2, 10)
  let aid = null, eid = null
  try {
    const { data: au } = await ADMIN.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASS, email_confirm: true })
    aid = au.user.id
    const { data: emp } = await ADMIN.from('employees').insert({ company_id: 3, name: 'RLS 3e', email: TEST_EMAIL, role: 'Admin', user_role: 'Admin', active: true }).select().single()
    eid = emp.id
    const u = createClient(URL, ANON, { auth: { persistSession: false } })
    await u.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS })
    for (const t of ['invoices','payments','lead_payments']) {
      const { count } = await u.from(t).select('*', { count: 'exact', head: true })
      const { count: cross } = await u.from(t).select('*', { count: 'exact', head: true }).neq('company_id', 3)
      console.log(`HHH user ${t}: ${count} own, ${cross} cross-tenant`)
    }
  } finally {
    if (eid) await ADMIN.from('employees').delete().eq('id', eid)
    if (aid) await ADMIN.auth.admin.deleteUser(aid)
  }
})()
