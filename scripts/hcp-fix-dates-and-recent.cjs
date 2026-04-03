const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 5
const OLD = 3

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

async function insertBatch(table, rows) {
  if (rows.length === 0) return []
  const all = []
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await sb.from(table).insert(chunk).select()
    if (error) {
      console.error('  Insert error ' + table + ':', error.message)
      for (const row of chunk) {
        const { data: s, error: e } = await sb.from(table).insert(row).select()
        if (e) console.error('    Bad:', e.message, JSON.stringify(row).slice(0, 120))
        else if (s) all.push(...s)
      }
    } else if (data) all.push(...data)
  }
  return all
}

async function run() {
  console.log('=== Fix Dates + Merge Recent Data ===\n')

  // ══════════════════════════════════════════════════════════
  // PART 1: FIX INVOICE DATES FROM HCP
  // ══════════════════════════════════════════════════════════
  console.log('PART 1: Fixing invoice dates from HCP\n')

  console.log('  Fetching HCP invoices...')
  const hcpInvoices = []
  for (let p = 1; p <= 100; p++) {
    const data = await hcpGet('/invoices?page=' + p + '&page_size=200')
    if (!data || !data.invoices || data.invoices.length === 0) break
    hcpInvoices.push(...data.invoices)
    if (p % 10 === 0) process.stdout.write('  ' + hcpInvoices.length + '...\r')
  }
  console.log('  HCP invoices: ' + hcpInvoices.length)

  const dbInvoices = await getAllRows('invoices', CID, 'id')
  console.log('  DB invoices: ' + dbInvoices.length)

  let invDatesFixed = 0
  for (let i = 0; i < Math.min(hcpInvoices.length, dbInvoices.length); i++) {
    const hcp = hcpInvoices[i]
    const db = dbInvoices[i]

    // Best date: invoice_date > sent_at > service_date > paid_at
    const bestDate = hcp.invoice_date || hcp.sent_at || hcp.service_date || hcp.paid_at || hcp.due_at
    if (bestDate) {
      await sb.from('invoices').update({ created_at: bestDate }).eq('id', db.id)
      invDatesFixed++
    }

    if (i % 1000 === 0 && i > 0) process.stdout.write('  invoices ' + i + '/' + dbInvoices.length + '...\r')
  }
  console.log('\n  Invoice dates fixed: ' + invDatesFixed)

  // ══════════════════════════════════════════════════════════
  // PART 2: FIX PAYMENT DATES (created_at from HCP paid_at)
  // ══════════════════════════════════════════════════════════
  console.log('\nPART 2: Fixing payment created_at from HCP\n')

  // Payments were created from HCP invoice.payments — they already have correct `date` field
  // but created_at is wrong. Set created_at = date for all payments
  const dbPayments = await getAllRows('payments', CID, 'id, date')
  let pmtFixed = 0
  for (const pmt of dbPayments) {
    if (pmt.date) {
      await sb.from('payments').update({ created_at: pmt.date + 'T12:00:00Z' }).eq('id', pmt.id)
      pmtFixed++
    }
    if (pmtFixed % 1000 === 0 && pmtFixed > 0) process.stdout.write('  payments ' + pmtFixed + '/' + dbPayments.length + '...\r')
  }
  console.log('  Payment created_at fixed: ' + pmtFixed)

  // ══════════════════════════════════════════════════════════
  // PART 3: FIX CUSTOMER created_at (for the 717 imported from C3)
  // ══════════════════════════════════════════════════════════
  console.log('\nPART 3: Fixing customer created_at\n')

  // Match C3 customers to C5 by name and copy their original created_at
  const c3Custs = await getAllRows('customers', OLD, 'id, name, created_at')
  const c5Custs = await getAllRows('customers', CID, 'id, name, created_at')

  const c3CustByName = new Map()
  for (const c of c3Custs) c3CustByName.set((c.name || '').toLowerCase(), c)

  let custFixed = 0
  const today = '2026-04-02'
  for (const c5 of c5Custs) {
    if (!c5.created_at || !c5.created_at.startsWith(today)) continue
    const c3 = c3CustByName.get((c5.name || '').toLowerCase())
    if (c3 && c3.created_at) {
      await sb.from('customers').update({ created_at: c3.created_at }).eq('id', c5.id)
      custFixed++
    }
  }
  console.log('  Customer dates fixed: ' + custFixed)

  // ══════════════════════════════════════════════════════════
  // PART 4: FIX LEAD created_at/created_date
  // ══════════════════════════════════════════════════════════
  console.log('\nPART 4: Fixing lead dates\n')

  const c3Leads = await getAllRows('leads', OLD, 'id, customer_name, created_at, created_date')
  const c5Leads = await getAllRows('leads', CID, 'id, customer_name, created_at, created_date')

  const c3LeadByName = new Map()
  for (const l of c3Leads) c3LeadByName.set((l.customer_name || '').toLowerCase(), l)

  let leadFixed = 0
  for (const l5 of c5Leads) {
    if (!l5.created_at || !l5.created_at.startsWith(today)) continue
    const l3 = c3LeadByName.get((l5.customer_name || '').toLowerCase())
    if (l3) {
      const updates = {}
      if (l3.created_at) updates.created_at = l3.created_at
      if (l3.created_date) updates.created_date = l3.created_date
      if (Object.keys(updates).length > 0) {
        await sb.from('leads').update(updates).eq('id', l5.id)
        leadFixed++
      }
    }
  }
  console.log('  Lead dates fixed: ' + leadFixed)

  // ══════════════════════════════════════════════════════════
  // PART 5: MERGE RECENT C3 DATA INTO C5
  // ══════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════')
  console.log('PART 5: Merging recent Company 3 data')
  console.log('══════════════════════════════════════\n')

  const SINCE = '2026-03-12'

  // Build employee mapping C3 → C5
  const c3Emps = await getAllRows('employees', OLD, 'id, email')
  const c5Emps = await getAllRows('employees', CID, 'id, email')
  const empMap = new Map()
  for (const e3 of c3Emps) {
    const e5 = c5Emps.find(e => (e.email || '').toLowerCase() === (e3.email || '').toLowerCase())
    if (e5) empMap.set(e3.id, e5.id)
  }

  // Build customer mapping C3 → C5
  const c5CustByName = new Map()
  const c5CustsAll = await getAllRows('customers', CID, 'id, name')
  for (const c of c5CustsAll) c5CustByName.set((c.name || '').toLowerCase(), c.id)

  // ── 5a: Recent Customers ──
  console.log('5a. Recent Customers')
  const { data: recentC3Custs } = await sb.from('customers').select('*')
    .eq('company_id', OLD).gte('created_at', SINCE).order('id')
  const newCusts = (recentC3Custs || []).filter(c => !c5CustByName.has((c.name || '').toLowerCase()))
  console.log('  C3 customers since ' + SINCE + ': ' + (recentC3Custs || []).length)
  console.log('  Not in C5: ' + newCusts.length)

  if (newCusts.length > 0) {
    const rows = newCusts.map(c => {
      const { id, company_id, salesperson_id, ...rest } = c
      return { ...rest, company_id: CID, salesperson_id: empMap.get(salesperson_id) || null }
    })
    const inserted = await insertBatch('customers', rows)
    console.log('  Inserted: ' + inserted.length)
    // Update lookup
    for (const c of inserted) c5CustByName.set((c.name || '').toLowerCase(), c.id)
  }

  // ── 5b: Recent Leads ──
  console.log('\n5b. Recent Leads')
  const { data: recentC3Leads } = await sb.from('leads').select('*')
    .eq('company_id', OLD).gte('created_at', SINCE).order('id')

  // Check which aren't in C5 by customer_name
  const c5LeadNames = new Set((await getAllRows('leads', CID, 'id, customer_name')).map(l => (l.customer_name || '').toLowerCase()))
  const newLeads = (recentC3Leads || []).filter(l => !c5LeadNames.has((l.customer_name || '').toLowerCase()))
  console.log('  C3 leads since ' + SINCE + ': ' + (recentC3Leads || []).length)
  console.log('  Not in C5: ' + newLeads.length)

  if (newLeads.length > 0) {
    const rows = newLeads.map(l => {
      const { id, company_id, salesperson_id, setter_id, lead_owner_id, setter_owner_id, appointment_id, customer_id, quote_id, ...rest } = l
      return {
        ...rest,
        company_id: CID,
        salesperson_id: empMap.get(salesperson_id) || null,
        setter_id: empMap.get(setter_id) || null,
        lead_owner_id: empMap.get(lead_owner_id) || null,
        setter_owner_id: empMap.get(setter_owner_id) || null,
        customer_id: c5CustByName.get((l.customer_name || '').toLowerCase()) || null,
      }
    })
    const inserted = await insertBatch('leads', rows)
    console.log('  Inserted: ' + inserted.length)
  }

  // ── 5c: Recent Quotes ──
  console.log('\n5c. Recent Quotes')
  const { data: recentC3Quotes } = await sb.from('quotes').select('*')
    .eq('company_id', OLD).gte('created_at', SINCE).order('id')

  // Match by customer_id → name → check in C5
  const c3CustIdToName = new Map()
  for (const c of c3Custs) c3CustIdToName.set(c.id, (c.name || '').toLowerCase())

  // Get C5 quote customer_ids to avoid dupes
  const c5Quotes = await getAllRows('quotes', CID, 'id, customer_id, quote_amount, created_at')
  const c5QuoteKeys = new Set()
  for (const q of c5Quotes) {
    c5QuoteKeys.add(q.customer_id + '|' + q.quote_amount + '|' + (q.created_at || '').slice(0, 10))
  }

  const newQuotes = []
  for (const q of (recentC3Quotes || [])) {
    const custName = c3CustIdToName.get(q.customer_id) || ''
    const c5CustId = c5CustByName.get(custName) || null
    const key = c5CustId + '|' + q.quote_amount + '|' + (q.created_at || '').slice(0, 10)
    if (!c5QuoteKeys.has(key)) {
      newQuotes.push({ ...q, _c5CustId: c5CustId })
    }
  }
  console.log('  C3 quotes since ' + SINCE + ': ' + (recentC3Quotes || []).length)
  console.log('  Not in C5: ' + newQuotes.length)

  const insertedQuotes = []
  if (newQuotes.length > 0) {
    const rows = newQuotes.map(q => {
      const { id, company_id, customer_id, salesperson_id, lead_id, _c5CustId, ...rest } = q
      return {
        ...rest,
        company_id: CID,
        customer_id: _c5CustId,
        salesperson_id: empMap.get(salesperson_id) || null,
      }
    })
    const inserted = await insertBatch('quotes', rows)
    insertedQuotes.push(...inserted)
    console.log('  Inserted: ' + inserted.length)

    // Also copy quote_lines
    for (let i = 0; i < newQuotes.length; i++) {
      const oldQuoteId = newQuotes[i].id
      const newQuoteId = insertedQuotes[i] ? insertedQuotes[i].id : null
      if (!newQuoteId) continue

      const { data: lines } = await sb.from('quote_lines').select('*').eq('quote_id', oldQuoteId).eq('company_id', OLD)
      if (lines && lines.length > 0) {
        const lineRows = lines.map(l => {
          const { id, company_id, quote_id, item_id, ...rest } = l
          // Try to find matching product in C5
          return { ...rest, company_id: CID, quote_id: newQuoteId, item_id: null }
        })
        await insertBatch('quote_lines', lineRows)
      }
    }
    console.log('  Quote lines copied')
  }

  // ── 5d: Recent Jobs ──
  console.log('\n5d. Recent Jobs')
  const { data: recentC3Jobs } = await sb.from('jobs').select('*')
    .eq('company_id', OLD).gte('created_at', SINCE).order('id')

  // Check by customer_name + start_date to avoid dupes
  const c5Jobs = await getAllRows('jobs', CID, 'id, customer_name, start_date, job_total')
  const c5JobKeys = new Set()
  for (const j of c5Jobs) {
    c5JobKeys.add((j.customer_name || '').toLowerCase() + '|' + (j.start_date || '').slice(0, 10) + '|' + j.job_total)
  }

  const newJobs = (recentC3Jobs || []).filter(j => {
    const key = (j.customer_name || '').toLowerCase() + '|' + (j.start_date || '').slice(0, 10) + '|' + j.job_total
    return !c5JobKeys.has(key)
  })
  console.log('  C3 jobs since ' + SINCE + ': ' + (recentC3Jobs || []).length)
  console.log('  Not in C5: ' + newJobs.length)

  const insertedJobs = []
  if (newJobs.length > 0) {
    const rows = newJobs.map(j => {
      const { id, company_id, customer_id, salesperson_id, quote_id, pm_id, job_lead_id, ...rest } = j
      const custName = (j.customer_name || '').toLowerCase()
      return {
        ...rest,
        company_id: CID,
        customer_id: c5CustByName.get(custName) || null,
        salesperson_id: empMap.get(salesperson_id) || null,
        pm_id: empMap.get(pm_id) || null,
        job_lead_id: empMap.get(job_lead_id) || null,
      }
    })
    const inserted = await insertBatch('jobs', rows)
    insertedJobs.push(...inserted)
    console.log('  Inserted: ' + inserted.length)

    // Copy job_lines
    for (let i = 0; i < newJobs.length; i++) {
      const oldJobId = newJobs[i].id
      const newJobId = insertedJobs[i] ? insertedJobs[i].id : null
      if (!newJobId) continue

      const { data: lines } = await sb.from('job_lines').select('*').eq('job_id', oldJobId).eq('company_id', OLD)
      if (lines && lines.length > 0) {
        const lineRows = lines.map(l => {
          const { id, company_id, job_id, item_id, ...rest } = l
          return { ...rest, company_id: CID, job_id: newJobId, item_id: null }
        })
        await insertBatch('job_lines', lineRows)
      }
    }
    console.log('  Job lines copied')
  }

  // ── 5e: Recent Invoices ──
  console.log('\n5e. Recent Invoices')
  const { data: recentC3Inv } = await sb.from('invoices').select('*')
    .eq('company_id', OLD).gte('created_at', SINCE).order('id')

  // Avoid dupes by amount + created_at date
  const c5InvKeys = new Set()
  const c5AllInv = await getAllRows('invoices', CID, 'id, amount, created_at')
  for (const inv of c5AllInv) {
    c5InvKeys.add(inv.amount + '|' + (inv.created_at || '').slice(0, 10))
  }

  const newInv = (recentC3Inv || []).filter(inv => {
    const key = inv.amount + '|' + (inv.created_at || '').slice(0, 10)
    return !c5InvKeys.has(key)
  })
  console.log('  C3 invoices since ' + SINCE + ': ' + (recentC3Inv || []).length)
  console.log('  Not in C5: ' + newInv.length)

  if (newInv.length > 0) {
    const rows = newInv.map(inv => {
      const { id, company_id, customer_id, job_id, ...rest } = inv
      return {
        ...rest,
        company_id: CID,
        customer_id: c5CustByName.get((inv.job_description || '').toLowerCase()) || null,
      }
    })
    const inserted = await insertBatch('invoices', rows)
    console.log('  Inserted: ' + inserted.length)
  }

  // ── 5f: Recent Payments ──
  console.log('\n5f. Recent Payments')
  const { data: recentC3Pmt } = await sb.from('payments').select('*')
    .eq('company_id', OLD).gte('created_at', SINCE).order('id')

  const c5PmtKeys = new Set()
  const c5AllPmt = await getAllRows('payments', CID, 'id, amount, date')
  for (const p of c5AllPmt) c5PmtKeys.add(p.amount + '|' + p.date)

  const newPmt = (recentC3Pmt || []).filter(p => {
    return !c5PmtKeys.has(p.amount + '|' + p.date)
  })
  console.log('  C3 payments since ' + SINCE + ': ' + (recentC3Pmt || []).length)
  console.log('  Not in C5: ' + newPmt.length)

  if (newPmt.length > 0) {
    const rows = newPmt.map(p => {
      const { id, company_id, invoice_id, ...rest } = p
      return { ...rest, company_id: CID }
    })
    const inserted = await insertBatch('payments', rows)
    console.log('  Inserted: ' + inserted.length)
  }

  // ── 5g: Recent Appointments ──
  console.log('\n5g. Recent Appointments')
  const { data: recentC3Appts } = await sb.from('appointments').select('*')
    .eq('company_id', OLD).gte('created_at', SINCE).order('id')

  const c5ApptTitles = new Set()
  const c5Appts = await getAllRows('appointments', CID, 'id, title, start_time')
  for (const a of c5Appts) c5ApptTitles.add((a.title || '').toLowerCase() + '|' + (a.start_time || '').slice(0, 16))

  const newAppts = (recentC3Appts || []).filter(a => {
    return !c5ApptTitles.has((a.title || '').toLowerCase() + '|' + (a.start_time || '').slice(0, 16))
  })
  console.log('  C3 appointments since ' + SINCE + ': ' + (recentC3Appts || []).length)
  console.log('  Not in C5: ' + newAppts.length)

  if (newAppts.length > 0) {
    const rows = newAppts.map(a => {
      const { id, company_id, lead_id, customer_id, employee_id, salesperson_id, setter_id, lead_owner_id, ...rest } = a
      return {
        ...rest,
        company_id: CID,
        employee_id: empMap.get(employee_id) || null,
        salesperson_id: empMap.get(salesperson_id) || null,
        setter_id: empMap.get(setter_id) || null,
        lead_owner_id: empMap.get(lead_owner_id) || null,
      }
    })
    const inserted = await insertBatch('appointments', rows)
    console.log('  Inserted: ' + inserted.length)
  }

  // ── 5h: Update lead/quote statuses from C3 ──
  console.log('\n5h. Syncing statuses from Company 3')

  // For leads that exist in both, update C5 status to match C3
  const c3AllLeads = await getAllRows('leads', OLD, 'id, customer_name, status, created_date')
  const c5AllLeads = await getAllRows('leads', CID, 'id, customer_name, status')
  const c5LeadByName = new Map()
  for (const l of c5AllLeads) c5LeadByName.set((l.customer_name || '').toLowerCase(), l)

  let statusFixed = 0
  for (const l3 of c3AllLeads) {
    const l5 = c5LeadByName.get((l3.customer_name || '').toLowerCase())
    if (l5 && l3.status && l3.status !== l5.status) {
      // C3 status is more recent/authoritative for manually managed leads
      await sb.from('leads').update({ status: l3.status }).eq('id', l5.id)
      statusFixed++
    }
  }
  console.log('  Lead statuses synced: ' + statusFixed)

  // ══════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════')
  console.log('  ALL FIXES COMPLETE')
  console.log('══════════════════════════════════════')
  console.log('  Invoice dates fixed: ' + invDatesFixed)
  console.log('  Payment dates fixed: ' + pmtFixed)
  console.log('  Customer dates fixed: ' + custFixed)
  console.log('  Lead dates fixed: ' + leadFixed)
  console.log('  Lead statuses synced: ' + statusFixed)
  console.log('══════════════════════════════════════')
}

run().catch(err => { console.error('FAILED:', err); process.exit(1) })
