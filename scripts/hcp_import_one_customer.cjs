// Single-customer HCP importer with full line-item fidelity.
//
// Why this exists: hcp-migrate.cjs was a one-shot bulk migrator that
// dropped HCP line-item `description`, `kind`, `taxable`, and didn't
// store source ids — making re-import non-idempotent and backfill
// impossible. This script:
//
//   - Imports ONE customer at a time (you pass HCP customer id)
//   - Upserts on (company_id, source_system='hcp', source_id) so re-runs
//     update existing rows instead of duplicating
//   - Captures line-item description, kind, taxable, unit_of_measure,
//     unit_cost (was the Juan Diego "no details" bug)
//   - Copies estimate option line_items onto the linked job's job_lines
//     when the job's own /line_items endpoint is empty (HCP common case
//     where job detail lives on the original estimate)
//   - Pulls attachments and uploads them to project-documents bucket
//     with a file_attachments row per file
//   - Records counts to migration_jobs so we have a trust report
//
// Usage:
//   node scripts/hcp_import_one_customer.cjs <HCP_CUSTOMER_ID> [COMPANY_ID]
//
// Defaults company to env COMPANY_ID or 5 (HHH).

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HCP_KEY = process.env.HCP_API_KEY || '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'

const CUSTOMER_ID = process.argv[2]
const CID = parseInt(process.argv[3] || process.env.COMPANY_ID || '5', 10)

if (!CUSTOMER_ID) {
  console.error('Usage: node scripts/hcp_import_one_customer.cjs <HCP_CUSTOMER_ID> [COMPANY_ID]')
  process.exit(1)
}

// ── HCP helper with rate-limit retry ─────────────────────────────
async function hcp(path, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(HCP_BASE + path, { headers: { Authorization: 'Token ' + HCP_KEY, Accept: 'application/json' } })
    if (r.status === 429) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 30000)
      await new Promise(res => setTimeout(res, wait))
      continue
    }
    if (r.status === 404) return null
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`HCP ${r.status} ${path}: ${t.slice(0, 200)}`)
    }
    return r.json()
  }
  throw new Error('Rate limit exceeded on ' + path)
}

const c2d = (cents) => cents ? Number((cents / 100).toFixed(2)) : 0
const fmtAddr = (a) => a ? [a.street, a.street_line_2, a.city, a.state, a.zip].filter(Boolean).join(', ') : ''

// Manual upsert keyed by (company_id, source_system, source_id).
// We can't use Postgres ON CONFLICT because the source-id unique index
// is partial (WHERE source_id IS NOT NULL) and PostgREST upsert
// requires a full unique constraint. Two-trip is fine for per-customer
// import volumes.
async function upsert(table, row) {
  const { data: existing, error: selErr } = await sb.from(table)
    .select('id').eq('company_id', row.company_id)
    .eq('source_system', row.source_system).eq('source_id', row.source_id)
    .maybeSingle()
  if (selErr) throw new Error(`upsert select ${table}: ${selErr.message}`)
  if (existing) {
    const { data, error } = await sb.from(table).update(row).eq('id', existing.id).select().single()
    if (error) throw new Error(`upsert update ${table}: ${error.message}`)
    return data
  }
  const { data, error } = await sb.from(table).insert(row).select().single()
  if (error) throw new Error(`upsert insert ${table}: ${error.message}`)
  return data
}

// Random short id for human-friendly *_id columns. We don't use the
// HCP id directly because the existing UI expects short codes like
// CUST-HCP-00001 in customer_id. Source identity lives in source_id.
const rand = (n=5) => Math.random().toString(36).slice(2, 2+n).toUpperCase()
const shortId = (prefix) => `${prefix}-HCP-${rand(6)}`

const counts = { customer: 0, employees: 0, leads: 0, quotes: 0, quote_lines: 0, jobs: 0, job_lines: 0, invoices: 0, payments: 0, attachments: 0, errors: [] }

