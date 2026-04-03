const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const OLD = 3  // existing HHH Services
const NEW = 5  // HHH Services - Clean

async function getAllRows(table, companyId, selectCols = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(selectCols).eq('company_id', companyId).range(from, from + 999).order('id')
    if (error) { console.error('  Query error on ' + table + ':', error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function insertBatch(table, rows) {
  if (rows.length === 0) return []
  const all = []
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await sb.from(table).insert(chunk).select()
    if (error) {
      console.error('  Insert error ' + table + ':', error.message)
      // Try one by one
      for (const row of chunk) {
        const { data: s, error: e } = await sb.from(table).insert(row).select()
        if (e) console.error('    Bad row:', e.message, JSON.stringify(row).slice(0, 120))
        else if (s) all.push(...s)
      }
    } else if (data) all.push(...data)
  }
  return all
}

async function run() {
  console.log('=== Merging Company ' + OLD + ' → Company ' + NEW + ' ===\n')

  // ════════════════════════════════════════════════════════════
  // 1. EMPLOYEES — add missing ones from company 3
  // ════════════════════════════════════════════════════════════
  console.log('1. EMPLOYEES')
  const oldEmps = await getAllRows('employees', OLD)
  const newEmps = await getAllRows('employees', NEW)
  console.log('  Old: ' + oldEmps.length + ', New: ' + newEmps.length)

  // Match by email (lowercase)
  const newEmpEmails = new Set(newEmps.map(e => (e.email || '').toLowerCase()))
  const missingEmps = oldEmps.filter(e => !newEmpEmails.has((e.email || '').toLowerCase()))
  console.log('  Missing employees: ' + missingEmps.length)

  if (missingEmps.length > 0) {
    const empRows = missingEmps.map(e => {
      const { id, company_id, created_at, updated_at, ...rest } = e
      return { ...rest, company_id: NEW }
    })
    const inserted = await insertBatch('employees', empRows)
    console.log('  Inserted ' + inserted.length + ' employees')
    newEmps.push(...inserted)
  }

  // Fix existing employee data (roles, etc)
  for (const newEmp of newEmps) {
    const oldMatch = oldEmps.find(o => (o.email || '').toLowerCase() === (newEmp.email || '').toLowerCase())
    if (oldMatch) {
      const updates = {}
      if (oldMatch.role && oldMatch.role !== newEmp.role) updates.role = oldMatch.role
      if (oldMatch.phone && !newEmp.phone) updates.phone = oldMatch.phone
      if (oldMatch.headshot_url && !newEmp.headshot_url) updates.headshot_url = oldMatch.headshot_url
      if (oldMatch.headshot && !newEmp.headshot) updates.headshot = oldMatch.headshot
      if (oldMatch.business_unit && !newEmp.business_unit) updates.business_unit = oldMatch.business_unit
      if (oldMatch.user_role && oldMatch.user_role !== 'User') updates.user_role = oldMatch.user_role
      if (oldMatch.is_admin) updates.is_admin = true
      if (oldMatch.hourly_rate) updates.hourly_rate = oldMatch.hourly_rate
      if (oldMatch.salary) updates.salary = oldMatch.salary
      if (oldMatch.annual_salary) updates.annual_salary = oldMatch.annual_salary
      if (oldMatch.pay_type && oldMatch.pay_type.length > 0) updates.pay_type = oldMatch.pay_type
      if (oldMatch.commission_goods_rate) updates.commission_goods_rate = oldMatch.commission_goods_rate
      if (oldMatch.commission_services_rate) updates.commission_services_rate = oldMatch.commission_services_rate
      if (oldMatch.is_hourly) updates.is_hourly = oldMatch.is_hourly
      if (oldMatch.is_salary) updates.is_salary = oldMatch.is_salary
      if (oldMatch.is_commission) updates.is_commission = oldMatch.is_commission
      if (oldMatch.tax_classification && oldMatch.tax_classification !== 'W2') updates.tax_classification = oldMatch.tax_classification

      if (Object.keys(updates).length > 0) {
        await sb.from('employees').update(updates).eq('id', newEmp.id)
        console.log('  Updated ' + newEmp.name + ': ' + Object.keys(updates).join(', '))
      }
    }
  }

  // Reload employees after updates
  const finalEmps = await getAllRows('employees', NEW)
  // Build email→id map for employee matching
  const empMap = new Map()
  for (const e of finalEmps) {
    empMap.set((e.email || '').toLowerCase(), e.id)
    empMap.set((e.name || '').toLowerCase(), e.id)
  }

  // ════════════════════════════════════════════════════════════
  // 2. JOB STATUSES — update from HCP actual data
  // ════════════════════════════════════════════════════════════
  console.log('\n2. JOB STATUSES — updating from HCP data')

  // We need to re-fetch HCP jobs to get proper statuses
  const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
  const HCP_BASE = 'https://api.housecallpro.com'

  async function hcpGet(path) {
    for (let attempt = 0; attempt <= 5; attempt++) {
      const res = await fetch(HCP_BASE + path, {
        headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
      })
      if (res.status === 429) {
        const wait = Math.min(3000 * Math.pow(2, attempt), 30000)
        process.stdout.write(' [429, ' + (wait/1000) + 's]')
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      if (!res.ok) return null
      return res.json()
    }
    return null
  }

  // Pull all HCP jobs
  console.log('  Fetching HCP jobs...')
  const hcpJobs = []
  for (let p = 1; p <= 100; p++) {
    const data = await hcpGet('/jobs?page=' + p + '&page_size=200')
    if (!data || !data.jobs || data.jobs.length === 0) break
    hcpJobs.push(...data.jobs)
    if (p % 10 === 0) process.stdout.write('  ' + hcpJobs.length + ' jobs...\r')
  }
  console.log('  Fetched ' + hcpJobs.length + ' HCP jobs')

  // Get all new company jobs
  const newJobs = await getAllRows('jobs', NEW, 'id, job_id, status, customer_name, start_date, end_date, salesperson_id')
  console.log('  DB jobs: ' + newJobs.length)

  // Status map
  function mapJobStatus(s) {
    const map = {
      'needs scheduling': 'Chillin', 'scheduled': 'Scheduled', 'in progress': 'In Progress',
      'complete': 'Completed', 'complete unrated': 'Completed', 'on hold': 'On Hold',
      'canceled': 'Cancelled', 'unscheduled': 'Chillin',
    }
    return map[(s || '').toLowerCase()] || 'Chillin'
  }

  // Update statuses — jobs were inserted in same order as HCP API returns
  let updated = 0
  for (let i = 0; i < Math.min(hcpJobs.length, newJobs.length); i++) {
    const hcp = hcpJobs[i]
    const js = newJobs[i]
    const correctStatus = mapJobStatus(hcp.work_status)

    const updates = {}
    if (js.status !== correctStatus) updates.status = correctStatus

    // Add schedule dates if missing
    if (!js.start_date && hcp.schedule && hcp.schedule.scheduled_start) {
      updates.start_date = hcp.schedule.scheduled_start
    }
    if (!js.end_date && hcp.schedule && hcp.schedule.scheduled_end) {
      updates.end_date = hcp.schedule.scheduled_end
    }

    // Map assigned employees
    if (hcp.assigned_employees && hcp.assigned_employees.length > 0) {
      // Try to find employee in our DB
      // HCP employee objects have first_name, last_name, email
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('jobs').update(updates).eq('id', js.id)
      updated++
    }

    if (updated % 500 === 0 && updated > 0) process.stdout.write('  Updated ' + updated + ' jobs...\r')
  }
  console.log('  Updated ' + updated + ' job statuses')

  // ════════════════════════════════════════════════════════════
  // 3. INVOICE STATUSES — update from HCP
  // ════════════════════════════════════════════════════════════
  console.log('\n3. INVOICE STATUSES')

  console.log('  Fetching HCP invoices...')
  const hcpInvoices = []
  for (let p = 1; p <= 100; p++) {
    const data = await hcpGet('/invoices?page=' + p + '&page_size=200')
    if (!data || !data.invoices || data.invoices.length === 0) break
    hcpInvoices.push(...data.invoices)
    if (p % 10 === 0) process.stdout.write('  ' + hcpInvoices.length + ' invoices...\r')
  }
  console.log('  Fetched ' + hcpInvoices.length + ' HCP invoices')

  const newInvoices = await getAllRows('invoices', NEW, 'id, invoice_id, payment_status, amount')
  console.log('  DB invoices: ' + newInvoices.length)

  function mapInvoiceStatus(s) {
    const map = {
      'new':'Pending','due':'Pending','overdue':'Overdue','paid':'Paid',
      'partial':'Partial','void':'Void','closed':'Paid','open':'Pending','pending':'Pending'
    }
    return map[(s||'').toLowerCase()] || 'Pending'
  }

  let invUpdated = 0
  for (let i = 0; i < Math.min(hcpInvoices.length, newInvoices.length); i++) {
    const hcp = hcpInvoices[i]
    const js = newInvoices[i]
    const correctStatus = mapInvoiceStatus(hcp.status)

    if (js.payment_status !== correctStatus) {
      await sb.from('invoices').update({ payment_status: correctStatus }).eq('id', js.id)
      invUpdated++
    }
  }
  console.log('  Updated ' + invUpdated + ' invoice statuses')

  // ════════════════════════════════════════════════════════════
  // 4. LEAD STATUSES — update based on linked quotes/jobs
  // ════════════════════════════════════════════════════════════
  console.log('\n4. LEAD STATUSES')

  // Fetch HCP estimates to get proper statuses
  console.log('  Fetching HCP estimates...')
  const hcpEstimates = []
  for (let p = 1; p <= 50; p++) {
    const data = await hcpGet('/estimates?page=' + p + '&page_size=200')
    if (!data || !data.estimates || data.estimates.length === 0) break
    hcpEstimates.push(...data.estimates)
  }
  console.log('  Fetched ' + hcpEstimates.length + ' HCP estimates')

  const newLeads = await getAllRows('leads', NEW, 'id, lead_id, status')
  console.log('  DB leads: ' + newLeads.length)

  let leadUpdated = 0
  for (let i = 0; i < Math.min(hcpEstimates.length, newLeads.length); i++) {
    const hcp = hcpEstimates[i]
    const js = newLeads[i]

    let correctStatus = 'New'
    const ws = (hcp.work_status || '').toLowerCase()
    // Check if any option was approved
    const hasApproved = (hcp.options || []).some(o => o.approval_status === 'approved' || o.status === 'won')
    const hasDeclined = (hcp.options || []).some(o => o.approval_status === 'declined' || o.status === 'lost')

    if (hasApproved) correctStatus = 'Won'
    else if (ws === 'complete') correctStatus = 'Won'
    else if (ws === 'canceled' || hasDeclined) correctStatus = 'Lost'
    else if (ws === 'scheduled' || ws === 'in progress') correctStatus = 'Appointment Set'
    else correctStatus = 'Quote Sent'

    if (js.status !== correctStatus) {
      await sb.from('leads').update({ status: correctStatus }).eq('id', js.id)
      leadUpdated++
    }
  }
  console.log('  Updated ' + leadUpdated + ' lead statuses')

  // Update quote statuses too
  console.log('\n  Updating quote statuses...')
  const newQuotes = await getAllRows('quotes', NEW, 'id, quote_id, status')
  let qUpdated = 0
  for (let i = 0; i < Math.min(hcpEstimates.length, newQuotes.length); i++) {
    const hcp = hcpEstimates[i]
    const js = newQuotes[i]

    const hasApproved = (hcp.options || []).some(o => o.approval_status === 'approved' || o.status === 'won')
    const hasDeclined = (hcp.options || []).some(o => o.approval_status === 'declined' || o.status === 'lost')

    let correctStatus = 'Draft'
    if (hasApproved) correctStatus = 'Approved'
    else if (hasDeclined) correctStatus = 'Rejected'
    else {
      const ws = (hcp.work_status || '').toLowerCase()
      if (ws === 'complete' || ws === 'scheduled' || ws === 'in progress') correctStatus = 'Sent'
      else if (ws === 'canceled') correctStatus = 'Rejected'
    }

    if (js.status !== correctStatus) {
      await sb.from('quotes').update({ status: correctStatus }).eq('id', js.id)
      qUpdated++
    }
  }
  console.log('  Updated ' + qUpdated + ' quote statuses')

  // ════════════════════════════════════════════════════════════
  // 5. APPOINTMENTS — copy from company 3
  // ════════════════════════════════════════════════════════════
  console.log('\n5. APPOINTMENTS')
  const oldAppts = await getAllRows('appointments', OLD)
  const newApptCount = (await sb.from('appointments').select('id', { count: 'exact', head: true }).eq('company_id', NEW)).count || 0
  console.log('  Old: ' + oldAppts.length + ', New: ' + newApptCount)

  if (newApptCount === 0 && oldAppts.length > 0) {
    // Need to map employee IDs and customer IDs
    const newCusts = await getAllRows('customers', NEW, 'id, name')
    const custNameToId = new Map()
    for (const c of newCusts) custNameToId.set((c.name || '').toLowerCase(), c.id)

    // Get old customers for ID mapping
    const oldCusts = await getAllRows('customers', OLD, 'id, name')
    const oldCustIdToName = new Map()
    for (const c of oldCusts) oldCustIdToName.set(c.id, (c.name || '').toLowerCase())

    // Old employee id → new employee id
    const oldEmpIdToNew = new Map()
    for (const oe of oldEmps) {
      const ne = finalEmps.find(n => (n.email || '').toLowerCase() === (oe.email || '').toLowerCase())
      if (ne) oldEmpIdToNew.set(oe.id, ne.id)
    }

    const apptRows = oldAppts.map(a => {
      const { id, company_id, created_at, updated_at, lead_id, ...rest } = a

      // Map customer
      if (rest.customer_id) {
        const oldName = oldCustIdToName.get(rest.customer_id)
        rest.customer_id = oldName ? (custNameToId.get(oldName) || null) : null
      }

      // Map employees
      for (const field of ['employee_id', 'salesperson_id', 'setter_id', 'lead_owner_id']) {
        if (rest[field]) {
          rest[field] = oldEmpIdToNew.get(rest[field]) || null
        }
      }

      return { ...rest, company_id: NEW }
    })

    const inserted = await insertBatch('appointments', apptRows)
    console.log('  Inserted ' + inserted.length + ' appointments')
  }

  // ════════════════════════════════════════════════════════════
  // 6. SETTINGS — copy from company 3 (deduplicated)
  // ════════════════════════════════════════════════════════════
  console.log('\n6. SETTINGS')
  const oldSettings = await getAllRows('settings', OLD)
  const newSettingsCount = (await sb.from('settings').select('id', { count: 'exact', head: true }).eq('company_id', NEW)).count || 0
  console.log('  Old: ' + oldSettings.length + ', New: ' + newSettingsCount)

  if (newSettingsCount === 0 && oldSettings.length > 0) {
    // Deduplicate — keep only the latest entry per key
    const dedupMap = new Map()
    for (const s of oldSettings) {
      const existing = dedupMap.get(s.key)
      if (!existing || (s.id > existing.id)) {
        dedupMap.set(s.key, s)
      }
    }

    const settingRows = Array.from(dedupMap.values()).map(s => {
      const { id, company_id, created_at, updated_at, ...rest } = s
      return { ...rest, company_id: NEW }
    })

    console.log('  Deduplicated: ' + oldSettings.length + ' → ' + settingRows.length + ' unique keys')
    const inserted = await insertBatch('settings', settingRows)
    console.log('  Inserted ' + inserted.length + ' settings')
  }

  // ════════════════════════════════════════════════════════════
  // 7. BANK ACCOUNTS — copy from company 3
  // ════════════════════════════════════════════════════════════
  console.log('\n7. BANK ACCOUNTS')
  const oldBanks = await getAllRows('bank_accounts', OLD)
  const newBankCount = (await sb.from('bank_accounts').select('id', { count: 'exact', head: true }).eq('company_id', NEW)).count || 0
  console.log('  Old: ' + oldBanks.length + ', New: ' + newBankCount)

  if (newBankCount === 0 && oldBanks.length > 0) {
    const bankRows = oldBanks.map(b => {
      const { id, company_id, created_at, ...rest } = b
      return { ...rest, company_id: NEW }
    })
    const inserted = await insertBatch('bank_accounts', bankRows)
    console.log('  Inserted ' + inserted.length + ' bank accounts')
  }

  // ════════════════════════════════════════════════════════════
  // 8. CUSTOMERS — add any from company 3 not in company 5
  // ════════════════════════════════════════════════════════════
  console.log('\n8. CUSTOMERS — checking for missing')
  const oldCusts2 = await getAllRows('customers', OLD, 'id, name, email, phone, address, business_name, status, notes, tags, salesperson_id')
  const newCusts2 = await getAllRows('customers', NEW, 'id, name, email')
  console.log('  Old: ' + oldCusts2.length + ', New: ' + newCusts2.length)

  const newCustNames = new Set(newCusts2.map(c => (c.name || '').toLowerCase()))
  const newCustEmails = new Set(newCusts2.filter(c => c.email).map(c => c.email.toLowerCase()))

  const missingCusts = oldCusts2.filter(c => {
    const name = (c.name || '').toLowerCase()
    const email = (c.email || '').toLowerCase()
    // Not in new by name AND not by email
    return !newCustNames.has(name) && (!email || !newCustEmails.has(email))
  })
  console.log('  Missing customers: ' + missingCusts.length)

  if (missingCusts.length > 0) {
    const custRows = missingCusts.map(c => {
      const { id, company_id, salesperson_id, ...rest } = c
      return { ...rest, company_id: NEW }
    })
    const inserted = await insertBatch('customers', custRows)
    console.log('  Inserted ' + inserted.length + ' customers')
  }

  // ════════════════════════════════════════════════════════════
  // 9. LEADS from company 3 that aren't from HCP migration
  // ════════════════════════════════════════════════════════════
  console.log('\n9. LEADS from company 3')
  const oldLeads = await getAllRows('leads', OLD, 'id, lead_id, customer_name, email, phone, address, service_type, lead_source, status, notes, business_name, salesperson_id, setter_id, created_date')
  console.log('  Old leads: ' + oldLeads.length)

  // These 77 leads are manually entered in JobScout — add them
  if (oldLeads.length > 0) {
    const oldEmpIdToNewId = new Map()
    for (const oe of oldEmps) {
      const ne = finalEmps.find(n => (n.email || '').toLowerCase() === (oe.email || '').toLowerCase())
      if (ne) oldEmpIdToNewId.set(oe.id, ne.id)
    }

    const leadRows = oldLeads.map(l => {
      const { id, company_id, salesperson_id, setter_id, ...rest } = l
      return {
        ...rest,
        company_id: NEW,
        salesperson_id: salesperson_id ? (oldEmpIdToNewId.get(salesperson_id) || null) : null,
        setter_id: setter_id ? (oldEmpIdToNewId.get(setter_id) || null) : null,
        lead_source: (rest.lead_source || '') + (rest.lead_source ? '' : 'JobScout Import'),
      }
    })
    const inserted = await insertBatch('leads', leadRows)
    console.log('  Inserted ' + inserted.length + ' additional leads')
  }

  // ════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════')
  console.log('  MERGE COMPLETE')
  console.log('══════════════════════════════════════')

  const tables = ['employees','customers','leads','quotes','quote_lines','jobs','job_lines','invoices','payments','appointments','settings','bank_accounts']
  for (const t of tables) {
    const { count } = await sb.from(t).select('id', { count: 'exact', head: true }).eq('company_id', NEW)
    console.log('  ' + t + ': ' + (count || 0))
  }
  console.log('══════════════════════════════════════')
}

run().catch(err => { console.error('MERGE FAILED:', err); process.exit(1) })
