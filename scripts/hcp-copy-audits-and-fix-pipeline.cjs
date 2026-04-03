const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 5
const OLD = 3

async function getAllRows(table, filter, cols = '*') {
  const all = []
  let from = 0
  while (true) {
    let q = sb.from(table).select(cols).range(from, from + 999).order('id')
    if (typeof filter === 'object') {
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
    } else {
      q = q.eq('company_id', filter)
    }
    const { data, error } = await q
    if (error) { console.log('  Error on ' + table + ':', error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function run() {
  console.log('=== Copy Audits & Fix Pipeline for Company ' + CID + ' ===\n')

  // ══════════════════════════════════════════════════════════
  // 1. COPY LIGHTING AUDITS from C3 → C5
  // ══════════════════════════════════════════════════════════
  console.log('1. LIGHTING AUDITS')

  const c3Audits = await getAllRows('lighting_audits', OLD)
  const c5Audits = await getAllRows('lighting_audits', CID)
  console.log('  C3 audits: ' + c3Audits.length)
  console.log('  C5 audits: ' + c5Audits.length)

  if (c5Audits.length === 0 && c3Audits.length > 0) {
    // Build lead name mapping: C3 lead → C5 lead
    const c3Leads = await getAllRows('leads', OLD, 'id, customer_name')
    const c5Leads = await getAllRows('leads', CID, 'id, customer_name')
    const c5LeadByName = new Map()
    for (const l of c5Leads) {
      if (l.customer_name) c5LeadByName.set(l.customer_name.toLowerCase().trim(), l.id)
    }

    // Build customer mapping
    const c3Custs = await getAllRows('customers', OLD, 'id, name')
    const c5Custs = await getAllRows('customers', CID, 'id, name')
    const c5CustByName = new Map()
    for (const c of c5Custs) {
      if (c.name) c5CustByName.set(c.name.toLowerCase().trim(), c.id)
    }

    // Build job mapping (C3 job → C5 job by customer_name + job_total)
    const c3Jobs = await getAllRows('jobs', OLD, 'id, customer_name, job_total')
    const c5Jobs = await getAllRows('jobs', CID, 'id, customer_name, job_total')
    const c5JobByKey = new Map()
    for (const j of c5Jobs) {
      const key = (j.customer_name || '').toLowerCase() + '|' + (j.job_total || 0)
      c5JobByKey.set(key, j.id)
    }

    // Build C3 lead_id → lead name lookup
    const c3LeadById = new Map()
    for (const l of c3Leads) c3LeadById.set(l.id, l.customer_name)

    // Build C3 cust_id → name lookup
    const c3CustById = new Map()
    for (const c of c3Custs) c3CustById.set(c.id, c.name)

    // Build C3 job_id → key lookup
    const c3JobById = new Map()
    for (const j of c3Jobs) c3JobById.set(j.id, (j.customer_name || '').toLowerCase() + '|' + (j.job_total || 0))

    const auditIdMap = new Map() // old audit id → new audit id
    let inserted = 0
    for (const audit of c3Audits) {
      const { id, company_id, lead_id, customer_id, job_id, ...rest } = audit

      // Remap lead_id
      let newLeadId = null
      if (lead_id) {
        const leadName = c3LeadById.get(lead_id)
        if (leadName) newLeadId = c5LeadByName.get(leadName.toLowerCase().trim())
      }

      // Remap customer_id
      let newCustId = null
      if (customer_id) {
        const custName = c3CustById.get(customer_id)
        if (custName) newCustId = c5CustByName.get(custName.toLowerCase().trim())
      }

      // Remap job_id
      let newJobId = null
      if (job_id) {
        const jobKey = c3JobById.get(job_id)
        if (jobKey) newJobId = c5JobByKey.get(jobKey)
      }

      const row = { ...rest, company_id: CID, lead_id: newLeadId, customer_id: newCustId, job_id: newJobId }
      const { data: ins, error } = await sb.from('lighting_audits').insert(row).select('id').single()
      if (error) {
        console.log('  Error inserting audit:', error.message)
      } else {
        auditIdMap.set(id, ins.id)
        inserted++
      }
    }
    console.log('  Inserted ' + inserted + ' audits')

    // Copy audit_areas
    console.log('\n  Copying audit_areas...')
    const c3Areas = await getAllRows('audit_areas', OLD)
    console.log('  C3 audit_areas: ' + c3Areas.length)
    let areasInserted = 0
    for (const area of c3Areas) {
      const { id, company_id, audit_id, ...rest } = area
      const newAuditId = auditIdMap.get(audit_id)
      if (!newAuditId) continue
      const { error } = await sb.from('audit_areas').insert({ ...rest, company_id: CID, audit_id: newAuditId })
      if (error) console.log('  Area error:', error.message)
      else areasInserted++
    }
    console.log('  Inserted ' + areasInserted + ' audit areas')
  } else if (c5Audits.length > 0) {
    console.log('  C5 already has audits, skipping copy')
  }

  // ══════════════════════════════════════════════════════════
  // 2. FIX LEAD OWNERS — ensure salesperson_id matches actual employees
  // ══════════════════════════════════════════════════════════
  console.log('\n2. LEAD OWNERS')

  const c5Emps = await getAllRows('employees', CID, 'id, name, email, role, active')
  console.log('  Employees:')
  for (const e of c5Emps) console.log('    id=' + e.id + ' ' + e.name + ' (' + e.role + ') active=' + e.active)

  // Check current salesperson distribution
  const leads = await getAllRows('leads', CID, 'id, salesperson_id, lead_owner_id')
  const spDist = {}
  const loDist = {}
  for (const l of leads) {
    spDist[l.salesperson_id || 'null'] = (spDist[l.salesperson_id || 'null'] || 0) + 1
    loDist[l.lead_owner_id || 'null'] = (loDist[l.lead_owner_id || 'null'] || 0) + 1
  }
  console.log('  salesperson_id dist:', JSON.stringify(spDist))
  console.log('  lead_owner_id dist:', JSON.stringify(loDist))

  // Set lead_owner_id = salesperson_id for all leads that have salesperson but no owner
  const nullOwnerLeads = leads.filter(l => !l.lead_owner_id && l.salesperson_id)
  if (nullOwnerLeads.length > 0) {
    console.log('  Setting lead_owner_id = salesperson_id for ' + nullOwnerLeads.length + ' leads...')
    // Batch by salesperson_id
    const bySp = {}
    for (const l of nullOwnerLeads) {
      if (!bySp[l.salesperson_id]) bySp[l.salesperson_id] = []
      bySp[l.salesperson_id].push(l.id)
    }
    for (const [spId, ids] of Object.entries(bySp)) {
      // Update in bulk per salesperson
      const { error } = await sb.from('leads')
        .update({ lead_owner_id: parseInt(spId) })
        .eq('company_id', CID)
        .eq('salesperson_id', parseInt(spId))
        .is('lead_owner_id', null)
      if (error) console.log('    Error for sp=' + spId + ':', error.message)
      else console.log('    Set lead_owner_id=' + spId + ' for ' + ids.length + ' leads')
    }
  }

  // ══════════════════════════════════════════════════════════
  // 3. VERIFY PIPELINE DATA
  // ══════════════════════════════════════════════════════════
  console.log('\n3. PIPELINE VERIFICATION')

  const allStatuses = ['New','Contacted','Appointment Set','Qualified','Quote Sent','Negotiation','Won',
    'Chillin','Scheduled','In Progress','Completed','Invoiced','Closed','Lost',
    'Assigned','Callback','Converted','Not Qualified']

  const verifyLeads = await getAllRows('leads', CID, 'id, status, salesperson_id, lead_owner_id, created_at')
  const matching = verifyLeads.filter(l => allStatuses.includes(l.status))
  const ytd = verifyLeads.filter(l => l.created_at >= '2026-01-01')

  console.log('  Total leads: ' + verifyLeads.length)
  console.log('  Matching pipeline statuses: ' + matching.length)
  console.log('  2026 YTD leads: ' + ytd.length)

  const statusCounts = {}
  for (const l of verifyLeads) statusCounts[l.status] = (statusCounts[l.status] || 0) + 1
  console.log('  Status distribution:')
  Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('    ' + s + ': ' + c))

  // Verify owners are set
  const finalOwnerDist = {}
  for (const l of verifyLeads) finalOwnerDist[l.lead_owner_id || 'null'] = (finalOwnerDist[l.lead_owner_id || 'null'] || 0) + 1
  console.log('  Final lead_owner_id dist:', JSON.stringify(finalOwnerDist))

  // Check quotes linked to leads
  const quotes = await getAllRows('quotes', CID, 'id, lead_id, quote_amount')
  const quotesWithLead = quotes.filter(q => q.lead_id)
  console.log('\n  Quotes: ' + quotes.length + ' total, ' + quotesWithLead.length + ' linked to leads')

  console.log('\n══════════════════════════════════════')
  console.log('  AUDIT COPY & PIPELINE FIX COMPLETE')
  console.log('══════════════════════════════════════')
}

run().catch(err => { console.error('FAILED:', err); process.exit(1) })