async function ensureMigrationJob() {
  const { data } = await sb.from('migration_jobs').insert({
    company_id: CID, source: 'hcp', status: 'running', started_at: new Date().toISOString(),
  }).select().single()
  return data?.id
}

async function finishMigrationJob(jobId, status, error) {
  await sb.from('migration_jobs').update({
    status, error: error || null, finished_at: new Date().toISOString(), counts,
  }).eq('id', jobId)
}

async function loadEmployees() {
  // Pull existing JS employees for this company so we can resolve
  // HCP assigned_employees → JS salesperson_id without re-creating.
  const { data } = await sb.from('employees').select('id, name, email, source_system, source_id').eq('company_id', CID)
  const byHcp = new Map()
  const byEmail = new Map()
  for (const e of data || []) {
    if (e.source_system === 'hcp' && e.source_id) byHcp.set(e.source_id, e)
    if (e.email) byEmail.set(e.email.toLowerCase(), e)
  }
  return { list: data || [], byHcp, byEmail }
}

async function importCustomer() {
  const c = await hcp('/customers/' + CUSTOMER_ID)
  if (!c) throw new Error('HCP customer not found: ' + CUSTOMER_ID)
  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.company || 'Unknown'
  const row = {
    company_id: CID,
    source_system: 'hcp', source_id: c.id,
    customer_id: shortId('CUST'),
    name,
    email: c.email || (c.emails && c.emails[0] && c.emails[0].address) || '',
    phone: c.mobile_number || (c.phones && c.phones[0] && c.phones[0].number) || '',
    address: fmtAddr(c.addresses && c.addresses[0]) || '',
    business_name: c.company || '',
    notes: c.notes || '',
    tags: (c.tags || []).join(', '),
    status: 'Active',
  }
  // Upsert needs customer_id NOT to overwrite if already set; do an
  // existence check first so we don't churn the human-readable id.
  const { data: existing } = await sb.from('customers').select('id, customer_id')
    .eq('company_id', CID).eq('source_system', 'hcp').eq('source_id', c.id).maybeSingle()
  if (existing) {
    row.customer_id = existing.customer_id  // preserve
  }
  const saved = await upsert('customers', row)
  counts.customer++
  console.log('  customer:', saved.id, name)
  return { hcp: c, js: saved }
}

// Upsert a line item. Caller passes the parent (quote or job) JS id and
// the HCP line-item with all its fields preserved.
function lineRow({ table, parentKey, parentId, hcpLine, sortOrder, srcSystem, srcIdPrefix }) {
  const name = hcpLine.name || 'Unnamed Item'
  const description = hcpLine.description || ''
  const qty = Number(hcpLine.quantity || 1)
  const unitPrice = c2d(hcpLine.unit_price || 0)
  const total = c2d((hcpLine.unit_price || 0) * qty)
  return {
    company_id: CID,
    source_system: srcSystem,
    source_id: `${srcIdPrefix}:${hcpLine.id}`,  // namespace so estimate vs job lines don't collide
    [parentKey]: parentId,
    [table === 'quote_lines' ? 'line_id' : 'job_line_id']: shortId(table === 'quote_lines' ? 'QL' : 'JL'),
    item_name: name,
    description,
    quantity: qty,
    price: unitPrice,
    total,
    ...(table === 'quote_lines' ? { line_total: total, sort_order: sortOrder } : {}),
    labor_cost: c2d(hcpLine.unit_cost || 0),
    kind: hcpLine.kind || null,
    taxable: hcpLine.taxable === true,
    unit_of_measure: hcpLine.unit_of_measure || null,
  }
}

