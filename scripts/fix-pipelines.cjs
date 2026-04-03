const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 5
const OLD = 3

async function getAllRows(table, cid, cols = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data } = await sb.from(table).select(cols).eq('company_id', cid).range(from, from + 999).order('id')
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function run() {
  console.log('=== Fixing Pipelines for Company ' + CID + ' ===\n')

  // ── 1. Check pipeline_stages ──
  console.log('1. Pipeline Stages')
  const { data: c3Stages } = await sb.from('pipeline_stages').select('*').eq('company_id', OLD).order('sort_order')
  const { data: c5Stages } = await sb.from('pipeline_stages').select('*').eq('company_id', CID)
  console.log('  C3 stages: ' + (c3Stages || []).length)
  console.log('  C5 stages: ' + (c5Stages || []).length)

  if ((c5Stages || []).length === 0 && (c3Stages || []).length > 0) {
    console.log('  Copying stages from C3...')
    const rows = c3Stages.map(s => {
      const { id, company_id, ...rest } = s
      return { ...rest, company_id: CID }
    })
    const { data: inserted, error } = await sb.from('pipeline_stages').insert(rows).select()
    if (error) console.error('  Error:', error.message)
    else console.log('  Inserted ' + (inserted || []).length + ' stages')
  }

  // ── 2. Check employee IDs ──
  console.log('\n2. Employee IDs')
  const c5Emps = await getAllRows('employees', CID, 'id, name, email, role')
  console.log('  Company 5 employees:')
  for (const e of c5Emps) console.log('    id=' + e.id + ' ' + e.name + ' (' + e.email + ') - ' + e.role)

  // Check what salesperson_id values leads have
  const leads = await getAllRows('leads', CID, 'id, salesperson_id, lead_owner_id, setter_id')
  const spIds = {}
  const loIds = {}
  for (const l of leads) {
    if (l.salesperson_id) spIds[l.salesperson_id] = (spIds[l.salesperson_id] || 0) + 1
    if (l.lead_owner_id) loIds[l.lead_owner_id] = (loIds[l.lead_owner_id] || 0) + 1
  }
  console.log('\n  Lead salesperson_id values:', JSON.stringify(spIds))
  console.log('  Lead lead_owner_id values:', JSON.stringify(loIds))

  // Check what salesperson_id values jobs have
  const jobs = await getAllRows('jobs', CID, 'id, salesperson_id')
  const jobSpIds = {}
  for (const j of jobs) {
    if (j.salesperson_id) jobSpIds[j.salesperson_id] = (jobSpIds[j.salesperson_id] || 0) + 1
  }
  console.log('  Job salesperson_id values:', JSON.stringify(jobSpIds))

  // The logged-in user (bryce@hhh.services) employee ID in C5
  const bryceC5 = c5Emps.find(e => e.email && e.email.toLowerCase() === 'bryce@hhh.services')
  console.log('\n  Bryce in C5: id=' + (bryceC5 ? bryceC5.id : 'NOT FOUND'))

  // ── 3. Check actual job statuses ──
  console.log('\n3. Job Status Distribution')
  const allJobs = await getAllRows('jobs', CID, 'id, status')
  const statusCounts = {}
  for (const j of allJobs) statusCounts[j.status] = (statusCounts[j.status] || 0) + 1
  console.log('  Statuses:')
  Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('    ' + s + ': ' + c))

  // ── 4. Check actual lead statuses ──
  console.log('\n4. Lead Status Distribution')
  const allLeads = await getAllRows('leads', CID, 'id, status')
  const leadStatusCounts = {}
  for (const l of allLeads) leadStatusCounts[l.status] = (leadStatusCounts[l.status] || 0) + 1
  console.log('  Statuses:')
  Object.entries(leadStatusCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('    ' + s + ': ' + c))

  // ── 5. Fix: The SalesPipeline owner filter defaults to logged-in user ──
  // The issue is the pipeline defaults to showing only the logged-in user's leads
  // The user needs to select "All" in the owner dropdown, OR we ensure leads have proper owner IDs
  // For now, let's just check if the data is queryable with the right statuses

  const defaultStageIds = ['New', 'Contacted', 'Appointment Set', 'Qualified', 'Quote Sent', 'Negotiation', 'Won']
  const legacyStatuses = ['Assigned', 'Callback', 'Converted', 'Not Qualified']
  const allStatuses = [...defaultStageIds, ...legacyStatuses]

  const matchingLeads = allLeads.filter(l => allStatuses.includes(l.status))
  console.log('\n  Leads matching pipeline statuses: ' + matchingLeads.length + '/' + allLeads.length)
  const nonMatching = allLeads.filter(l => !allStatuses.includes(l.status))
  if (nonMatching.length > 0) {
    const nmCounts = {}
    for (const l of nonMatching) nmCounts[l.status] = (nmCounts[l.status] || 0) + 1
    console.log('  Non-matching statuses:', JSON.stringify(nmCounts))
  }

  // ── 6. Fix non-matching lead statuses ──
  console.log('\n5. Fixing lead statuses')
  const statusMap = {
    'Quote Sent': 'Quote Sent',  // already matches
    'Appointment Set': 'Appointment Set',  // already matches
    'Won': 'Won',
    'Lost': 'Lost',  // terminal, fine
    'Sold': 'Won',
    'Appointment Scheduled': 'Appointment Set',
    'Job Scheduled': 'Won',  // has a job
  }

  let leadFixed = 0
  for (const l of nonMatching) {
    const mapped = statusMap[l.status]
    if (mapped && mapped !== l.status) {
      await sb.from('leads').update({ status: mapped }).eq('id', l.id)
      leadFixed++
    }
  }
  console.log('  Lead statuses fixed: ' + leadFixed)

  // ── 7. Fix non-matching job statuses ──
  console.log('\n6. Fixing job statuses')
  // Default job board columns: Chillin, Scheduled, In Progress, Completed
  const jobStatusMap = {
    'Chillin': 'Chillin',
    'Scheduled': 'Scheduled',
    'In Progress': 'In Progress',
    'Completed': 'Completed',
    'Cancelled': 'Cancelled',
    'On Hold': 'On Hold',
    // Any others?
  }
  const unmatchedJobStatuses = Object.keys(statusCounts).filter(s => !jobStatusMap[s])
  if (unmatchedJobStatuses.length > 0) {
    console.log('  Unmatched job statuses:', unmatchedJobStatuses)
  } else {
    console.log('  All job statuses match board columns')
  }

  // ── 8. Copy settings from C3 that might be missing ──
  console.log('\n7. Checking job_statuses setting')
  const { data: c3JobStatuses } = await sb.from('settings').select('*').eq('company_id', OLD).eq('key', 'job_statuses').limit(1)
  const { data: c5JobStatuses } = await sb.from('settings').select('*').eq('company_id', CID).eq('key', 'job_statuses').limit(1)
  console.log('  C3 job_statuses:', c3JobStatuses && c3JobStatuses[0] ? c3JobStatuses[0].value : 'NOT SET')
  console.log('  C5 job_statuses:', c5JobStatuses && c5JobStatuses[0] ? c5JobStatuses[0].value : 'NOT SET')

  if ((!c5JobStatuses || c5JobStatuses.length === 0) && c3JobStatuses && c3JobStatuses[0]) {
    const { id, company_id, ...rest } = c3JobStatuses[0]
    await sb.from('settings').insert({ ...rest, company_id: CID })
    console.log('  Copied job_statuses setting')
  }

  // Check pipeline_statuses setting too
  const { data: c3PipeStatuses } = await sb.from('settings').select('*').eq('company_id', OLD).eq('key', 'pipeline_statuses').limit(1)
  const { data: c5PipeStatuses } = await sb.from('settings').select('*').eq('company_id', CID).eq('key', 'pipeline_statuses').limit(1)
  console.log('  C3 pipeline_statuses:', c3PipeStatuses && c3PipeStatuses[0] ? c3PipeStatuses[0].value : 'NOT SET')
  console.log('  C5 pipeline_statuses:', c5PipeStatuses && c5PipeStatuses[0] ? c5PipeStatuses[0].value : 'NOT SET')

  console.log('\n══════════════════════════════════════')
  console.log('  PIPELINE FIXES DONE')
  console.log('══════════════════════════════════════')
  console.log('  NOTE: The Sales Pipeline defaults to showing')
  console.log('  only the logged-in users leads. Select "All"')
  console.log('  in the owner dropdown to see everything.')
  console.log('══════════════════════════════════════')
}

run().catch(console.error)
