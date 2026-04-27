// Audit what's currently attributed to Cole in leads + jobs.
// Prints groups so we can decide which to reassign.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const COMPANY_ID = 3

;(async () => {
  // Find Cole
  const { data: emps } = await s.from('employees')
    .select('id, name, email, role, active')
    .eq('company_id', COMPANY_ID)
    .ilike('name', '%cole%')
  console.log('Matching employees:')
  console.table(emps)
  if (!emps?.length) return
  const cole = emps[0]
  console.log(`\nUsing Cole id = ${cole.id} (${cole.name})\n`)

  // Leads with Cole as salesperson or owner
  const { data: leadsAsSales } = await s.from('leads')
    .select('id, lead_id, customer_name, business_name, status, business_unit, salesperson_id, lead_owner_id, created_at')
    .eq('company_id', COMPANY_ID)
    .eq('salesperson_id', cole.id)
    .order('created_at', { ascending: false })

  const { data: leadsAsOwner } = await s.from('leads')
    .select('id, lead_id, customer_name, business_name, status, business_unit, salesperson_id, lead_owner_id, created_at')
    .eq('company_id', COMPANY_ID)
    .eq('lead_owner_id', cole.id)
    .neq('salesperson_id', cole.id)
    .order('created_at', { ascending: false })

  console.log(`Leads with salesperson_id = Cole: ${leadsAsSales?.length || 0}`)
  console.log(`Leads with lead_owner_id = Cole (and NOT salesperson): ${leadsAsOwner?.length || 0}`)

  // Group by status
  const byStatus = {}
  ;(leadsAsSales || []).forEach(l => {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1
  })
  console.log('\nLeads-as-salesperson by status:')
  console.table(byStatus)

  // Jobs with Cole
  const { data: jobsAsSales } = await s.from('jobs')
    .select('id, job_id, job_title, status, business_unit, salesperson_id, pm_id, job_lead_id, lead_id, customer_id, start_date')
    .eq('company_id', COMPANY_ID)
    .eq('salesperson_id', cole.id)
    .order('start_date', { ascending: false })

  const { data: jobsAsPM } = await s.from('jobs')
    .select('id, job_id, job_title, salesperson_id, pm_id, status')
    .eq('company_id', COMPANY_ID)
    .eq('pm_id', cole.id)
    .neq('salesperson_id', cole.id)

  const { data: jobsAsJobLead } = await s.from('jobs')
    .select('id, job_id, job_title, salesperson_id, job_lead_id, status')
    .eq('company_id', COMPANY_ID)
    .eq('job_lead_id', cole.id)
    .neq('salesperson_id', cole.id)

  console.log(`\nJobs with salesperson_id = Cole: ${jobsAsSales?.length || 0}`)
  console.log(`Jobs with pm_id = Cole (and NOT salesperson): ${jobsAsPM?.length || 0}`)
  console.log(`Jobs with job_lead_id = Cole (and NOT salesperson): ${jobsAsJobLead?.length || 0}`)

  const jobByStatus = {}
  ;(jobsAsSales || []).forEach(j => { jobByStatus[j.status] = (jobByStatus[j.status] || 0) + 1 })
  console.log('\nJobs-as-salesperson by status:')
  console.table(jobByStatus)

  // Show first 20 leads-as-salesperson for spot-check
  console.log('\nFirst 25 leads where Cole = salesperson (most recent):')
  console.table((leadsAsSales || []).slice(0, 25).map(l => ({
    id: l.id,
    lead_id: l.lead_id,
    customer: l.customer_name || l.business_name,
    status: l.status,
    bu: l.business_unit,
    created: l.created_at?.split('T')[0],
  })))

  console.log('\nFirst 25 jobs where Cole = salesperson (most recent):')
  console.table((jobsAsSales || []).slice(0, 25).map(j => ({
    id: j.id,
    job_id: j.job_id,
    title: j.job_title,
    status: j.status,
    bu: j.business_unit,
    pm: j.pm_id,
    job_lead: j.job_lead_id,
    start: j.start_date?.split('T')[0],
  })))
})()