async function importEstimates(custJs, custHcpId, employees) {
  // Pull all estimates for this customer
  const ests = (await hcp(`/estimates?customer_id=${custHcpId}&page_size=200`))?.estimates || []
  console.log(`  estimates: ${ests.length}`)
  const quoteByEstId = new Map()

  for (const est of ests) {
    const optsTotal = (est.options || []).reduce((s, o) => s + (o.total_amount || o.total || 0), 0)
    const assignedEmp = est.assigned_employees && est.assigned_employees[0]
      ? employees.byHcp.get(est.assigned_employees[0]) : null

    // Lead row (idempotent on source key)
    const leadRow = {
      company_id: CID,
      source_system: 'hcp', source_id: 'est:' + est.id,
      lead_id: shortId('LEAD'),
      customer_id: custJs.id,
      customer_name: custJs.name,
      email: custJs.email, phone: custJs.phone, address: custJs.address,
      service_type: 'Lighting',
      lead_source: est.lead_source || 'HouseCall Pro',
      status: est.work_status === 'complete' ? 'Sold' : (est.work_status === 'canceled' ? 'Lost' : 'New'),
      notes: est.message || '',
      created_date: est.created_at, created_at: est.created_at,
      quote_generated: true,
    }
    const existingLead = await sb.from('leads').select('id, lead_id').eq('company_id', CID)
      .eq('source_system','hcp').eq('source_id','est:'+est.id).maybeSingle()
    if (existingLead.data) leadRow.lead_id = existingLead.data.lead_id
    const lead = await upsert('leads', leadRow)
    counts.leads++

    // Quote
    const quoteRow = {
      company_id: CID,
      source_system: 'hcp', source_id: est.id,
      quote_id: shortId('EST'),
      customer_id: custJs.id,
      lead_id: lead.id,
      salesperson_id: assignedEmp?.id || null,
      quote_amount: c2d(optsTotal),
      status: ({ 'needs scheduling':'Draft','scheduled':'Sent','in progress':'Sent','complete':'Sent','on hold':'Draft','canceled':'Rejected' })[est.work_status] || 'Draft',
      service_type: 'Lighting',
      notes: est.message || '',
      created_at: est.created_at,
      estimate_name: est.estimate_number ? `Estimate #${est.estimate_number}` : null,
      summary: est.description || '',
    }
    const existingQuote = await sb.from('quotes').select('id, quote_id').eq('company_id', CID)
      .eq('source_system','hcp').eq('source_id', est.id).maybeSingle()
    if (existingQuote.data) quoteRow.quote_id = existingQuote.data.quote_id
    const quote = await upsert('quotes', quoteRow)
    counts.quotes++
    quoteByEstId.set(est.id, quote)

    // Wipe existing source-tagged quote_lines for this quote so we can
    // cleanly re-insert (cheaper than upsert-per-line for typical sizes).
    await sb.from('quote_lines').delete().eq('quote_id', quote.id).eq('source_system','hcp')

    // Line items per option
    let sort = 0
    for (const opt of (est.options || [])) {
      let lis = opt.line_items || []
      if (!lis.length && opt.id) {
        const r = await hcp(`/estimates/${est.id}/options/${opt.id}/line_items`)
        lis = r?.line_items || []
      }
      for (const li of lis) {
        const row = lineRow({
          table: 'quote_lines', parentKey: 'quote_id', parentId: quote.id,
          hcpLine: li, sortOrder: sort++, srcSystem: 'hcp', srcIdPrefix: 'opt-line',
        })
        const { error } = await sb.from('quote_lines').insert(row)
        if (error) { counts.errors.push(`quote_line: ${error.message}`); continue }
        counts.quote_lines++
      }
    }
  }
  return quoteByEstId
}

