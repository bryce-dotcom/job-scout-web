// Debug who's stuck on job 21004 + their role flags.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  // Active time_clock entries on job 21004
  const { data: tc } = await s.from('time_clock')
    .select('id, employee_id, clock_in, clock_out, job_id, adjusted_by, adjustment_reason')
    .eq('job_id', 21004)
    .is('clock_out', null)
  console.log('Open time entries on job 21004:')
  console.table(tc)

  // The employees on those entries
  const empIds = [...new Set((tc || []).map(t => t.employee_id))]
  if (empIds.length) {
    const { data: emps } = await s.from('employees')
      .select('id, name, email, role, user_role, is_admin, is_developer, has_hr_access')
      .in('id', empIds)
    console.log('\nThose employees:')
    console.table(emps)
  }

  // Also: Bryce, Doug, Tracy (admins) for comparison
  const { data: admins } = await s.from('employees')
    .select('id, name, email, role, user_role, is_admin, is_developer')
    .in('email', ['bryce@hhh.services', 'doug@hhh.services', 'tracy@hhh.services'])
  console.log('\nAdmin role flags for comparison:')
  console.table(admins)

  // Verification reports for job 21004
  const { data: vr } = await s.from('verification_reports')
    .select('id, verification_type, score, voided, created_at')
    .eq('job_id', 21004)
  console.log('\nVerification reports on job 21004:')
  console.table(vr)

  // Schema check: does is_admin column exist on employees?
  const { data: cols } = await s.rpc('exec_sql', { sql: "select column_name from information_schema.columns where table_name='employees' and column_name in ('is_admin','is_developer','user_role','role')" }).catch(() => ({ data: null }))
  if (cols) console.log('\nemployees role columns:', cols)
})()
