const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 5

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

function c2d(cents) { return cents ? Number((cents / 100).toFixed(2)) : 0 }

async function getAllRows(table, companyId, cols = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data } = await sb.from(table).select(cols).eq('company_id', companyId).range(from, from + 999).order('id')
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function run() {
  console.log('=== Fixing Amounts for Company ' + CID + ' ===\n')

  // ══════════════════════════════════════════════════════════
  // 1. FIX QUOTE AMOUNTS — sum from quote_lines
  // ══════════════════════════════════════════════════════════
  console.log('1. QUOTE AMOUNTS (from quote_lines)')
  const quoteLines = await getAllRows('quote_lines', CID, 'id, quote_id, total, price, quantity')
  console.log('  Total quote_lines: ' + quoteLines.length)

  // Group totals by quote_id
  const quoteTotals = new Map()
  for (const ql of quoteLines) {
    const amt = ql.total || (ql.price * ql.quantity) || 0
    quoteTotals.set(ql.quote_id, (quoteTotals.get(ql.quote_id) || 0) + amt)
  }
  console.log('  Quotes with line items: ' + quoteTotals.size)

  let qUpdated = 0
  for (const [quoteId, total] of quoteTotals) {
    if (total > 0) {
      await sb.from('quotes').update({ quote_amount: Number(total.toFixed(2)) }).eq('id', quoteId)
      qUpdated++
    }
  }
  console.log('  Updated ' + qUpdated + ' quote amounts')

  // For quotes with no lines, try HCP estimates directly
  const allQuotes = await getAllRows('quotes', CID, 'id, quote_id, quote_amount')
  const zeroQuotes = allQuotes.filter(q => !q.quote_amount || q.quote_amount === 0)
  console.log('  Still zero after line-item calc: ' + zeroQuotes.length + '/' + allQuotes.length)

  // ══════════════════════════════════════════════════════════
  // 2. FIX JOB TOTALS — for jobs with 0, calc from job_lines
  // ══════════════════════════════════════════════════════════
  console.log('\n2. JOB TOTALS (from job_lines)')
  const jobLines = await getAllRows('job_lines', CID, 'id, job_id, total, price, quantity')
  console.log('  Total job_lines: ' + jobLines.length)

  const jobTotals = new Map()
  for (const jl of jobLines) {
    const amt = jl.total || (jl.price * jl.quantity) || 0
    jobTotals.set(jl.job_id, (jobTotals.get(jl.job_id) || 0) + amt)
  }

  // Only update jobs that have 0
  const zeroJobs = await getAllRows('jobs', CID, 'id, job_total')
  let jUpdated = 0
  for (const job of zeroJobs) {
    if ((!job.job_total || job.job_total === 0) && jobTotals.has(job.id)) {
      const total = jobTotals.get(job.id)
      if (total > 0) {
        await sb.from('jobs').update({ job_total: Number(total.toFixed(2)) }).eq('id', job.id)
        jUpdated++
      }
    }
  }
  console.log('  Updated ' + jUpdated + ' job totals from job_lines')

  // ══════════════════════════════════════════════════════════
  // 3. FIX INVOICE AMOUNTS — from HCP invoice items
  // ══════════════════════════════════════════════════════════
  console.log('\n3. INVOICE AMOUNTS (from HCP API)')

  // Fetch all HCP invoices
  console.log('  Fetching HCP invoices...')
  const hcpInvoices = []
  for (let p = 1; p <= 100; p++) {
    const data = await hcpGet('/invoices?page=' + p + '&page_size=200')
    if (!data || !data.invoices || data.invoices.length === 0) break
    hcpInvoices.push(...data.invoices)
    if (p % 10 === 0) process.stdout.write('  ' + hcpInvoices.length + ' invoices...\r')
  }
  console.log('  Fetched ' + hcpInvoices.length + ' HCP invoices')

  // Get DB invoices (same order as HCP insert)
  const dbInvoices = await getAllRows('invoices', CID, 'id, invoice_id, amount, customer_id, job_id')
  console.log('  DB invoices: ' + dbInvoices.length)

  // Also need customer lookup for fixing null customer_id
  const dbCustomers = await getAllRows('customers', CID, 'id, name')
  const custByName = new Map()
  for (const c of dbCustomers) custByName.set((c.name || '').toLowerCase(), c.id)

  // Also get jobs for linking
  const dbJobs = await getAllRows('jobs', CID, 'id, customer_name')

  let invUpdated = 0
  let custFixed = 0
  for (let i = 0; i < Math.min(hcpInvoices.length, dbInvoices.length); i++) {
    const hcp = hcpInvoices[i]
    const db = dbInvoices[i]
    const updates = {}

    // Calculate amount from items
    let totalFromItems = 0
    for (const item of (hcp.items || [])) {
      const qty = item.qty_in_hundredths ? item.qty_in_hundredths / 100 : (item.quantity || 1)
      totalFromItems += (item.unit_price || 0) * qty
    }
    // Also check top-level fields
    const hcpTotal = hcp.total_amount || hcp.total || hcp.amount || totalFromItems
    const amount = c2d(hcpTotal)

    if (amount > 0 && (!db.amount || db.amount === 0)) {
      updates.amount = amount
    }

    // Fix customer_id
    if (!db.customer_id && hcp.customer) {
      const name = ((hcp.customer.first_name || '') + ' ' + (hcp.customer.last_name || '')).trim().toLowerCase()
      const custId = custByName.get(name)
      if (custId) {
        updates.customer_id = custId
        custFixed++
      }
    }

    // Add description from HCP
    if (hcp.description || (hcp.items && hcp.items[0])) {
      const desc = hcp.description || (hcp.items || []).map(it => it.name).filter(Boolean).join(', ')
      if (desc) updates.job_description = desc.slice(0, 500)
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('invoices').update(updates).eq('id', db.id)
      if (updates.amount) invUpdated++
    }

    if (i % 500 === 0 && i > 0) process.stdout.write('  ' + i + '/' + dbInvoices.length + ' invoices processed...\r')
  }
  console.log('\n  Updated ' + invUpdated + ' invoice amounts')
  console.log('  Fixed ' + custFixed + ' invoice customer_ids')

  // ══════════════════════════════════════════════════════════
  // 4. FIX REMAINING JOB TOTALS from HCP API (for jobs with no job_lines)
  // ══════════════════════════════════════════════════════════
  console.log('\n4. REMAINING JOB TOTALS (from HCP API)')

  const { count: stillZeroJobs } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('job_total', 0)
  console.log('  Jobs still at 0: ' + stillZeroJobs)

  if (stillZeroJobs > 0) {
    console.log('  Fetching HCP jobs...')
    const hcpJobs = []
    for (let p = 1; p <= 100; p++) {
      const data = await hcpGet('/jobs?page=' + p + '&page_size=200')
      if (!data || !data.jobs || data.jobs.length === 0) break
      hcpJobs.push(...data.jobs)
      if (p % 10 === 0) process.stdout.write('  ' + hcpJobs.length + ' jobs...\r')
    }
    console.log('  Fetched ' + hcpJobs.length + ' HCP jobs')

    const allDbJobs = await getAllRows('jobs', CID, 'id, job_total')
    let jFixed = 0
    for (let i = 0; i < Math.min(hcpJobs.length, allDbJobs.length); i++) {
      const hcp = hcpJobs[i]
      const db = allDbJobs[i]
      if ((!db.job_total || db.job_total === 0) && hcp.total_amount > 0) {
        await sb.from('jobs').update({ job_total: c2d(hcp.total_amount) }).eq('id', db.id)
        jFixed++
      }
    }
    console.log('  Fixed ' + jFixed + ' more job totals from HCP total_amount')
  }

  // ══════════════════════════════════════════════════════════
  // 5. FIX QUOTE AMOUNTS from HCP estimate line items (for still-zero quotes)
  // ══════════════════════════════════════════════════════════
  console.log('\n5. REMAINING QUOTE AMOUNTS (from HCP estimate line items)')

  const { count: stillZeroQuotes } = await sb.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('quote_amount', 0)
  console.log('  Quotes still at 0: ' + stillZeroQuotes)

  if (stillZeroQuotes > 0) {
    console.log('  Fetching HCP estimates...')
    const hcpEstimates = []
    for (let p = 1; p <= 50; p++) {
      const data = await hcpGet('/estimates?page=' + p + '&page_size=200')
      if (!data || !data.estimates || data.estimates.length === 0) break
      hcpEstimates.push(...data.estimates)
    }
    console.log('  Fetched ' + hcpEstimates.length + ' HCP estimates')

    const allDbQuotes = await getAllRows('quotes', CID, 'id, quote_amount')
    let eFixed = 0

    for (let i = 0; i < Math.min(hcpEstimates.length, allDbQuotes.length); i++) {
      const hcp = hcpEstimates[i]
      const db = allDbQuotes[i]

      if (db.quote_amount && db.quote_amount > 0) continue

      // Try to get line items for each option
      let totalAmount = 0
      for (const opt of (hcp.options || [])) {
        if (opt.total) {
          totalAmount += opt.total
          continue
        }
        // Fetch line items
        if (opt.id) {
          try {
            const liData = await hcpGet('/estimates/' + hcp.id + '/options/' + opt.id + '/line_items')
            const items = liData ? (liData.data || liData.line_items || []) : []
            for (const li of items) {
              totalAmount += (li.unit_price || 0) * (li.quantity || 1)
            }
          } catch (e) { /* skip */ }
        }
      }

      if (totalAmount > 0) {
        await sb.from('quotes').update({ quote_amount: c2d(totalAmount) }).eq('id', db.id)
        eFixed++
      }

      if (i % 100 === 0 && i > 0) process.stdout.write('  estimates ' + i + '/' + hcpEstimates.length + '...\r')
      // Rate limit
      if (i % 20 === 0) await new Promise(r => setTimeout(r, 500))
    }
    console.log('\n  Fixed ' + eFixed + ' more quote amounts from HCP line items')
  }

  // ══════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════')
  console.log('  AMOUNT FIX SUMMARY')
  console.log('══════════════════════════════════════')

  const { count: zq } = await sb.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('quote_amount', 0)
  const { count: tq } = await sb.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('  Quotes with amount=0: ' + zq + '/' + tq)

  const { count: zj } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('job_total', 0)
  const { count: tj } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('  Jobs with total=0: ' + zj + '/' + tj)

  const { count: zi } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('amount', 0)
  const { count: ti } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('  Invoices with amount=0: ' + zi + '/' + ti)

  const { count: zp } = await sb.from('payments').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('amount', 0)
  const { count: tp } = await sb.from('payments').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('  Payments with amount=0: ' + zp + '/' + tp)

  const { count: nc } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID).is('customer_id', null)
  console.log('  Invoices with no customer: ' + nc + '/' + ti)

  console.log('══════════════════════════════════════')
}

run().catch(err => { console.error('FAILED:', err); process.exit(1) })