async function importJobs(custJs, custHcpId, employees, quoteByEstId) {
  const jobs = (await hcp(`/jobs?customer_id=${custHcpId}&page_size=200`))?.jobs || []
  console.log(`  jobs: ${jobs.length}`)

  for (const j of jobs) {
    const assignedEmp = j.assigned_employees && j.assigned_employees[0]
      ? employees.byHcp.get(j.assigned_employees[0]) : null
    const linkedQuote = j.original_estimate_id ? quoteByEstId.get(j.original_estimate_id) : null

    const jobRow = {
      company_id: CID,
      source_system: 'hcp', source_id: j.id,
      job_id: shortId('JOB'),
      customer_id: custJs.id,
      customer_name: custJs.name,
      email: custJs.email, phone: custJs.phone, address: custJs.address,
      job_address: fmtAddr(j.address) || custJs.address,
      salesperson_id: assignedEmp?.id || null,
      status: ({ 'needs scheduling':'Chillin','scheduled':'Scheduled','in progress':'In Progress','complete':'Completed','complete rated':'Completed','complete unrated':'Completed','on hold':'On Hold','canceled':'Cancelled','unscheduled':'Chillin' })[(j.work_status||'').toLowerCase()] || 'Chillin',
      start_date: j.schedule?.scheduled_start || null,
      end_date: j.schedule?.scheduled_end || null,
      job_total: c2d(j.total_amount || 0),
      job_title: j.description || j.name || '',
      details: j.description || '',
      notes: typeof j.notes === 'string' ? j.notes : (Array.isArray(j.notes) ? j.notes.map(n => n.content || n.text || '').filter(Boolean).join('\n') : ''),
      service_type: 'Lighting',
      lead_source: j.lead_source || 'HouseCall Pro',
      quote_id: linkedQuote?.id || null,
      invoice_status: j.invoice_status || 'Not Invoiced',
      created_at: j.created_at || new Date().toISOString(),
    }
    const existingJob = await sb.from('jobs').select('id, job_id').eq('company_id', CID)
      .eq('source_system','hcp').eq('source_id', j.id).maybeSingle()
    if (existingJob.data) jobRow.job_id = existingJob.data.job_id
    const job = await upsert('jobs', jobRow)
    counts.jobs++

    // Wipe + re-insert source-tagged job_lines for clean re-runs
    await sb.from('job_lines').delete().eq('job_id', job.id).eq('source_system','hcp')

    // Try the job's own line items first
    let lis = (await hcp(`/jobs/${j.id}/line_items`))?.line_items || []

    // FALLBACK — if job has no lines but links to an estimate,
    // copy that estimate's option line_items so the job page shows
    // the work breakdown. This is the Juan Diego case: HCP jobs
    // are stubs, the detail lives on the estimate.
    let copiedFromEstimate = false
    if (!lis.length && j.original_estimate_id) {
      const est = await hcp('/estimates/' + j.original_estimate_id)
      const optLis = []
      for (const opt of (est?.options || [])) {
        let l = opt.line_items || []
        if (!l.length && opt.id) {
          const r = await hcp(`/estimates/${j.original_estimate_id}/options/${opt.id}/line_items`)
          l = r?.line_items || []
        }
        optLis.push(...l)
      }
      if (optLis.length) {
        lis = optLis
        copiedFromEstimate = true
      }
    }

    let sort = 0
    for (const li of lis) {
      const row = lineRow({
        table: 'job_lines', parentKey: 'job_id', parentId: job.id,
        hcpLine: li, sortOrder: sort++,
        srcSystem: 'hcp',
        srcIdPrefix: copiedFromEstimate ? 'opt-line-copied' : 'job-line',
      })
      const { error } = await sb.from('job_lines').insert(row)
      if (error) { counts.errors.push(`job_line: ${error.message}`); continue }
      counts.job_lines++
    }

    // Attachments — best-effort. HCP attachments endpoint returns 404
    // for jobs without files, which `hcp()` handles by returning null.
    try {
      const att = await hcp(`/jobs/${j.id}/attachments`)
      const files = att?.attachments || []
      for (const a of files) {
        const url = a.url || a.download_url
        if (!url) continue
        // Download the file and push to project-documents bucket
        const fileResp = await fetch(url)
        if (!fileResp.ok) { counts.errors.push(`attachment ${a.id}: download ${fileResp.status}`); continue }
        const blob = await fileResp.arrayBuffer()
        const filename = a.file_name || a.name || `hcp-${a.id}`
        const path = `hcp/${CID}/${j.id}/${a.id}-${filename}`
        const { error: upErr } = await sb.storage.from('project-documents').upload(path, Buffer.from(blob), { upsert: true, contentType: a.content_type || 'application/octet-stream' })
        if (upErr) { counts.errors.push(`attachment ${a.id}: ${upErr.message}`); continue }
        await sb.from('file_attachments').insert({
          company_id: CID, job_id: job.id,
          file_name: filename, file_path: path,
          file_type: a.content_type || null,
          file_size: a.size || null,
          storage_bucket: 'project-documents',
        })
        counts.attachments++
      }
    } catch (e) { counts.errors.push(`attachments job ${j.id}: ${e.message}`) }
  }
  return jobs
}

