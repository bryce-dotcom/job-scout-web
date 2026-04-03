/**
 * fix-company3-pass3.cjs — Fix sales rep assignments + remaining data cleanup
 *
 * Problem: 961 leads assigned to Bryce (default) but quotes have the REAL salesperson.
 * Strategy: For each lead, find quotes/jobs for the same customer → use their salesperson_id
 * Also: link remaining orphaned quotes to customers via quote_lines → products → customer match
 * Also: deduplicate Plaid, link more jobs to leads
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 3
const DEFAULT_OWNER = 3 // Bryce

async function getAllRows(table, companyId, select = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(select).eq('company_id', companyId).range(from, from + 999).order('id')
    if (error) { console.error('  Error ' + table + ':', error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function run() {
  console.log('═══ Fix Company 3 — Pass 3: Sales Rep Assignment ═══\n')

  const leads = await getAllRows('leads', CID)
  const quotes = await getAllRows('quotes', CID)
  const jobs = await getAllRows('jobs', CID)
  const customers = await getAllRows('customers', CID)

  console.log('Loaded: ' + leads.length + ' leads, ' + quotes.length + ' quotes, ' + jobs.length + ' jobs')

  // ── STEP 1: Fix lead_owner from quote salesperson ──────────
  console.log('\n1. FIXING LEAD OWNERS FROM QUOTE SALESPERSON DATA')

  // Build customer_id → best salesperson (from quotes, most quotes wins)
  const custSalesperson = new Map() // customer_id → { empId: count }
  for (const q of quotes) {
    if (!q.customer_id || !q.salesperson_id) continue
    if (!custSalesperson.has(q.customer_id)) custSalesperson.set(q.customer_id, {})
    const counts = custSalesperson.get(q.customer_id)
    counts[q.salesperson_id] = (counts[q.salesperson_id] || 0) + 1
  }

  // Also check jobs for salesperson
  for (const j of jobs) {
    if (!j.customer_id || !j.salesperson_id) continue
    if (!custSalesperson.has(j.customer_id)) custSalesperson.set(j.customer_id, {})
    const counts = custSalesperson.get(j.customer_id)
    counts[j.salesperson_id] = (counts[j.salesperson_id] || 0) + 1
  }

  // Pick the most frequent salesperson per customer
  const custBestSalesperson = new Map()
  for (const [custId, counts] of custSalesperson) {
    let bestEmp = null, bestCount = 0
    for (const [empId, count] of Object.entries(counts)) {
      if (count > bestCount) { bestEmp = parseInt(empId); bestCount = count }
    }
    if (bestEmp) custBestSalesperson.set(custId, bestEmp)
  }

  console.log('  Customers with known salesperson: ' + custBestSalesperson.size)

  // Update leads
  let ownersFixed = 0
  for (const lead of leads) {
    if (!lead.customer_id) continue
    const bestSalesperson = custBestSalesperson.get(lead.customer_id)
    if (!bestSalesperson) continue

    // Only update if currently set to default (Bryce) or null
    if (lead.lead_owner_id === DEFAULT_OWNER || !lead.lead_owner_id) {
      const updates = { lead_owner_id: bestSalesperson }
      if (!lead.salesperson_id || lead.salesperson_id === DEFAULT_OWNER) {
        updates.salesperson_id = bestSalesperson
      }
      await sb.from('leads').update(updates).eq('id', lead.id)
      ownersFixed++
    }
  }
  console.log('  Lead owners fixed: ' + ownersFixed)

  // ── STEP 2: Also set salesperson on customers ──────────────
  console.log('\n2. FIXING CUSTOMER SALESPERSON')
  let custSalesFixed = 0
  for (const c of customers) {
    if (c.salesperson_id) continue // already set
    const best = custBestSalesperson.get(c.id)
    if (best) {
      await sb.from('customers').update({ salesperson_id: best }).eq('id', c.id)
      custSalesFixed++
    }
  }
  console.log('  Customers updated: ' + custSalesFixed)

  // ── STEP 3: Link orphaned quotes to customers via customer_name match ──
  console.log('\n3. LINKING REMAINING ORPHANED QUOTES → CUSTOMERS')

  // Build customer name → id lookup (from leads, since leads have customer_name)
  const custNameToId = new Map()
  for (const c of customers) {
    if (c.name) custNameToId.set(c.name.toLowerCase().trim(), c.id)
  }

  // For orphaned quotes, try matching via the lead's customer_name
  const leadById = new Map()
  for (const l of leads) leadById.set(l.id, l)

  let quoteCustFixed = 0
  for (const q of quotes) {
    if (q.customer_id) continue

    // If quote has a lead_id, use the lead's customer_id
    if (q.lead_id) {
      const lead = leadById.get(q.lead_id)
      if (lead && lead.customer_id) {
        await sb.from('quotes').update({ customer_id: lead.customer_id }).eq('id', q.id)
        quoteCustFixed++
        continue
      }
    }
  }
  console.log('  Quotes linked to customers via lead: ' + quoteCustFixed)

  // ── STEP 4: Link more jobs → leads ─────────────────────────
  console.log('\n4. LINKING MORE JOBS → LEADS')

  // Refresh leads with updated data
  const freshLeads = await getAllRows('leads', CID)
  const leadByCustId = new Map()
  for (const l of freshLeads) {
    if (l.customer_id && !leadByCustId.has(l.customer_id)) {
      leadByCustId.set(l.customer_id, l.id)
    }
  }

  // Also build quote → lead
  const freshQuotes = await getAllRows('quotes', CID)
  const quoteToLead = new Map()
  for (const q of freshQuotes) {
    if (q.lead_id) quoteToLead.set(q.id, q.lead_id)
  }

  let jobsLinked = 0
  for (const j of jobs) {
    if (j.lead_id) continue

    // Via quote
    if (j.quote_id && quoteToLead.has(j.quote_id)) {
      await sb.from('jobs').update({ lead_id: quoteToLead.get(j.quote_id) }).eq('id', j.id)
      jobsLinked++
      continue
    }

    // Via customer
    if (j.customer_id && leadByCustId.has(j.customer_id)) {
      await sb.from('jobs').update({ lead_id: leadByCustId.get(j.customer_id) }).eq('id', j.id)
      jobsLinked++
    }
  }
  console.log('  Additional jobs linked: ' + jobsLinked)

  // ── STEP 5: Deduplicate Plaid by mask (last 4 digits) ──────
  console.log('\n5. DEDUPLICATING PLAID CONNECTIONS')
  const { data: plaid } = await sb.from('connected_accounts').select('id, plaid_account_id, mask').eq('company_id', CID).order('id')
  const seenMask = new Map()
  const plaidDupes = []
  for (const p of (plaid || [])) {
    const key = p.mask || p.plaid_account_id || String(p.id)
    if (seenMask.has(key)) {
      plaidDupes.push(p.id)
    } else {
      seenMask.set(key, p.id)
    }
  }
  if (plaidDupes.length > 0) {
    await sb.from('connected_accounts').delete().in('id', plaidDupes)
    console.log('  Deleted ' + plaidDupes.length + ' duplicate Plaid accounts')
  } else {
    console.log('  No duplicates found')
  }

  // ── FINAL VERIFICATION ──────────────────────────────────────
  console.log('\n═══ FINAL VERIFICATION ═══')
  const fLeads = await getAllRows('leads', CID)
  const fQuotes = await getAllRows('quotes', CID)
  const fJobs = await getAllRows('jobs', CID)

  console.log('Leads: ' + fLeads.length)
  console.log('  with customer_id: ' + fLeads.filter(l => l.customer_id).length)
  console.log('  with lead_owner_id: ' + fLeads.filter(l => l.lead_owner_id).length)
  console.log('  with quote_id: ' + fLeads.filter(l => l.quote_id).length)

  // Lead owner distribution (the key metric)
  const ownerDist = {}
  const empNames = {}
  const emps = await getAllRows('employees', CID)
  emps.forEach(e => { empNames[e.id] = e.name })
  fLeads.forEach(l => {
    const name = empNames[l.lead_owner_id] || 'Unassigned'
    ownerDist[name] = (ownerDist[name] || 0) + 1
  })
  console.log('\n  LEAD OWNER DISTRIBUTION:')
  Object.entries(ownerDist).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log('    ' + name + ': ' + count)
  })

  console.log('\nQuotes: ' + fQuotes.length)
  console.log('  with lead_id: ' + fQuotes.filter(q => q.lead_id).length)
  console.log('  with customer_id: ' + fQuotes.filter(q => q.customer_id).length)

  console.log('\nJobs: ' + fJobs.length)
  console.log('  with lead_id: ' + fJobs.filter(j => j.lead_id).length)
  console.log('  with customer_id: ' + fJobs.filter(j => j.customer_id).length)

  const { data: finalPlaid } = await sb.from('connected_accounts').select('id').eq('company_id', CID)
  console.log('\nPlaid connections: ' + (finalPlaid || []).length)

  console.log('\n═══ DONE ═══')
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
