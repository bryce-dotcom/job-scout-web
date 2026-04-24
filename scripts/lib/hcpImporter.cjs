// Reusable single-customer HCP importer extracted from
// scripts/hcp_import_one_customer.cjs so the CLI script and the
// Vercel migrations cron worker can share one code path.
//
// Exports: importOneCustomer({ companyId, hcpCustomerId, hcpKey, sb,
//                              migrationJobId? })
//
// Returns: { counts, customerJsId, error? }
//
// All side effects (Supabase writes, HCP fetches, optional file uploads)
// happen via the supplied sb client + the supplied API key.

async function importOneCustomer({ companyId, hcpCustomerId, hcpKey, sb, migrationJobId }) {
  const CID = companyId
  const CUSTOMER_ID = hcpCustomerId
  const HCP_KEY = hcpKey
  const HCP_BASE = 'https://api.housecallpro.com'

  // ── helpers (closure over CID/sb/HCP_KEY) ──────────────────────
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
  const rand = (n=5) => Math.random().toString(36).slice(2, 2+n).toUpperCase()
  const shortId = (prefix) => `${prefix}-HCP-${rand(6)}`

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

  const counts = { customer: 0, leads: 0, quotes: 0, quote_lines: 0, jobs: 0, job_lines: 0, invoices: 0, payments: 0, attachments: 0, errors: [] }

  async function loadEmployees() {
    const { data } = await sb.from('employees').select('id, name, email, source_system, source_id').eq('company_id', CID)
    const byHcp = new Map(), byEmail = new Map()
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
      company_id: CID, source_system: 'hcp', source_id: c.id,
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
    const { data: existing } = await sb.from('customers').select('id, customer_id')
      .eq('company_id', CID).eq('source_system', 'hcp').eq('source_id', c.id).maybeSingle()
    if (existing) row.customer_id = existing.customer_id
    const saved = await upsert('customers', row)
    counts.customer++
    return { hcp: c, js: saved }
  }

  function lineRow({ table, parentKey, parentId, hcpLine, sortOrder, srcSystem, srcIdPrefix }) {
    const name = hcpLine.name || 'Unnamed Item'
    const description = hcpLine.description || ''
    const qty = Number(hcpLine.quantity || 1)
    const unitPrice = c2d(hcpLine.unit_price || 0)
    const total = c2d((hcpLine.unit_price || 0) * qty)
    return {
      company_id: CID,
      source_system: srcSystem, source_id: `${srcIdPrefix}:${hcpLine.id}`,
      [parentKey]: parentId,
      [table === 'quote_lines' ? 'line_id' : 'job_line_id']: shortId(table === 'quote_lines' ? 'QL' : 'JL'),
      item_name: name, description, quantity: qty, price: unitPrice, total,
      ...(table === 'quote_lines' ? { line_total: total, sort_order: sortOrder } : {}),
      labor_cost: c2d(hcpLine.unit_cost || 0),
      kind: hcpLine.kind || null,
      taxable: hcpLine.taxable === true,
      unit_of_measure: hcpLine.unit_of_measure || null,
    }
  }

  async function importEstimates(custJs, custHcpId, employees) {
    const ests = (await hcp(`/estimates?customer_id=${custHcpId}&page_size=200`))?.estimates || []
    const quoteByEstId = new Map()
    for (const est of ests) {
      const optsTotal = (est.options || []).reduce((s, o) => s + (o.total_amount || o.total || 0), 0)
      const assignedEmp = est.assigned_employees && est.assigned_employees[0]
        ? employees.byHcp.get(est.assigned_employees[0]) : null

      const leadRow = {
        company_id: CID, source_system: 'hcp', source_id: 'est:' + est.id,
        lead_id: shortId('LEAD'),
        customer_id: custJs.id, customer_name: custJs.name,
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

      const quoteRow = {
        company_id: CID, source_system: 'hcp', source_id: est.id,
        quote_id: shortId('EST'),
        customer_id: custJs.id, lead_id: lead.id,
        salesperson_id: assignedEmp?.id || null,
        quote_amount: c2d(optsTotal),
        status: ({ 'needs scheduling':'Draft','scheduled':'Sent','in progress':'Sent','complete':'Sent','on hold':'Draft','canceled':'Rejected' })[est.work_status] || 'Draft',
        service_type: 'Lighting', notes: est.message || '',
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

      await sb.from('quote_lines').delete().eq('quote_id', quote.id).eq('source_system','hcp')
      let sort = 0
      for (const opt of (est.options || [])) {
        let lis = opt.line_items || []
        if (!lis.length && opt.id) {
          const r = await hcp(`/estimates/${est.id}/options/${opt.id}/line_items`)
          lis = r?.line_items || []
        }
        for (const li of lis) {
          const row = lineRow({ table: 'quote_lines', parentKey: 'quote_id', parentId: quote.id, hcpLine: li, sortOrder: sort++, srcSystem: 'hcp', srcIdPrefix: 'opt-line' })
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
    for (const j of jobs) {
      const assignedEmp = j.assigned_employees && j.assigned_employees[0]
        ? employees.byHcp.get(j.assigned_employees[0]) : null
      const linkedQuote = j.original_estimate_id ? quoteByEstId.get(j.original_estimate_id) : null

      const jobRow = {
        company_id: CID, source_system: 'hcp', source_id: j.id,
        job_id: shortId('JOB'),
        customer_id: custJs.id, customer_name: custJs.name,
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

      await sb.from('job_lines').delete().eq('job_id', job.id).eq('source_system','hcp')
      let lis = (await hcp(`/jobs/${j.id}/line_items`))?.line_items || []
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
        if (optLis.length) { lis = optLis; copiedFromEstimate = true }
      }
      let sort = 0
      for (const li of lis) {
        const row = lineRow({ table: 'job_lines', parentKey: 'job_id', parentId: job.id, hcpLine: li, sortOrder: sort++, srcSystem: 'hcp', srcIdPrefix: copiedFromEstimate ? 'opt-line-copied' : 'job-line' })
        const { error } = await sb.from('job_lines').insert(row)
        if (error) { counts.errors.push(`job_line: ${error.message}`); continue }
        counts.job_lines++
      }
    }
    return jobs
  }

  async function importInvoices(custJs, hcpJobs) {
    const invs = []
    for (const j of (hcpJobs || [])) {
      const r = await hcp(`/jobs/${j.id}/invoices`)
      for (const inv of (r?.invoices || [])) invs.push({ ...inv, _job_hcp_id: j.id })
    }
    for (const inv of invs) {
      let jobJsId = null
      const jobHcpId = inv._job_hcp_id || inv.job_id
      if (jobHcpId) {
        const { data: jobMatch } = await sb.from('jobs').select('id').eq('company_id', CID)
          .eq('source_system','hcp').eq('source_id', jobHcpId).maybeSingle()
        jobJsId = jobMatch?.id || null
      }
      const row = {
        company_id: CID, source_system: 'hcp', source_id: inv.id,
        invoice_id: shortId('INV'),
        customer_id: custJs.id, job_id: jobJsId,
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

      const pays = (await hcp(`/invoices/${inv.id}/payments`))?.payments || []
      for (const p of pays) {
        const prow = {
          company_id: CID, source_system: 'hcp', source_id: p.id,
          payment_id: shortId('PAY'),
          invoice_id: saved.id, customer_id: custJs.id, job_id: jobJsId,
          amount: c2d(p.amount || 0),
          date: p.created_at || p.paid_at || new Date().toISOString().slice(0,10),
          method: ({ 'cash':'Cash','check':'Check','credit_card':'Credit Card','ach':'ACH','financing':'Financing','other':'Other' })[(p.payment_method||'').toLowerCase()] || 'Other',
          status: 'Completed', source: 'manual',
        }
        const existingP = await sb.from('payments').select('id, payment_id').eq('company_id', CID)
          .eq('source_system','hcp').eq('source_id', p.id).maybeSingle()
        if (existingP.data) prow.payment_id = existingP.data.payment_id
        try { await upsert('payments', prow); counts.payments++ }
        catch (e) { counts.errors.push(`payment: ${e.message}`) }
      }
    }
  }

  // ── main ─────────────────────────────────────────────────────────
  try {
    const employees = await loadEmployees()
    const cust = await importCustomer()
    const quoteByEstId = await importEstimates(cust.js, cust.hcp.id, employees)
    const hcpJobs = await importJobs(cust.js, cust.hcp.id, employees, quoteByEstId)
    await importInvoices(cust.js, hcpJobs)
    return { counts, customerJsId: cust.js.id }
  } catch (e) {
    return { counts, error: e.message }
  }
}

module.exports = { importOneCustomer }