async function importInvoices(custJs, custHcpId, hcpJobs) {
  // HCP /invoices?customer_id=X DOES NOT FILTER — verified, it returns
  // all invoices in the account. Use the per-job endpoint instead so we
  // only import invoices that actually belong to this customer.
  const invs = []
  for (const j of (hcpJobs || [])) {
    const r = await hcp(`/jobs/${j.id}/invoices`)
    for (const inv of (r?.invoices || [])) invs.push({ ...inv, _job_hcp_id: j.id })
  }
  console.log(`  invoices: ${invs.length}`)
  for (const inv of invs) {
    // Find linked job by source id
    let jobJsId = null
    const jobHcpId = inv._job_hcp_id || inv.job_id
    if (jobHcpId) {
      const { data: jobMatch } = await sb.from('jobs').select('id').eq('company_id', CID)
        .eq('source_system','hcp').eq('source_id', jobHcpId).maybeSingle()
      jobJsId = jobMatch?.id || null
    }
    const row = {
      company_id: CID,
      source_system: 'hcp', source_id: inv.id,
      invoice_id: shortId('INV'),
      customer_id: custJs.id,
      job_id: jobJsId,
      amount: c2d(inv.total_amount || 0),
      payment_status: ({ 'new':'Pending','due':'Pending','overdue':'Overdue','paid':'Paid','partial':'Partial','void':'Void','closed':'Paid','open':'Pending','pending':'Pending' })[(inv.status||'').toLowerCase()] || 'Pending',
      payment_method: 'Other',
      job_description: inv.description || '',
      created_at: inv.created_at,
      due_date: inv.due_date || null,
    }
    const existing = await sb.from('invoices').select('id, invoice_id').eq('company_id', CID)
      .eq('source_system','hcp').eq('source_id', inv.id).maybeSingle()
    if (existing.data) row.invoice_id = existing.data.invoice_id
    const saved = await upsert('invoices', row)
    counts.invoices++

    // Payments under this invoice
    const pays = (await hcp(`/invoices/${inv.id}/payments`))?.payments || []
    for (const p of pays) {
      const prow = {
        company_id: CID,
        source_system: 'hcp', source_id: p.id,
        payment_id: shortId('PAY'),
        invoice_id: saved.id,
        customer_id: custJs.id,
        job_id: jobJsId,
        amount: c2d(p.amount || 0),
        date: p.created_at || p.paid_at || new Date().toISOString().slice(0,10),
        method: ({ 'cash':'Cash','check':'Check','credit_card':'Credit Card','ach':'ACH','financing':'Financing','other':'Other' })[(p.payment_method||'').toLowerCase()] || 'Other',
        status: 'Completed',
        source: 'manual',
      }
      const existingP = await sb.from('payments').select('id, payment_id').eq('company_id', CID)
        .eq('source_system','hcp').eq('source_id', p.id).maybeSingle()
      if (existingP.data) prow.payment_id = existingP.data.payment_id
      try { await upsert('payments', prow); counts.payments++ }
      catch (e) { counts.errors.push(`payment: ${e.message}`) }
    }
  }
}

