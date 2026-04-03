const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const SOURCE_COMPANY_ID = 3 // existing HHH company (for price book copy)

// ── HCP API helper with retry on 429 ────────────────────────────
async function hcpGet(path, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 30000)
      process.stdout.write(' [429 rate-limited, waiting ' + (wait/1000) + 's...]')
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error('HCP API error ' + res.status + ' on ' + path + ': ' + text)
    }
    return res.json()
  }
  throw new Error('HCP API rate limit exceeded after ' + retries + ' retries on ' + path)
}

// ── Paginate all records from an HCP endpoint ───────────────────
async function hcpGetAll(path, key, maxPages = 100) {
  const all = []
  for (let p = 1; p <= maxPages; p++) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await hcpGet(path + sep + 'page=' + p + '&page_size=200')
    const items = data[key]
    if (!items || items.length === 0) break
    all.push(...items)
    process.stdout.write('  ' + key + ' page ' + p + ' (' + all.length + ' total)...\r')
  }
  console.log('  Fetched ' + all.length + ' ' + key + ' total')
  return all
}

// ── Status mappers ──────────────────────────────────────────────
function mapJobStatus(hcpStatus) {
  const map = {
    'needs scheduling': 'Chillin',
    'scheduled': 'Scheduled',
    'in progress': 'In Progress',
    'complete': 'Completed',
    'on hold': 'On Hold',
    'canceled': 'Cancelled',
    'unscheduled': 'Chillin',
  }
  return map[(hcpStatus || '').toLowerCase()] || 'Chillin'
}

function mapEstimateStatus(hcpStatus) {
  const map = {
    'needs scheduling': 'Draft',
    'scheduled': 'Sent',
    'in progress': 'Sent',
    'complete': 'Sent',
    'on hold': 'Draft',
    'canceled': 'Rejected',
  }
  return map[(hcpStatus || '').toLowerCase()] || 'Draft'
}

function mapEstimateOptionStatus(optStatus, approvalStatus) {
  // option approval_status: null, approved, declined
  if (approvalStatus === 'approved') return 'Approved'
  if (approvalStatus === 'declined') return 'Rejected'
  // option status: pending, won, lost
  if (optStatus === 'won') return 'Approved'
  if (optStatus === 'lost') return 'Rejected'
  return 'Sent'
}

function mapInvoiceStatus(hcpStatus) {
  const map = {
    'new': 'Pending',
    'due': 'Pending',
    'overdue': 'Overdue',
    'paid': 'Paid',
    'partial': 'Partial',
    'void': 'Void',
    'closed': 'Paid',
    'open': 'Pending',
    'pending': 'Pending',
  }
  return map[(hcpStatus || '').toLowerCase()] || 'Pending'
}

function mapPaymentStatus(hcpStatus) {
  const map = {
    'succeeded': 'Completed',
    'pending': 'Pending',
    'failed': 'Failed',
    'refunded': 'Refunded',
  }
  return map[(hcpStatus || '').toLowerCase()] || 'Pending'
}

function mapPaymentMethod(hcpMethod) {
  const map = {
    'cash': 'Cash',
    'check': 'Check',
    'credit_card': 'Credit Card',
    'ach': 'ACH',
    'financing': 'Financing',
    'other': 'Other',
  }
  return map[(hcpMethod || '').toLowerCase()] || 'Other'
}

// ── Cents to dollars ────────────────────────────────────────────
function c2d(cents) {
  return cents ? Number((cents / 100).toFixed(2)) : 0
}

// ── Generate short IDs ─────────────────────────────────────────
let idCounter = 0
function genId(prefix) {
  idCounter++
  return prefix + '-HCP-' + String(idCounter).padStart(5, '0')
}

