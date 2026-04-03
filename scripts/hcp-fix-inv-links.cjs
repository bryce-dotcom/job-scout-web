const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 5

async function hcpGet(path) {
  for (let attempt = 0; attempt <= 5; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 3000 * Math.pow(2, attempt)))
      continue
    }
    if (!res.ok) return null
    return res.json()
  }
  return null
}

async function getAllRows(table, companyId, cols = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data } = await sb.from(table).select(cols).eq('company_id', companyId).range(from, from + 999).order('id')
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function run() {
  console.log('=== Fixing Invoice Links from HCP ===\n')

  // Build customer name → id lookup
  const customers = await getAllRows('customers', CID, 'id, name')
  const custByName = new Map()
  for (const c of customers) custByName.set((c.name || '').toLowerCase().trim(), c.id)
  console.log('Customers loaded: ' + customers.length)

  // Build HCP job id → DB job mapping
  // HCP jobs and DB jobs are in same order
  console.log('Fetching HCP jobs for ID mapping...')
  const hcpJobs = []
  for (let p = 1; p <= 100; p++) {
    const data = await hcpGet('/jobs?page=' + p + '&page_size=200')
    if (!data || !data.jobs || data.jobs.length === 0) break
    hcpJobs.push(...data.jobs)
    if (p % 10 === 0) process.stdout.write('  ' + hcpJobs.length + ' jobs...\r')
  }
  console.log('  HCP jobs: ' + hcpJobs.length)

  const dbJobs = await getAllRows('jobs', CID, 'id')
  const hcpJobIdToDbId = new Map()
  for (let i = 0; i < Math.min(hcpJobs.length, dbJobs.length); i++) {
    hcpJobIdToDbId.set(hcpJobs[i].id, dbJobs[i].id)
  }
  console.log('  Job ID map: ' + hcpJobIdToDbId.size + ' entries')

  // Fetch HCP invoices
  console.log('Fetching HCP invoices...')
  const hcpInvoices = []
  for (let p = 1; p <= 100; p++) {
    const data = await hcpGet('/invoices?page=' + p + '&page_size=200')
    if (!data || !data.invoices || data.invoices.length === 0) break
    hcpInvoices.push(...data.invoices)
    if (p % 10 === 0) process.stdout.write('  ' + hcpInvoices.length + ' invoices...\r')
  }
  console.log('  HCP invoices: ' + hcpInvoices.length)

  // Get DB invoices in same order
  const dbInvoices = await getAllRows('invoices', CID, 'id, customer_id, job_id')
  console.log('  DB invoices: ' + dbInvoices.length)

  let custFixed = 0, jobFixed = 0
  for (let i = 0; i < Math.min(hcpInvoices.length, dbInvoices.length); i++) {
    const hcp = hcpInvoices[i]
    const db = dbInvoices[i]
    const updates = {}

    // Fix customer_id from HCP customer name
    if (!db.customer_id && hcp.customer) {
      const name = ((hcp.customer.first_name || '') + ' ' + (hcp.customer.last_name || '')).trim().toLowerCase()
      const custId = custByName.get(name)
      if (custId) {
        updates.customer_id = custId
        custFixed++
      } else if (hcp.customer.company) {
        // Try company name
        const compName = hcp.customer.company.toLowerCase().trim()
        const custId2 = custByName.get(compName)
        if (custId2) {
          updates.customer_id = custId2
          custFixed++
        }
      }
    }

    // Fix job_id from HCP job reference
    if (!db.job_id && hcp.job_id) {
      const dbJobId = hcpJobIdToDbId.get(hcp.job_id)
      if (dbJobId) {
        updates.job_id = dbJobId
        jobFixed++
      }
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('invoices').update(updates).eq('id', db.id)
    }

    if (i % 1000 === 0 && i > 0) process.stdout.write('  ' + i + '/' + dbInvoices.length + '...\r')
  }

  console.log('\n  Customer IDs fixed: ' + custFixed)
  console.log('  Job IDs fixed: ' + jobFixed)

  // Final check
  const { count: nullCust } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID).is('customer_id', null)
  const { count: nullJob } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID).is('job_id', null)
  console.log('\n  Invoices still no customer: ' + nullCust + '/' + dbInvoices.length)
  console.log('  Invoices still no job: ' + nullJob + '/' + dbInvoices.length)
}

run().catch(console.error)
