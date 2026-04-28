// Audit Costco appointment(s) — find why one is showing for several weeks.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  // Search appointments + jobs + leads for "Costco"
  const [{ data: appts }, { data: jobs }, { data: leads }] = await Promise.all([
    s.from('appointments').select('*').or('title.ilike.%costco%,location.ilike.%costco%,notes.ilike.%costco%').eq('company_id', 3),
    s.from('jobs').select('id, job_id, job_title, customer_id, status, start_date, end_date, recurrence, business_unit, created_at, customer:customers!customer_id(id, name)').or('job_title.ilike.%costco%').eq('company_id', 3),
    s.from('leads').select('id, customer_name, business_name, status').or('customer_name.ilike.%costco%,business_name.ilike.%costco%').eq('company_id', 3),
  ])

  console.log('Appointments matching Costco:')
  console.table((appts || []).map(a => ({
    id: a.id, title: a.title, status: a.status,
    start: a.start_time, end: a.end_time,
    type: a.appointment_type, recurrence: a.recurrence, location: a.location,
    employee_id: a.employee_id, lead_id: a.lead_id, job_id: a.job_id,
  })))

  console.log('\nJobs matching Costco:')
  console.table((jobs || []).map(j => ({
    id: j.id, job_id: j.job_id, title: j.job_title, customer: j.customer?.name,
    status: j.status, start: j.start_date, end: j.end_date, recur: j.recurrence,
    bu: j.business_unit, created: j.created_at?.split('T')[0],
  })))

  console.log('\nLeads matching Costco:')
  console.table(leads)

  // Find appointments tied to Costco via customer or lead linkage
  const { data: custs } = await s.from('customers').select('id, name').ilike('name', '%costco%').eq('company_id', 3)
  console.log('\nCostco customers:', custs)
  if (custs?.length) {
    const ids = custs.map(c => c.id)
    const { data: apptByCust } = await s.from('appointments').select('*').in('customer_id', ids).eq('company_id', 3)
    console.log('\nAppointments linked to Costco customer_id:')
    console.table((apptByCust || []).map(a => ({
      id: a.id, title: a.title, start: a.start_time, end: a.end_time,
      type: a.appointment_type, recurrence: a.recurrence, status: a.status,
      customer_id: a.customer_id,
    })))
  }

  // Show every column on appointment 66 (the active Costco one)
  const { data: appt66 } = await s.from('appointments').select('*').eq('id', 66).maybeSingle()
  console.log('\nAppointment 66 (full record):')
  console.log(JSON.stringify(appt66, null, 2))
})()
