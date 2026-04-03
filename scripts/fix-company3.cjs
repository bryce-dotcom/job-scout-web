/**
 * fix-company3.cjs — Merge Company 5 linked data into Company 3 + fix data integrity
 *
 * What this does:
 * 1. Copies Company 5's properly-linked leads into Company 3 (remapping customer/employee IDs)
 * 2. Links Company 3's orphaned quotes to customers
 * 3. Re-pulls HCP assigned_employees for correct lead_owner assignment
 * 4. Links jobs to leads via quote_id chain
 * 5. Fixes lead status typos
 * 6. Deduplicates settings and Plaid connections
 * 7. Adds missing agent/module config
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID3 = 3  // Company 3 — target
const CID5 = 5  // Company 5 — source of clean leads

// HCP employee ID → Company 3 employee ID mapping
const HCP_EMP_MAP = {
  'pro_1b0ee36a334646a7988d5b9a4bbb6c2e': 18, // Tracy Clark
  'pro_f634efab280d4d1a85f7aeb0617d8b68': 15, // Alayda Westcott
  'pro_9f159abd1a4b4b8a994675c8edc78b3c': 3,  // Bryce Westcott
}
const DEFAULT_OWNER = 3 // Bryce

// Company 5 → Company 3 employee ID mapping (by email)
const EMP5_TO_3 = {} // built at runtime

// ── Helpers ──────────────────────────────────────────────────
async function getAllRows(table, companyId, select = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(select).eq('company_id', companyId).range(from, from + 999).order('id')
    if (error) { console.error('  Query error ' + table + ':', error.message); break }
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
        if (e) console.error('    Bad row:', e.message, JSON.stringify(row).slice(0, 150))
        else if (s) all.push(...s)
      }
    } else if (data) all.push(...data)
  }
  return all
}

async function hcpGet(path, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      const wait = 2000 * Math.pow(2, attempt)
      process.stdout.write(' [429, wait ' + (wait/1000) + 's]')
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) throw new Error('HCP ' + res.status + ' on ' + path)
    return res.json()
  }
  throw new Error('HCP rate limit exceeded on ' + path)
}

async function hcpGetAll(path, key, maxPages = 200) {
  const all = []
  for (let p = 1; p <= maxPages; p++) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await hcpGet(path + sep + 'page=' + p + '&page_size=200')
    const items = data[key]
    if (!items || items.length === 0) break
    all.push(...items)
    process.stdout.write('  ' + key + ' page ' + p + ' (' + all.length + ')...\r')
  }
  console.log('  Fetched ' + all.length + ' ' + key)
  return all
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function run() {
  console.log('═══ Fix Company 3 Data ═══\n')

  // ── Load all data ──────────────────────────────────────────
  console.log('Loading data...')
  const emps3 = await getAllRows('employees', CID3)
  const emps5 = await getAllRows('employees', CID5)
  const custs3 = await getAllRows('customers', CID3)
  const custs5 = await getAllRows('customers', CID5)
  const leads3 = await getAllRows('leads', CID3)
  const leads5 = await getAllRows('leads', CID5)
  const quotes3 = await getAllRows('quotes', CID3)
  const quotes5 = await getAllRows('quotes', CID5)
  const jobs3 = await getAllRows('jobs', CID3)

  console.log('  C3: ' + leads3.length + ' leads, ' + quotes3.length + ' quotes, ' + jobs3.length + ' jobs, ' + custs3.length + ' customers')
  console.log('  C5: ' + leads5.length + ' leads, ' + quotes5.length + ' quotes, ' + custs5.length + ' customers')

  // ── Build employee mapping (C5 → C3) ───────────────────────
  console.log('\n1. EMPLOYEE MAPPING (C5 → C3)')
  for (const e5 of emps5) {
    const match = emps3.find(e3 =>
      (e3.email || '').toLowerCase() === (e5.email || '').toLowerCase() ||
      (e3.name || '').toLowerCase() === (e5.name || '').toLowerCase()
    )
    EMP5_TO_3[e5.id] = match ? match.id : DEFAULT_OWNER
    if (match) console.log('  ' + e5.name + ' (C5 id=' + e5.id + ') → C3 id=' + match.id + ' ' + match.name)
    else console.log('  ' + e5.name + ' (C5 id=' + e5.id + ') → DEFAULT id=' + DEFAULT_OWNER)
  }

  // ── Build customer mapping (C5 → C3) by email then name ────
  console.log('\n2. CUSTOMER MAPPING (C5 → C3)')
  const custMap5to3 = {} // C5 customer id → C3 customer id
  const c3ByEmail = new Map()
  const c3ByName = new Map()
  for (const c of custs3) {
    if (c.email) c3ByEmail.set(c.email.toLowerCase().trim(), c.id)
    if (c.name) c3ByName.set(c.name.toLowerCase().trim(), c.id)
  }

  let custMatched = 0, custUnmatched = 0
  for (const c5 of custs5) {
    let match = null
    if (c5.email) match = c3ByEmail.get(c5.email.toLowerCase().trim())
    if (!match && c5.name) match = c3ByName.get(c5.name.toLowerCase().trim())
    if (match) {
      custMap5to3[c5.id] = match
      custMatched++
    } else {
      custUnmatched++
    }
  }
  console.log('  Matched: ' + custMatched + ', Unmatched: ' + custUnmatched)

  // ── STEP 3: Copy C5 leads into C3 ─────────────────────────
  console.log('\n3. COPYING C5 LEADS → C3')

  // Check which C5 leads already exist in C3 (by lead_id or customer match)
  const existing3LeadIds = new Set(leads3.map(l => l.lead_id).filter(Boolean))
  const newLeadRows = []
  const c5LeadToC3Lead = {} // C5 lead id → new C3 lead id (set after insert)

  for (const l5 of leads5) {
    // Skip if this lead_id already exists in C3
    if (l5.lead_id && existing3LeadIds.has(l5.lead_id)) continue

    // Remap IDs
    const c3CustId = l5.customer_id ? (custMap5to3[l5.customer_id] || null) : null
    const c3OwnerId = l5.lead_owner_id ? (EMP5_TO_3[l5.lead_owner_id] || DEFAULT_OWNER) : DEFAULT_OWNER
    const c3SalesId = l5.salesperson_id ? (EMP5_TO_3[l5.salesperson_id] || null) : null

    const { id, company_id, ...rest } = l5
    newLeadRows.push({
      ...rest,
      company_id: CID3,
      customer_id: c3CustId,
      lead_owner_id: c3OwnerId,
      salesperson_id: c3SalesId || c3OwnerId,
      _c5_id: id, // temp, strip before insert
      _c5_quote_id: l5.quote_id, // temp
    })
  }

  console.log('  New leads to copy: ' + newLeadRows.length)

  // Insert leads (strip temp fields)
  const cleanLeadRows = newLeadRows.map(l => {
    const { _c5_id, _c5_quote_id, ...clean } = l
    // Don't copy quote_id — it points to C5 quotes, we'll relink later
    return { ...clean, quote_id: null }
  })

  const insertedLeads = await insertBatch('leads', cleanLeadRows)
  console.log('  Inserted ' + insertedLeads.length + ' leads')

  // Build C5 lead → C3 lead mapping
  for (let i = 0; i < newLeadRows.length; i++) {
    if (insertedLeads[i]) {
      c5LeadToC3Lead[newLeadRows[i]._c5_id] = insertedLeads[i].id
    }
  }

  // ── STEP 4: Link C3 quotes to customers and leads ─────────
  console.log('\n4. LINKING ORPHANED QUOTES')

  // For C5 quotes that have lead_id, map to the new C3 lead
  let quotesLinked = 0
  for (const q5 of quotes5) {
    // Find corresponding C3 quote by quote_id string match
    const c3Quote = quotes3.find(q => q.quote_id === q5.quote_id)
    if (!c3Quote) continue

    const updates = {}

    // Link to C3 customer
    if (!c3Quote.customer_id && q5.customer_id) {
      const c3CustId = custMap5to3[q5.customer_id]
      if (c3CustId) updates.customer_id = c3CustId
    }

    // Link to C3 lead (via the C5→C3 lead mapping)
    if (!c3Quote.lead_id && q5.lead_id) {
      const c3LeadId = c5LeadToC3Lead[q5.lead_id]
      if (c3LeadId) updates.lead_id = c3LeadId
    }

    // Link salesperson
    if (!c3Quote.salesperson_id && q5.salesperson_id) {
      updates.salesperson_id = EMP5_TO_3[q5.salesperson_id] || DEFAULT_OWNER
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('quotes').update(updates).eq('id', c3Quote.id)
      quotesLinked++
    }
  }
  console.log('  Quotes linked: ' + quotesLinked)

  // Also try matching remaining orphaned C3 quotes to customers by name
  const stillOrphanedQuotes = await getAllRows('quotes', CID3)
  let quotesMatchedByCust = 0
  for (const q of stillOrphanedQuotes) {
    if (q.customer_id) continue // already linked
    // Try to find customer by notes or any available data
    // Skip for now — these will need manual review or HCP re-pull
  }

  // ── STEP 5: Update leads with their quote_ids ──────────────
  console.log('\n5. LINKING LEADS → QUOTES')
  const allQuotes3 = await getAllRows('quotes', CID3)
  let leadsQuoteLinked = 0
  for (const q of allQuotes3) {
    if (!q.lead_id) continue
    // Set quote_id on the lead
    const { error } = await sb.from('leads').update({ quote_id: q.id, quote_generated: true }).eq('id', q.lead_id).is('quote_id', null)
    if (!error) leadsQuoteLinked++
  }
  console.log('  Leads linked to quotes: ' + leadsQuoteLinked)

  // ── STEP 6: Link jobs → leads via quote_id ─────────────────
  console.log('\n6. LINKING JOBS → LEADS')
  // Build quote_id → lead_id lookup
  const quoteToLead = new Map()
  for (const q of allQuotes3) {
    if (q.lead_id) quoteToLead.set(q.id, q.lead_id)
  }

  let jobsLinked = 0
  for (const job of jobs3) {
    if (job.lead_id) continue // already linked
    if (job.quote_id && quoteToLead.has(job.quote_id)) {
      await sb.from('jobs').update({ lead_id: quoteToLead.get(job.quote_id) }).eq('id', job.id)
      jobsLinked++
    }
  }
  console.log('  Jobs linked via quote_id: ' + jobsLinked)

  // ── STEP 7: Re-pull HCP assignments ────────────────────────
  console.log('\n7. RE-PULLING HCP EMPLOYEE ASSIGNMENTS')
  console.log('  Fetching HCP estimates...')
  const hcpEstimates = await hcpGetAll('/estimates', 'estimates', 200)

  // Build HCP customer name → C3 lead mapping for cross-reference
  const allLeads3 = await getAllRows('leads', CID3)
  const leadByName = new Map()
  for (const l of allLeads3) {
    if (l.customer_name) leadByName.set(l.customer_name.toLowerCase().trim(), l)
  }

  let assignmentsFixed = 0
  for (const est of hcpEstimates) {
    if (!est.assigned_employees || est.assigned_employees.length === 0) continue

    const hcpEmpId = est.assigned_employees[0]
    const c3EmpId = HCP_EMP_MAP[hcpEmpId]
    if (!c3EmpId) continue

    // Find the C3 lead by customer name
    const custName = est.customer
      ? ((est.customer.first_name || '') + ' ' + (est.customer.last_name || '')).trim()
      : ''
    if (!custName) continue

    const lead = leadByName.get(custName.toLowerCase().trim())
    if (!lead) continue

    // Only update if currently unassigned or assigned to default
    if (!lead.lead_owner_id || lead.lead_owner_id === DEFAULT_OWNER) {
      await sb.from('leads').update({
        lead_owner_id: c3EmpId,
        salesperson_id: c3EmpId
      }).eq('id', lead.id)
      assignmentsFixed++
    }
  }
  console.log('  Assignments fixed from HCP: ' + assignmentsFixed)

  // ── STEP 8: Fix lead statuses ──────────────────────────────
  console.log('\n8. FIXING LEAD STATUSES')
  const fixes = [
    { old: 'Qualified ', new: 'Qualified' },
    { old: 'Appointment Scheduled', new: 'Appointment Set' },
    { old: 'Job Scheduled', new: 'Won' },
    { old: 'Sold', new: 'Won' },
  ]
  for (const fix of fixes) {
    const { count } = await sb.from('leads').update({ status: fix.new }).eq('company_id', CID3).eq('status', fix.old).select('*', { count: 'exact', head: true })
    // count may not work with update, just log
    const { data } = await sb.from('leads').select('id').eq('company_id', CID3).eq('status', fix.old)
    if (data && data.length > 0) {
      await sb.from('leads').update({ status: fix.new }).eq('company_id', CID3).eq('status', fix.old)
      console.log('  "' + fix.old + '" → "' + fix.new + '": ' + data.length + ' rows')
    } else {
      console.log('  "' + fix.old + '" → "' + fix.new + '": 0 rows (already clean)')
    }
  }

  // ── STEP 9: Deduplicate settings ───────────────────────────
  console.log('\n9. DEDUPLICATING SETTINGS')
  const { data: allSettings } = await sb.from('settings').select('id, key').eq('company_id', CID3).order('id')
  const seenKeys = new Map() // key → first id
  const dupeIds = []
  for (const s of (allSettings || [])) {
    if (seenKeys.has(s.key)) {
      dupeIds.push(s.id)
    } else {
      seenKeys.set(s.key, s.id)
    }
  }
  if (dupeIds.length > 0) {
    // Delete in batches
    for (let i = 0; i < dupeIds.length; i += 100) {
      const batch = dupeIds.slice(i, i + 100)
      await sb.from('settings').delete().in('id', batch)
    }
    console.log('  Deleted ' + dupeIds.length + ' duplicate settings rows')
  } else {
    console.log('  No duplicate settings found')
  }

  // ── STEP 10: Deduplicate Plaid connections ─────────────────
  console.log('\n10. DEDUPLICATING PLAID CONNECTIONS')
  const { data: plaidAccts } = await sb.from('connected_accounts').select('id, plaid_account_id').eq('company_id', CID3).order('id')
  const seenPlaid = new Map()
  const plaidDupeIds = []
  for (const p of (plaidAccts || [])) {
    if (seenPlaid.has(p.plaid_account_id)) {
      plaidDupeIds.push(p.id)
    } else {
      seenPlaid.set(p.plaid_account_id, p.id)
    }
  }
  if (plaidDupeIds.length > 0) {
    await sb.from('connected_accounts').delete().in('id', plaidDupeIds)
    console.log('  Deleted ' + plaidDupeIds.length + ' duplicate Plaid accounts')
  } else {
    console.log('  No duplicate Plaid accounts')
  }

  // ── STEP 11: Add missing agents ────────────────────────────
  console.log('\n11. ADDING MISSING AGENTS')
  // Check if frankie-finance exists for company 3
  const { data: frankieAgent } = await sb.from('agents').select('id').eq('slug', 'frankie-finance').single()
  if (frankieAgent) {
    const { data: existing } = await sb.from('company_agents').select('id').eq('company_id', CID3).eq('agent_id', frankieAgent.id).single()
    if (!existing) {
      await sb.from('company_agents').insert({ company_id: CID3, agent_id: frankieAgent.id, subscription_status: 'active' })
      console.log('  Added frankie-finance to company 3')
    } else {
      console.log('  frankie-finance already active')
    }
  }

  // Check arnie ai_module
  const { data: arnieMod } = await sb.from('ai_modules').select('id').eq('company_id', CID3).eq('module_name', 'arnie').single()
  if (!arnieMod) {
    await sb.from('ai_modules').insert({
      company_id: CID3,
      module_name: 'arnie',
      display_name: 'OG Arnie',
      description: 'AI assistant',
      icon: 'bot',
      status: 'active',
      default_menu_section: 'OPERATIONS',
      route_path: '/agents/arnie',
      sort_order: 5
    })
    console.log('  Added arnie ai_module')
  } else {
    console.log('  arnie ai_module already exists')
  }

  // ── STEP 12: Final verification ────────────────────────────
  console.log('\n═══ VERIFICATION ═══')
  const finalLeads = await getAllRows('leads', CID3)
  const finalQuotes = await getAllRows('quotes', CID3)
  const finalJobs = await getAllRows('jobs', CID3)

  const leadsWithQuote = finalLeads.filter(l => l.quote_id).length
  const leadsWithCustomer = finalLeads.filter(l => l.customer_id).length
  const leadsWithOwner = finalLeads.filter(l => l.lead_owner_id).length
  const quotesWithLead = finalQuotes.filter(q => q.lead_id).length
  const quotesWithCust = finalQuotes.filter(q => q.customer_id).length
  const jobsWithLead = finalJobs.filter(j => j.lead_id).length
  const jobsWithQuote = finalJobs.filter(j => j.quote_id).length

  console.log('  Leads: ' + finalLeads.length + ' total')
  console.log('    with quote_id: ' + leadsWithQuote + ' (' + Math.round(leadsWithQuote/finalLeads.length*100) + '%)')
  console.log('    with customer_id: ' + leadsWithCustomer + ' (' + Math.round(leadsWithCustomer/finalLeads.length*100) + '%)')
  console.log('    with lead_owner_id: ' + leadsWithOwner + ' (' + Math.round(leadsWithOwner/finalLeads.length*100) + '%)')
  console.log('  Quotes: ' + finalQuotes.length + ' total')
  console.log('    with lead_id: ' + quotesWithLead + ' (' + Math.round(quotesWithLead/finalQuotes.length*100) + '%)')
  console.log('    with customer_id: ' + quotesWithCust + ' (' + Math.round(quotesWithCust/finalQuotes.length*100) + '%)')
  console.log('  Jobs: ' + finalJobs.length + ' total')
  console.log('    with lead_id: ' + jobsWithLead + ' (' + Math.round(jobsWithLead/finalJobs.length*100) + '%)')
  console.log('    with quote_id: ' + jobsWithQuote + ' (' + Math.round(jobsWithQuote/finalJobs.length*100) + '%)')

  // Lead status distribution
  const statusDist = {}
  finalLeads.forEach(l => { statusDist[l.status || 'null'] = (statusDist[l.status || 'null'] || 0) + 1 })
  console.log('  Lead statuses:', JSON.stringify(statusDist))

  // Settings count
  const { data: finalSettings } = await sb.from('settings').select('id', { count: 'exact', head: true }).eq('company_id', CID3)
  console.log('  Settings rows: check Settings page for clean load')

  // Plaid
  const { data: finalPlaid } = await sb.from('connected_accounts').select('id').eq('company_id', CID3)
  console.log('  Plaid connections: ' + (finalPlaid || []).length)

  console.log('\n═══ DONE ═══')
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
