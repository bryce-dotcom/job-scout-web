// Live REST check: a User-level employee cannot read a coworker's identity
// (SSN, DOB, home address, bank) or onboarding paperwork; a payroll admin can.
//
//   node scripts/verify-employee-identity-rls.cjs
//
// Creates three throwaway sign-ins in the DEMO company (25, Summit Field Co),
// never company 3, and deletes them (auth users + employees, which cascades
// their employee_identity rows) whatever happens. Exits 1 on any failed check.
// Needs .env with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY. Run after 20261015121000_employee_identity is
// applied. See src/lib/employeeIdentity.js.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const ADMIN = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const COMPANY = 25

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`) }

;(async () => {
  const stamp = Date.now()
  const people = {
    user: { email: `idrls-user-${stamp}@example.test`, user_role: 'User', role: 'Field Tech' },
    peer: { email: `idrls-peer-${stamp}@example.test`, user_role: 'User', role: 'Field Tech' },
    hr:   { email: `idrls-hr-${stamp}@example.test`, user_role: 'Admin', role: 'Office', has_hr_access: true },
  }
  const made = { auth: [], emp: [], pkt: [] }
  try {
    for (const [k, p] of Object.entries(people)) {
      p.password = 'Id_' + Math.random().toString(36).slice(2, 12) + 'A9'
      const { data: au, error: aErr } = await ADMIN.auth.admin.createUser({ email: p.email, password: p.password, email_confirm: true })
      if (aErr) throw new Error('createUser ' + k + ': ' + aErr.message)
      made.auth.push(au.user.id)
      const { data: emp, error: eErr } = await ADMIN.from('employees').insert({
        company_id: COMPANY, name: `IdRLS ${k}`, email: p.email, role: p.role, user_role: p.user_role,
        has_hr_access: !!p.has_hr_access, active: true,
      }).select('id').single()
      if (eErr) throw new Error('employee ' + k + ': ' + eErr.message)
      made.emp.push(emp.id); p.id = emp.id
    }
    // The peer has identity on file, and an onboarding packet.
    const { error: idErr } = await ADMIN.from('employee_identity').upsert({
      employee_id: people.peer.id, company_id: COMPANY, ssn_last4: '6789', home_address: '1 Test Way', home_zip: '84401', dd_account_last4: '4321',
    }, { onConflict: 'employee_id' })
    if (idErr) throw new Error('seed identity: ' + idErr.message)
    const { data: pkt, error: pErr } = await ADMIN.from('employee_onboarding_packets').insert({
      company_id: COMPANY, employee_id: people.peer.id, token: require('crypto').randomUUID(), status: 'in_progress', draft_data: { ssn: { value: '000000000' } },
    }).select('id').single()
    if (pErr) throw new Error('seed packet: ' + pErr.message)
    made.pkt.push(pkt.id)

    const signIn = async (p) => {
      const c = createClient(URL, ANON, { auth: { persistSession: false } })
      const { error } = await c.auth.signInWithPassword({ email: p.email, password: p.password })
      if (error) throw new Error('sign in ' + p.email + ': ' + error.message)
      return c
    }

    // --- User-level employee
    const u = await signIn(people.user)
    const { data: uAll } = await u.from('employee_identity').select('employee_id')
    check('User sees only their own identity row', (uAll || []).length === 1 && uAll[0].employee_id === people.user.id, `rows=${(uAll || []).length}`)
    const { data: uPeer } = await u.from('employee_identity').select('*').eq('employee_id', people.peer.id)
    check('User cannot read a coworker\'s identity', (uPeer || []).length === 0)
    const { data: uPkt } = await u.from('employee_onboarding_packets').select('id, token, draft_data').eq('employee_id', people.peer.id)
    check('User cannot read a coworker\'s onboarding packet (SSN, token)', (uPkt || []).length === 0)
    const { data: uDocs } = await u.from('signed_documents').select('id').neq('employee_id', people.user.id).limit(5)
    check('User cannot read coworkers\' signed documents', (uDocs || []).length === 0)
    const { data: uRoster } = await u.from('employees').select('id, name').eq('id', people.peer.id)
    check('User still sees the coworker on the roster', (uRoster || []).length === 1)
    const { error: uIns } = await u.from('employee_identity').upsert({ employee_id: people.peer.id, company_id: COMPANY, home_zip: '00000' }, { onConflict: 'employee_id' })
    check('User cannot write a coworker\'s identity', !!uIns, uIns?.code || 'no error')
    const { data: after } = await ADMIN.from('employee_identity').select('home_zip').eq('employee_id', people.peer.id).single()
    check('coworker identity unchanged', after?.home_zip === '84401', after?.home_zip)
    const { error: uOwn } = await u.from('employee_identity').update({ home_city: 'Ogden' }).eq('employee_id', people.user.id)
    check('User can update their own identity', !uOwn, uOwn?.message)
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data: aRows } = await anon.from('employee_identity').select('employee_id').limit(1)
    check('signed-out caller reads nothing', !aRows || aRows.length === 0)

    // --- Payroll admin (Admin + HR) in the same company
    const h = await signIn(people.hr)
    const { data: hPeer } = await h.from('employee_identity').select('ssn_last4, home_address').eq('employee_id', people.peer.id)
    check('HR reads the coworker\'s identity', hPeer?.[0]?.ssn_last4 === '6789')
    const { data: hCross } = await h.from('employee_identity').select('employee_id').neq('company_id', COMPANY).limit(1)
    check('HR cannot read another company\'s identity', (hCross || []).length === 0)
    const { data: hPkt } = await h.from('employee_onboarding_packets').select('id').eq('employee_id', people.peer.id)
    check('HR reads the onboarding packet', (hPkt || []).length === 1)
  } catch (e) {
    check('setup', false, e.message)
  } finally {
    for (const id of made.pkt) await ADMIN.from('employee_onboarding_packets').delete().eq('id', id)
    for (const id of made.emp) await ADMIN.from('employees').delete().eq('id', id)
    for (const id of made.auth) await ADMIN.auth.admin.deleteUser(id)
    const { count } = await ADMIN.from('employees').select('id', { count: 'exact', head: true }).like('email', `idrls-%-${stamp}@example.test`)
    console.log(`cleanup: ${count || 0} test employees left`)
  }
  const failed = results.filter(r => !r).length
  console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} passed`)
  process.exit(failed ? 1 : 0)
})()
