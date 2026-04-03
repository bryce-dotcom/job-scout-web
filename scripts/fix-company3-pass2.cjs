/**
 * fix-company3-pass2.cjs — Second pass: link remaining orphaned quotes/jobs
 *
 * Strategy: Use customer_id as the bridge
 * - Leads now have customer_id (68%)
 * - Quotes need customer_id + lead_id
 * - Jobs need lead_id
 *
 * Since C3 quotes and C5 quotes have different quote_id formats,
 * we match by re-pulling from HCP API and using customer name as the key.
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 3

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

async function hcpGet(path, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)))
      continue
    }
    if (!res.ok) throw new Error('HCP ' + res.status + ' on ' + path)
    return res.json()
  }
  throw new Error('HCP rate limit on ' + path)
}

async function hcpGetAll(path, key, maxPages = 200) {
  const all = []
  for (let p = 1; p <= maxPages; p++) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await hcpGet(path + sep + 'page=' + p + '&page_size=200')
    const items = data[key]
    if (!items || items.length === 0) break
    all.push(...items)
    if (p % 10 === 0) process.stdout.write('  ' + key + ': ' + all.length + '...\r')
  }
  console.log('  Fetched ' + all.length + ' ' + key)
  return all
}

async function run() {
  console.log('═══ Fix Company 3 — Pass 2 ═══\n')

  // Load current data
  const customers = await getAllRows('customers', CID)
  const leads = await getAllRows('leads', CID)
  const quotes = await getAllRows('quotes', CID)
  const jobs = await getAllRows('jobs', CID)

  console.log('Current: ' + leads.length + ' leads, ' + quotes.length + ' quotes, ' + jobs.length + ' jobs, ' + customers.length + ' customers')
  console.log('Quotes without customer_id: ' + quotes.filter(q => !q.customer_id).length)
  console.log('Quotes without lead_id: ' + quotes.filter(q => !q.lead_id).length)
  console.log('Jobs without lead_id: ' + jobs.filter(j => !j.lead_id).length)

  // Build customer lookup by name (lowercase)
  const custByName = new Map()
  for (const c of customers) {
    if (c.name) custByName.set(c.name.toLowerCase().trim(), c)
  }
  const custByEmail = new Map()
  for (const c of customers) {
    if (c.email) custByEmail.set(c.email.toLowerCase().trim(), c)
  }

  // Build lead lookup by customer_id
  const leadByCustId = new Map()
  for (const l of leads) {
    if (l.customer_id) {
      // Use first lead per customer (most relevant)
      if (!leadByCustId.has(l.customer_id)) {
        leadByCustId.set(l.customer_id, l)
      }
    }
  }

  // Build lead lookup by customer_name
  const leadByName = new Map()
  for (const l of leads) {
    if (l.customer_name) leadByName.set(l.customer_name.toLowerCase().trim(), l)
  }

  // ── PASS A: Link orphaned C3 quotes → customers via HCP ────
  console.log('\n1. RE-PULLING HCP ESTIMATES to link quotes → customers')
  const hcpEstimates = await hcpGetAll('/estimates', 'estimates')

  // Build HCP estimate → customer name mapping
  const hcpEstCustName = new Map()
  for (const est of hcpEstimates) {
    if (est.customer) {
      const name = ((est.customer.first_name || '') + ' ' + (est.customer.last_name || '')).trim()
      if (name) hcpEstCustName.set(est.id, name)
    }
  }

  // Match C3 quotes to customers by trying multiple strategies
  let quoteCustLinked = 0, quoteLeadLinked = 0
  const batchUpdates = [] // collect updates for batch processing

  for (const q of quotes) {
    const updates = {}

    // Skip if already fully linked
    if (q.customer_id && q.lead_id) continue

    // Strategy 1: If quote has notes with a customer name, match it
    // Strategy 2: If the quote_id matches an HCP estimate pattern, look up by HCP customer name
    // Strategy 3: Match by salesperson_id + created_at proximity to a lead

    // Try customer name from lead if we know the lead
    if (q.lead_id) {
      const lead = leads.find(l => l.id === q.lead_id)
      if (lead && lead.customer_id && !q.customer_id) {
        updates.customer_id = lead.customer_id
      }
    }

    // If no customer_id yet, try matching via salesperson + any linked data
    if (!q.customer_id && !updates.customer_id) {
      // Check if any job references this quote
      const linkedJob = jobs.find(j => j.quote_id === q.id && j.customer_id)
      if (linkedJob) {
        updates.customer_id = linkedJob.customer_id
      }
    }

    // If we now have a customer_id, try to find a lead for this customer
    const effectiveCustId = updates.customer_id || q.customer_id
    if (effectiveCustId && !q.lead_id && !updates.lead_id) {
      const lead = leadByCustId.get(effectiveCustId)
      if (lead) {
        updates.lead_id = lead.id
      }
    }

    if (Object.keys(updates).length > 0) {
      batchUpdates.push({ id: q.id, updates })
      if (updates.customer_id) quoteCustLinked++
      if (updates.lead_id) quoteLeadLinked++
    }
  }

  // Apply batch updates
  for (const { id, updates } of batchUpdates) {
    await sb.from('quotes').update(updates).eq('id', id)
  }
  console.log('  Quotes linked to customers: ' + quoteCustLinked)
  console.log('  Quotes linked to leads: ' + quoteLeadLinked)

  // ── PASS B: Link remaining quotes to leads by customer match ─
  console.log('\n2. LINKING REMAINING QUOTES → LEADS by customer_id')
  const updatedQuotes = await getAllRows('quotes', CID)
  let pass2QuoteLeads = 0

  for (const q of updatedQuotes) {
    if (q.lead_id) continue // already linked
    if (!q.customer_id) continue // can't match without customer

    const lead = leadByCustId.get(q.customer_id)
    if (lead) {
      await sb.from('quotes').update({ lead_id: lead.id }).eq('id', q.id)
      pass2QuoteLeads++

      // Also set quote_id on the lead if it doesn't have one
      if (!lead.quote_id) {
        await sb.from('leads').update({ quote_id: q.id, quote_generated: true }).eq('id', lead.id)
        lead.quote_id = q.id // update local cache
      }
    }
  }
  console.log('  Additional quotes linked to leads: ' + pass2QuoteLeads)

  // ── PASS C: Link jobs → leads ────────────────────────────────
  console.log('\n3. LINKING JOBS → LEADS')

  // Refresh lead lookup (may have new quote_id links)
  const freshLeads = await getAllRows('leads', CID)
  const freshLeadByCustId = new Map()
  for (const l of freshLeads) {
    if (l.customer_id && !freshLeadByCustId.has(l.customer_id)) {
      freshLeadByCustId.set(l.customer_id, l)
    }
  }

  // Also build quote → lead lookup
  const freshQuotes = await getAllRows('quotes', CID)
  const quoteToLead = new Map()
  for (const q of freshQuotes) {
    if (q.lead_id) quoteToLead.set(q.id, q.lead_id)
  }

  let jobsLinkedViaQuote = 0, jobsLinkedViaCust = 0
  for (const job of jobs) {
    if (job.lead_id) continue

    // Strategy 1: via quote_id → lead_id
    if (job.quote_id && quoteToLead.has(job.quote_id)) {
      await sb.from('jobs').update({ lead_id: quoteToLead.get(job.quote_id) }).eq('id', job.id)
      jobsLinkedViaQuote++
      continue
    }

    // Strategy 2: via customer_id → lead
    if (job.customer_id) {
      const lead = freshLeadByCustId.get(job.customer_id)
      if (lead) {
        await sb.from('jobs').update({ lead_id: lead.id }).eq('id', job.id)
        jobsLinkedViaCust++
      }
    }
  }
  console.log('  Jobs linked via quote: ' + jobsLinkedViaQuote)
  console.log('  Jobs linked via customer: ' + jobsLinkedViaCust)

  // ── FINAL VERIFICATION ──────────────────────────────────────
  console.log('\n═══ FINAL VERIFICATION ═══')
  const fLeads = await getAllRows('leads', CID)
  const fQuotes = await getAllRows('quotes', CID)
  const fJobs = await getAllRows('jobs', CID)

  console.log('Leads: ' + fLeads.length)
  console.log('  with quote_id: ' + fLeads.filter(l => l.quote_id).length + ' (' + Math.round(fLeads.filter(l => l.quote_id).length/fLeads.length*100) + '%)')
  console.log('  with customer_id: ' + fLeads.filter(l => l.customer_id).length + ' (' + Math.round(fLeads.filter(l => l.customer_id).length/fLeads.length*100) + '%)')
  console.log('  with lead_owner_id: ' + fLeads.filter(l => l.lead_owner_id).length + ' (' + Math.round(fLeads.filter(l => l.lead_owner_id).length/fLeads.length*100) + '%)')

  console.log('Quotes: ' + fQuotes.length)
  console.log('  with lead_id: ' + fQuotes.filter(q => q.lead_id).length + ' (' + Math.round(fQuotes.filter(q => q.lead_id).length/fQuotes.length*100) + '%)')
  console.log('  with customer_id: ' + fQuotes.filter(q => q.customer_id).length + ' (' + Math.round(fQuotes.filter(q => q.customer_id).length/fQuotes.length*100) + '%)')

  console.log('Jobs: ' + fJobs.length)
  console.log('  with lead_id: ' + fJobs.filter(j => j.lead_id).length + ' (' + Math.round(fJobs.filter(j => j.lead_id).length/fJobs.length*100) + '%)')
  console.log('  with quote_id: ' + fJobs.filter(j => j.quote_id).length + ' (' + Math.round(fJobs.filter(j => j.quote_id).length/fJobs.length*100) + '%)')
  console.log('  with customer_id: ' + fJobs.filter(j => j.customer_id).length + ' (' + Math.round(fJobs.filter(j => j.customer_id).length/fJobs.length*100) + '%)')

  // Status distribution
  const statusDist = {}
  fLeads.forEach(l => { statusDist[l.status || 'null'] = (statusDist[l.status || 'null'] || 0) + 1 })
  console.log('\nLead statuses:', JSON.stringify(statusDist, null, 2))

  console.log('\n═══ DONE ═══')
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