// Best-effort link from jobs to quotes when HCP didn't give us
// original_estimate_id. Strategy: for each unlinked job in this
// customer, find the customer's quote with closest amount (within
// 15% or $500) — if there's a single best match, set quote_id and
// copy its lines into job_lines so the job page shows the breakdown.
async function linkOrphanJobsToQuotes(custJs) {
  const { data: jobs } = await sb.from('jobs').select('id, job_total, quote_id, job_title, source_id')
    .eq('company_id', CID).eq('customer_id', custJs.id).is('quote_id', null)
  if (!jobs?.length) return
  const { data: quotes } = await sb.from('quotes').select('id, quote_amount, summary, status')
    .eq('company_id', CID).eq('customer_id', custJs.id).gt('quote_amount', 0)
  if (!quotes?.length) return
  console.log(`  linking orphan jobs: ${jobs.length} job(s), ${quotes.length} quote(s) available`)

  for (const job of jobs) {
    const jt = Number(job.job_total) || 0
    if (jt <= 0) continue
    // Score every quote by amount proximity
    const ranked = quotes
      .map(q => ({ q, delta: Math.abs((Number(q.quote_amount) || 0) - jt) }))
      .sort((a, b) => a.delta - b.delta)
    const best = ranked[0]
    const second = ranked[1]
    const tolerance = Math.max(jt * 0.15, 500)
    // Only auto-link if clearly the best (delta within tolerance AND
    // notably better than second-best)
    if (!best || best.delta > tolerance) continue
    if (second && (second.delta - best.delta) < tolerance * 0.25) continue

    await sb.from('jobs').update({ quote_id: best.q.id }).eq('id', job.id)
    // Copy quote lines → job lines (clear existing source-tagged copies first)
    await sb.from('job_lines').delete().eq('job_id', job.id).eq('source_system', 'hcp')
    const { data: ql } = await sb.from('quote_lines').select('item_name, description, quantity, price, kind, taxable, unit_of_measure, labor_cost, sort_order, source_id')
      .eq('quote_id', best.q.id)
    for (const l of (ql || [])) {
      const { error } = await sb.from('job_lines').insert({
        company_id: CID,
        source_system: 'hcp', source_id: 'autolinked:' + job.id + ':' + l.source_id,
        job_id: job.id,
        job_line_id: shortId('JL'),
        item_name: l.item_name, description: l.description,
        quantity: l.quantity, price: l.price,
        total: Number(l.quantity || 1) * Number(l.price || 0),
        labor_cost: l.labor_cost, kind: l.kind, taxable: l.taxable,
        unit_of_measure: l.unit_of_measure,
      })
      if (error) counts.errors.push(`autolink job_line: ${error.message}`)
      else counts.job_lines++
    }
    console.log(`    linked job ${job.id} → quote ${best.q.id} (Δ$${best.delta.toFixed(2)})`)
  }
}

(async () => {
  console.log(`\n=== HCP customer import: ${CUSTOMER_ID} → company ${CID} ===\n`)
  const jobId = await ensureMigrationJob()
  try {
    const employees = await loadEmployees()
    console.log(`  loaded ${employees.list.length} JS employees`)
    const cust = await importCustomer()
    const quoteByEstId = await importEstimates(cust.js, cust.hcp.id, employees)
    const hcpJobs = await importJobs(cust.js, cust.hcp.id, employees, quoteByEstId)
    await importInvoices(cust.js, cust.hcp.id, hcpJobs)
    await linkOrphanJobsToQuotes(cust.js)
    await finishMigrationJob(jobId, 'completed')
    console.log('\n=== DONE ===')
    console.log(JSON.stringify(counts, null, 2))
  } catch (e) {
    console.error('FAILED:', e)
    await finishMigrationJob(jobId, 'failed', e.message)
    process.exit(1)
  }
})()