// ── Insert batch helper (Supabase has 1000 row limit) ───────────
async function insertBatch(table, rows) {
  if (rows.length === 0) return []
  const allInserted = []
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await sb.from(table).insert(chunk).select()
    if (error) {
      console.error('Insert error on ' + table + ' (chunk ' + Math.floor(i/500) + '):', error.message)
      // Try one-by-one for this chunk to find the bad row
      for (const row of chunk) {
        const { data: single, error: sErr } = await sb.from(table).insert(row).select()
        if (sErr) {
          console.error('  Bad row in ' + table + ':', sErr.message, JSON.stringify(row).slice(0, 200))
        } else if (single) {
          allInserted.push(...single)
        }
      }
    } else if (data) {
      allInserted.push(...data)
    }
  }
  return allInserted
}

// ══════════════════════════════════════════════════════════════════
// MAIN MIGRATION
// ══════════════════════════════════════════════════════════════════
async function run() {
  console.log('=== HCP → JobScout Full Migration ===\n')

  // ── STEP 1: Create new company ──────────────────────────────
  console.log('STEP 1: Creating new company...')
  const { data: company, error: compErr } = await sb.from('companies').insert({
    company_name: 'HHH Services - Clean',
    owner_email: 'bwest@hhhservices.com',
    phone: '',
    address: '',
    subscription_tier: 'pro',
    active: true,
  }).select().single()
  if (compErr) { console.error('Company create failed:', compErr); return }
  const CID = company.id
  console.log('  Created company id=' + CID + ': ' + company.company_name)

  // ── STEP 2: Copy price book from company 3 ─────────────────
  console.log('\nSTEP 2: Copying price book from company ' + SOURCE_COMPANY_ID + '...')
  const { data: srcProducts } = await sb.from('products_services').select('*').eq('company_id', SOURCE_COMPANY_ID)
  const productRows = srcProducts.map(p => {
    const { id, company_id, created_at, updated_at, ...rest } = p
    return { ...rest, company_id: CID }
  })
  const newProducts = await insertBatch('products_services', productRows)
  console.log('  Copied ' + newProducts.length + ' products')

  // Build name→id lookup for matching line items
  const productByName = new Map()
  for (const p of newProducts) {
    productByName.set(p.name, p)
    // Also index by lowercase for fuzzy matching
    productByName.set(p.name.toLowerCase(), p)
  }

  function findProduct(hcpItemName) {
    if (!hcpItemName) return null
    // Exact match
    let match = productByName.get(hcpItemName)
    if (match) return match
    // Case-insensitive
    match = productByName.get(hcpItemName.toLowerCase())
    if (match) return match
    // Partial match: HCP name contains product name or vice versa
    const lower = hcpItemName.toLowerCase()
    for (const p of newProducts) {
      if (lower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lower)) {
        return p
      }
    }
    return null
  }

  // ── STEP 3: Create employees ────────────────────────────────
  console.log('\nSTEP 3: Creating employees...')
  const hcpEmployees = await hcpGetAll('/employees', 'employees', 5)
  const employeeRows = hcpEmployees.map(e => ({
    company_id: CID,
    employee_id: genId('EMP'),
    name: ((e.first_name || '') + ' ' + (e.last_name || '')).trim() || 'Unknown',
    email: e.email || '',
    phone: e.mobile_number || e.phone || '',
    role: e.role || 'Field Tech',
    active: true,
  }))
  // Also add owner if not in HCP
  if (!employeeRows.find(e => e.email === 'bwest@hhhservices.com')) {
    employeeRows.push({
      company_id: CID,
      employee_id: genId('EMP'),
      name: 'Brad West',
      email: 'bwest@hhhservices.com',
      role: 'Owner',
      active: true,
    })
  }
  const newEmployees = await insertBatch('employees', employeeRows)
  console.log('  Created ' + newEmployees.length + ' employees')

  // Build HCP employee id→JS employee lookup
  const empByHcpId = new Map()
  for (let i = 0; i < hcpEmployees.length; i++) {
    if (newEmployees[i]) {
      empByHcpId.set(hcpEmployees[i].id, newEmployees[i])
    }
  }
  const defaultEmp = newEmployees.find(e => e.email === 'bwest@hhhservices.com') || newEmployees[0]

  // ── STEP 4: Pull & insert customers ─────────────────────────
  console.log('\nSTEP 4: Pulling customers from HCP...')
  const hcpCustomers = await hcpGetAll('/customers', 'customers', 50)

  const customerRows = hcpCustomers.map(c => ({
    company_id: CID,
    customer_id: genId('CUST'),
    name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.company || 'Unknown',
    email: (c.email || (c.emails && c.emails[0] && c.emails[0].address) || ''),
    phone: (c.mobile_number || (c.phones && c.phones[0] && c.phones[0].number) || ''),
    address: formatAddress(c),
    business_name: c.company || '',
    status: 'Active',
    notes: (c.notes || ''),
    tags: (c.tags || []).join(', '),
    created_at: c.created_at || new Date().toISOString(),
  }))

  const newCustomers = await insertBatch('customers', customerRows)
  console.log('  Inserted ' + newCustomers.length + ' customers')

  // Build HCP customer id→JS customer lookup
  const custByHcpId = new Map()
  for (let i = 0; i < hcpCustomers.length; i++) {
    if (newCustomers[i]) {
      custByHcpId.set(hcpCustomers[i].id, newCustomers[i])
    }
  }

  // Also build by name for fallback matching
  const custByName = new Map()
  for (const c of newCustomers) {
    custByName.set(c.name.toLowerCase(), c)
  }

  function findCustomer(hcpCust) {
    if (!hcpCust) return null
    // By HCP id
    if (hcpCust.id) {
      const match = custByHcpId.get(hcpCust.id)
      if (match) return match
    }
    // By name
    const name = ((hcpCust.first_name || '') + ' ' + (hcpCust.last_name || '')).trim().toLowerCase()
    if (name) return custByName.get(name) || null
    return null
  }

  // ── STEP 5: Pull estimates → quotes + quote_lines + leads ───
  console.log('\nSTEP 5: Pulling estimates from HCP...')
  const hcpEstimates = await hcpGetAll('/estimates', 'estimates', 50)

  const leadRows = []
  const quoteRows = []
  const hcpEstToQuoteIdx = new Map() // hcp estimate id → index in quoteRows

  for (const est of hcpEstimates) {
    const cust = findCustomer(est.customer)
    const custId = cust ? cust.id : null
    const custName = cust ? cust.name : (est.customer ? ((est.customer.first_name || '') + ' ' + (est.customer.last_name || '')).trim() : 'Unknown')

    // Determine assigned employee
    const assignedEmp = (est.assigned_employees && est.assigned_employees[0])
      ? empByHcpId.get(est.assigned_employees[0])
      : null

    // Calculate total from options
    let totalAmount = 0
    for (const opt of (est.options || [])) {
      totalAmount += opt.total || 0
    }

    // Create a lead for this estimate
    const leadIdx = leadRows.length
    leadRows.push({
      company_id: CID,
      lead_id: genId('LEAD'),
      customer_name: custName,
      email: cust ? cust.email : '',
      phone: cust ? cust.phone : '',
      address: cust ? cust.address : formatAddress(est.address || {}),
      service_type: 'Lighting',
      lead_source: est.lead_source || 'HouseCall Pro',
      status: est.work_status === 'complete' ? 'Sold' : (est.work_status === 'canceled' ? 'Lost' : 'New'),
      notes: est.notes || '',
      created_date: est.created_at || new Date().toISOString(),
      created_at: est.created_at || new Date().toISOString(),
      customer_id: custId,
      quote_generated: true,
    })

    // Create the quote
    const qIdx = quoteRows.length
    hcpEstToQuoteIdx.set(est.id, qIdx)
    quoteRows.push({
      company_id: CID,
      quote_id: genId('EST'),
      customer_id: custId,
      salesperson_id: assignedEmp ? assignedEmp.id : (defaultEmp ? defaultEmp.id : null),
      quote_amount: c2d(totalAmount),
      status: mapEstimateStatus(est.work_status),
      service_type: 'Lighting',
      notes: est.notes || '',
      created_at: est.created_at || new Date().toISOString(),
      // lead_id will be set after leads are inserted
      _hcp_id: est.id, // temp, will strip before insert
      _lead_idx: leadIdx, // temp
      _options: est.options || [], // temp
    })
  }

  // Insert leads first
  console.log('  Inserting ' + leadRows.length + ' leads...')
  const newLeads = await insertBatch('leads', leadRows)
  console.log('  Inserted ' + newLeads.length + ' leads')

  // Set lead_id on quotes and strip temp fields, then insert
  const cleanQuoteRows = quoteRows.map((q, idx) => {
    const leadRef = newLeads[q._lead_idx]
    const { _hcp_id, _lead_idx, _options, ...clean } = q
    return { ...clean, lead_id: leadRef ? leadRef.id : null }
  })

  console.log('  Inserting ' + cleanQuoteRows.length + ' quotes...')
  const newQuotes = await insertBatch('quotes', cleanQuoteRows)
  console.log('  Inserted ' + newQuotes.length + ' quotes')

  // Build HCP estimate id → JS quote lookup
  const quoteByHcpEstId = new Map()
  for (let i = 0; i < hcpEstimates.length; i++) {
    const qIdx = hcpEstToQuoteIdx.get(hcpEstimates[i].id)
    if (qIdx !== undefined && newQuotes[qIdx]) {
      quoteByHcpEstId.set(hcpEstimates[i].id, newQuotes[qIdx])
    }
  }

  // Now fetch line items for each estimate and insert quote_lines
  console.log('  Fetching estimate line items...')
  const quoteLineRows = []
  let estCount = 0
  for (const est of hcpEstimates) {
    estCount++
    if (estCount % 50 === 0) process.stdout.write('  estimate line items ' + estCount + '/' + hcpEstimates.length + '...\r')

    const jsQuote = quoteByHcpEstId.get(est.id)
    if (!jsQuote) continue

    for (const opt of (est.options || [])) {
      // Try to get line items from the option
      let lineItems = opt.line_items || []

      // If no embedded line items, try API
      if (lineItems.length === 0 && opt.id) {
        try {
          const liData = await hcpGet('/estimates/' + est.id + '/options/' + opt.id + '/line_items')
          lineItems = liData.line_items || []
        } catch (e) {
          // Some estimates may not have accessible line items
        }
      }

      for (const li of lineItems) {
        const product = findProduct(li.name)
        quoteLineRows.push({
          company_id: CID,
          line_id: genId('QL'),
          quote_id: jsQuote.id,
          item_id: product ? product.id : null,
          item_name: li.name || 'Unnamed Item',
          quantity: li.quantity || 1,
          price: c2d(li.unit_price || li.unit_cost || 0),
          line_total: c2d((li.unit_price || 0) * (li.quantity || 1)),
          total: c2d((li.unit_price || 0) * (li.quantity || 1)),
        })
      }
    }
  }
  console.log('\n  Inserting ' + quoteLineRows.length + ' quote lines...')
  await insertBatch('quote_lines', quoteLineRows)
  console.log('  Done with quote lines')

  // Update leads with quote_id
  for (let i = 0; i < newLeads.length; i++) {
    const q = newQuotes[i]
    if (newLeads[i] && q) {
      await sb.from('leads').update({ quote_id: q.id }).eq('id', newLeads[i].id)
    }
  }

  // ── STEP 6: Pull jobs → jobs + job_lines ────────────────────
  console.log('\nSTEP 6: Pulling jobs from HCP...')
  const hcpJobs = await hcpGetAll('/jobs', 'jobs', 100)

  const jobRows = []
  const hcpJobToIdx = new Map()

  for (const job of hcpJobs) {
    const cust = findCustomer(job.customer)
    const custId = cust ? cust.id : null
    const custName = cust ? cust.name : (job.customer ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim() : 'Unknown')

    const assignedEmp = (job.assigned_employees && job.assigned_employees[0])
      ? empByHcpId.get(job.assigned_employees[0])
      : null

    // Try to link to a quote via original_estimate_id
    const linkedQuote = job.original_estimate_id ? quoteByHcpEstId.get(job.original_estimate_id) : null

    const idx = jobRows.length
    hcpJobToIdx.set(job.id, idx)

    jobRows.push({
      company_id: CID,
      job_id: genId('JOB'),
      customer_id: custId,
      customer_name: custName,
      email: cust ? cust.email : '',
      phone: cust ? cust.phone : '',
      address: cust ? cust.address : '',
      job_address: formatJobAddress(job.address),
      salesperson_id: assignedEmp ? assignedEmp.id : (defaultEmp ? defaultEmp.id : null),
      status: mapJobStatus(job.work_status),
      start_date: job.schedule ? job.schedule.scheduled_start : null,
      end_date: job.schedule ? job.schedule.scheduled_end : null,
      job_total: c2d(job.total_amount || 0),
      job_title: job.description || job.name || '',
      details: job.notes || '',
      notes: job.notes || '',
      service_type: 'Lighting',
      lead_source: job.lead_source || 'HouseCall Pro',
      quote_id: linkedQuote ? linkedQuote.id : null,
      invoice_status: job.invoice_status || 'Not Invoiced',
      created_at: job.created_at || new Date().toISOString(),
      _hcp_id: job.id, // temp
    })
  }

  // Strip temp fields and insert
  const cleanJobRows = jobRows.map(j => {
    const { _hcp_id, ...clean } = j
    return clean
  })

  console.log('  Inserting ' + cleanJobRows.length + ' jobs...')
  const newJobs = await insertBatch('jobs', cleanJobRows)
  console.log('  Inserted ' + newJobs.length + ' jobs')

  // Build HCP job id → JS job lookup
  const jobByHcpId = new Map()
  for (let i = 0; i < hcpJobs.length; i++) {
    const idx = hcpJobToIdx.get(hcpJobs[i].id)
    if (idx !== undefined && newJobs[idx]) {
      jobByHcpId.set(hcpJobs[i].id, newJobs[idx])
    }
  }

  // Fetch job line items
  console.log('  Fetching job line items...')
  const jobLineRows = []
  let jobCount = 0
  for (const job of hcpJobs) {
    jobCount++
    if (jobCount % 100 === 0) process.stdout.write('  job line items ' + jobCount + '/' + hcpJobs.length + '...\r')

    const jsJob = jobByHcpId.get(job.id)
    if (!jsJob) continue

    try {
      const liData = await hcpGet('/jobs/' + job.id + '/line_items')
      const lineItems = liData.line_items || []

      for (const li of lineItems) {
        const product = findProduct(li.name)
        jobLineRows.push({
          company_id: CID,
          job_line_id: genId('JL'),
          job_id: jsJob.id,
          item_id: product ? product.id : null,
          description: li.name || 'Unnamed Item',
          quantity: li.quantity || 1,
          price: c2d(li.unit_price || li.unit_cost || 0),
          total: c2d((li.unit_price || 0) * (li.quantity || 1)),
        })
      }
    } catch (e) {
      // Some jobs may not have line items endpoint
    }
  }
  console.log('\n  Inserting ' + jobLineRows.length + ' job lines...')
  await insertBatch('job_lines', jobLineRows)
  console.log('  Done with job lines')

  // ── STEP 7: Pull invoices + payments ────────────────────────
  console.log('\nSTEP 7: Pulling invoices from HCP...')
  const hcpInvoices = await hcpGetAll('/invoices', 'invoices', 100)

  const invoiceRows = []
  const paymentRows = []
  const hcpInvToIdx = new Map()

  for (const inv of hcpInvoices) {
    const cust = findCustomer(inv.customer)
    const custId = cust ? cust.id : null

    // Try to find the linked job
    const linkedJob = inv.job_id ? jobByHcpId.get(inv.job_id) : null

    const idx = invoiceRows.length
    hcpInvToIdx.set(inv.id, idx)

    // Calculate total paid from payments
    let totalPaid = 0
    for (const pmt of (inv.payments || [])) {
      if (pmt.status === 'succeeded') {
        totalPaid += pmt.amount || 0
      }
    }

    const invStatus = mapInvoiceStatus(inv.status)

    invoiceRows.push({
      company_id: CID,
      invoice_id: genId('INV'),
      customer_id: custId,
      job_id: linkedJob ? linkedJob.id : null,
      amount: c2d(inv.total_amount || 0),
      payment_status: invStatus,
      payment_method: '',
      job_description: inv.description || '',
      created_at: inv.created_at || new Date().toISOString(),
      _hcp_id: inv.id,
      _payments: inv.payments || [],
    })
  }

  // Strip temp fields and insert
  const cleanInvRows = invoiceRows.map(inv => {
    const { _hcp_id, _payments, ...clean } = inv
    return clean
  })

  console.log('  Inserting ' + cleanInvRows.length + ' invoices...')
  const newInvoices = await insertBatch('invoices', cleanInvRows)
  console.log('  Inserted ' + newInvoices.length + ' invoices')

  // Build HCP invoice id → JS invoice lookup
  const invByHcpId = new Map()
  for (let i = 0; i < hcpInvoices.length; i++) {
    const idx = hcpInvToIdx.get(hcpInvoices[i].id)
    if (idx !== undefined && newInvoices[idx]) {
      invByHcpId.set(hcpInvoices[i].id, newInvoices[idx])
    }
  }

  // Now insert payments
  console.log('  Processing payments...')
  for (let i = 0; i < hcpInvoices.length; i++) {
    const hcpInv = hcpInvoices[i]
    const jsInv = invByHcpId.get(hcpInv.id)
    if (!jsInv) continue

    for (const pmt of (hcpInv.payments || [])) {
      paymentRows.push({
        company_id: CID,
        payment_id: genId('PMT'),
        invoice_id: jsInv.id,
        amount: c2d(pmt.amount || 0),
        date: pmt.paid_at ? pmt.paid_at.split('T')[0] : (pmt.created_at ? pmt.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
        method: mapPaymentMethod(pmt.payment_method),
        status: mapPaymentStatus(pmt.status),
        notes: 'Migrated from HouseCall Pro',
      })
    }
  }

  console.log('  Inserting ' + paymentRows.length + ' payments...')
  await insertBatch('payments', paymentRows)
  console.log('  Done with payments')

  // ── STEP 8: Summary ─────────────────────────────────────────
  console.log('\n══════════════════════════════════════')
  console.log('  MIGRATION COMPLETE')
  console.log('══════════════════════════════════════')
  console.log('  Company: ' + company.company_name + ' (id=' + CID + ')')
  console.log('  Products:  ' + newProducts.length)
  console.log('  Employees: ' + newEmployees.length)
  console.log('  Customers: ' + newCustomers.length)
  console.log('  Leads:     ' + newLeads.length)
  console.log('  Quotes:    ' + newQuotes.length)
  console.log('  Quote Lines: ' + quoteLineRows.length)
  console.log('  Jobs:      ' + newJobs.length)
  console.log('  Job Lines: ' + jobLineRows.length)
  console.log('  Invoices:  ' + newInvoices.length)
  console.log('  Payments:  ' + paymentRows.length)
  console.log('══════════════════════════════════════')
}

// ── Address formatting helpers ──────────────────────────────────
function formatAddress(obj) {
  if (!obj) return ''
  if (typeof obj === 'string') return obj
  const parts = [
    obj.street || obj.street_line_1 || obj.address || '',
    obj.street_line_2 || '',
    obj.city || '',
    obj.state || '',
    obj.zip || obj.postal_code || '',
  ].filter(Boolean)
  return parts.join(', ')
}

function formatJobAddress(addr) {
  if (!addr) return ''
  if (typeof addr === 'string') return addr
  return formatAddress(addr)
}

run().catch(err => {
  console.error('MIGRATION FAILED:', err)
  process.exit(1)
})
