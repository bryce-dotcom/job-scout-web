const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'

async function hcpGet(path) {
  const res = await fetch(BASE + path, {
    headers: { 'Authorization': 'Token ' + KEY, 'Accept': 'application/json' }
  })
  return res.json()
}

async function run() {
  // === JOB STATUSES ===
  console.log('=== SAMPLING JOB STATUSES & FIELDS ===')
  const jobStatuses = {}
  const jobFields = { has_schedule: 0, has_employees: 0, has_estimate: 0, has_notes: 0 }
  for (let p = 1; p <= 10; p++) {
    const data = await hcpGet('/jobs?page=' + p + '&page_size=200')
    if (!data.jobs || data.jobs.length === 0) break
    for (const j of data.jobs) {
      jobStatuses[j.work_status] = (jobStatuses[j.work_status] || 0) + 1
      if (j.schedule && j.schedule.scheduled_start) jobFields.has_schedule++
      if (j.assigned_employees && j.assigned_employees.length > 0) jobFields.has_employees++
      if (j.original_estimate_id) jobFields.has_estimate++
      if (j.notes && j.notes.length > 0) jobFields.has_notes++
    }
    process.stdout.write('  jobs page ' + p + '...\r')
  }
  console.log('\nJob work_status values:')
  Object.entries(jobStatuses).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))
  console.log('Job fields present:', jobFields)

  // === ESTIMATE STATUSES ===
  console.log('\n=== SAMPLING ESTIMATE STATUSES ===')
  const estStatuses = {}
  const estOptionStatuses = {}
  const estApprovalStatuses = {}
  for (let p = 1; p <= 8; p++) {
    const data = await hcpGet('/estimates?page=' + p + '&page_size=200')
    if (!data.estimates || data.estimates.length === 0) break
    for (const e of data.estimates) {
      estStatuses[e.work_status] = (estStatuses[e.work_status] || 0) + 1
      for (const opt of (e.options || [])) {
        estOptionStatuses[opt.status] = (estOptionStatuses[opt.status] || 0) + 1
        if (opt.approval_status) {
          estApprovalStatuses[opt.approval_status] = (estApprovalStatuses[opt.approval_status] || 0) + 1
        }
      }
    }
    process.stdout.write('  estimates page ' + p + '...\r')
  }
  console.log('\nEstimate work_status values:')
  Object.entries(estStatuses).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))
  console.log('Estimate option status values:')
  Object.entries(estOptionStatuses).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))
  console.log('Estimate approval_status values:')
  Object.entries(estApprovalStatuses).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))

  // === INVOICE STATUSES ===
  console.log('\n=== SAMPLING INVOICE STATUSES ===')
  const invStatuses = {}
  const paymentMethods = {}
  const paymentStatuses = {}
  let totalPayments = 0
  let totalPaidAmount = 0
  for (let p = 1; p <= 10; p++) {
    const data = await hcpGet('/invoices?page=' + p + '&page_size=200')
    if (!data.invoices || data.invoices.length === 0) break
    for (const inv of data.invoices) {
      invStatuses[inv.status] = (invStatuses[inv.status] || 0) + 1
      for (const pmt of (inv.payments || [])) {
        paymentStatuses[pmt.status] = (paymentStatuses[pmt.status] || 0) + 1
        paymentMethods[pmt.payment_method || 'unknown'] = (paymentMethods[pmt.payment_method || 'unknown'] || 0) + 1
        if (pmt.status === 'succeeded') {
          totalPayments++
          totalPaidAmount += pmt.amount || 0
        }
      }
    }
    process.stdout.write('  invoices page ' + p + '...\r')
  }
  console.log('\nInvoice status values:')
  Object.entries(invStatuses).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))
  console.log('Payment statuses:')
  Object.entries(paymentStatuses).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))
  console.log('Payment methods:')
  Object.entries(paymentMethods).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))
  console.log('Total succeeded payments:', totalPayments, '= $' + (totalPaidAmount / 100).toFixed(2))

  // === CUSTOMER TAGS (as potential status) ===
  console.log('\n=== CUSTOMER TAGS ===')
  const custTags = {}
  const leadSources = {}
  for (let p = 1; p <= 5; p++) {
    const data = await hcpGet('/customers?page=' + p + '&page_size=200')
    if (!data.customers || data.customers.length === 0) break
    for (const c of data.customers) {
      for (const t of (c.tags || [])) {
        custTags[t] = (custTags[t] || 0) + 1
      }
      if (c.lead_source) leadSources[c.lead_source] = (leadSources[c.lead_source] || 0) + 1
    }
  }
  console.log('Customer tags:')
  Object.entries(custTags).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))
  console.log('Lead sources:')
  Object.entries(leadSources).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('  ' + s + ': ' + c))

  // === SAMPLE JOB WITH TIMESTAMPS ===
  console.log('\n=== SAMPLE JOBS WITH TIMESTAMPS ===')
  const { jobs } = await hcpGet('/jobs?page=3&page_size=5')
  for (const j of jobs) {
    console.log('Job', j.invoice_number, '|', j.work_status,
      '| created:', j.created_at,
      '| scheduled:', j.schedule?.scheduled_start || 'none',
      '| started:', j.work_timestamps?.started_at || 'none',
      '| completed:', j.work_timestamps?.completed_at || 'none',
      '| canceled:', j.canceled_at || 'none',
      '| total: $' + ((j.total_amount || 0) / 100).toFixed(2),
      '| balance: $' + ((j.outstanding_balance || 0) / 100).toFixed(2))
  }
}

run().catch(console.error)
