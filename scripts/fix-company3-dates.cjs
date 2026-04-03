/**
 * fix-company3-dates.cjs — Fix dates on HCP-imported data
 *
 * Problems:
 * 1. Payments have date=NULL (need to re-pull from HCP)
 * 2. Invoices only have created_at (import date), no original invoice_date
 * 3. Jobs need status normalization
 * 4. Leads need updated_at/converted_at set to original HCP dates
 *
 * Strategy: Re-pull from HCP API to get original dates, then update Company 3 records
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 3

async function hcpGet(path, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 30000)
      process.stdout.write(' [429 wait ' + (wait / 1000) + 's]')
      await new Promise(r => setTimeout(r, wait))
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

async function getAllRows(table, companyId, select = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(select).eq('company_id', companyId).range(from, from + 999)
    if (error) { console.error('  Error ' + table + ':', error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function run() {
  console.log('═══ Fix Company 3 — Dates & Statuses ═══\n')

  // ── STEP 1: Normalize job statuses ─────────────────────────
  console.log('1. NORMALIZING JOB STATUSES')
  const statusFixes = [
    { old: 'Needs scheduling', new: 'Chillin' },
    { old: 'needs scheduling', new: 'Chillin' },
    { old: 'In progress', new: 'In Progress' },
    { old: 'in progress', new: 'In Progress' },
    { old: 'Verified Complete', new: 'Completed' },
    { old: 'Waiting Product', new: 'On Hold' },
    { old: 'Complete', new: 'Completed' },
    { old: 'complete', new: 'Completed' },
  ]
  for (const fix of statusFixes) {
    const { data } = await sb.from('jobs').select('id').eq('company_id', CID).eq('status', fix.old)
    if (data && data.length > 0) {
      await sb.from('jobs').update({ status: fix.new }).eq('company_id', CID).eq('status', fix.old)
      console.log('  "' + fix.old + '" → "' + fix.new + '": ' + data.length + ' jobs')
    }
  }

  // ── STEP 2: Pull HCP invoices to get original dates ────────
  console.log('\n2. PULLING HCP INVOICES FOR ORIGINAL DATES')
  const hcpInvoices = await hcpGetAll('/invoices', 'invoices')

  // Build HCP customer name lookup for matching
  const jsInvoices = await getAllRows('invoices', CID)
  console.log('  JS invoices: ' + jsInvoices.length)

  // Match strategy: HCP invoice amount + customer → JS invoice
  // Build JS invoice lookup by amount (cents → dollars conversion)
  let invoiceDatesFixed = 0
  const jsInvByAmount = new Map() // amount → array of invoices
  for (const inv of jsInvoices) {
    const amt = parseFloat(inv.amount) || 0
    const key = amt.toFixed(2)
    if (!jsInvByAmount.has(key)) jsInvByAmount.set(key, [])
    jsInvByAmount.get(key).push(inv)
  }

  for (const hInv of hcpInvoices) {
    const hAmount = ((hInv.total_amount || 0) / 100).toFixed(2)
    const candidates = jsInvByAmount.get(hAmount)
    if (!candidates || candidates.length === 0) continue

    // Find best match: first unupdated one with same amount
    const match = candidates.find(c => !c._dateFixed)
    if (!match) continue

    // Get original date from HCP
    const originalDate = hInv.created_at || hInv.issued_date || hInv.due_date
    if (!originalDate) continue

    // Update the invoice created_at to the original HCP date
    await sb.from('invoices').update({
      created_at: originalDate,
      updated_at: originalDate
    }).eq('id', match.id)

    match._dateFixed = true
    invoiceDatesFixed++
  }
  console.log('  Invoice dates fixed: ' + invoiceDatesFixed)

  // ── STEP 3: Pull HCP payments for dates ────────────────────
  console.log('\n3. PULLING HCP PAYMENTS FOR DATES')

  // HCP doesn't have a /payments endpoint directly — payments are on invoices
  // Re-process HCP invoices for payment info
  const jsPayments = await getAllRows('payments', CID)
  console.log('  JS payments: ' + jsPayments.length)
  console.log('  Payments with null date: ' + jsPayments.filter(p => !p.date).length)

  // Match payments to invoices by invoice_id → get the invoice's created_at
  let paymentDatesFixed = 0
  for (const pay of jsPayments) {
    if (pay.date) continue // already has a date

    // If payment has invoice_id, look up that invoice's (now-fixed) created_at
    if (pay.invoice_id) {
      const { data: inv } = await sb.from('invoices').select('created_at').eq('id', pay.invoice_id).single()
      if (inv && inv.created_at) {
        await sb.from('payments').update({ date: inv.created_at.split('T')[0] }).eq('id', pay.id)
        paymentDatesFixed++
        continue
      }
    }

    // If payment has job_id, look up job's start_date
    if (pay.job_id) {
      const { data: job } = await sb.from('jobs').select('start_date,created_at').eq('id', pay.job_id).single()
      if (job) {
        const jobDate = job.start_date || job.created_at
        if (jobDate) {
          await sb.from('payments').update({ date: jobDate.split('T')[0] }).eq('id', pay.id)
          paymentDatesFixed++
          continue
        }
      }
    }
  }
  console.log('  Payment dates fixed: ' + paymentDatesFixed)

  // ── STEP 4: Fix lead dates ─────────────────────────────────
  console.log('\n4. FIXING LEAD DATES')
  // Won leads need converted_at set to something meaningful
  // Use the linked quote's created_at or job's start_date
  const wonLeads = await sb.from('leads').select('id,status,quote_id,customer_id,converted_at,updated_at,created_at')
    .eq('company_id', CID).in('status', ['Won']).then(r => r.data || [])

  let leadDatesFixed = 0
  for (const l of wonLeads) {
    if (l.converted_at && !l.converted_at.startsWith('2026-03') && !l.converted_at.startsWith('2026-04')) continue

    // Try quote date
    if (l.quote_id) {
      const { data: q } = await sb.from('quotes').select('created_at').eq('id', l.quote_id).single()
      if (q && q.created_at && !q.created_at.startsWith('2026-01')) {
        await sb.from('leads').update({ converted_at: q.created_at, updated_at: q.created_at }).eq('id', l.id)
        leadDatesFixed++
        continue
      }
    }

    // Try finding earliest job for this customer
    if (l.customer_id) {
      const { data: jobs } = await sb.from('jobs').select('start_date')
        .eq('company_id', CID).eq('customer_id', l.customer_id)
        .not('start_date', 'is', null).order('start_date', { ascending: true }).limit(1)
      if (jobs && jobs[0] && jobs[0].start_date) {
        await sb.from('leads').update({ converted_at: jobs[0].start_date, updated_at: jobs[0].start_date }).eq('id', l.id)
        leadDatesFixed++
      }
    }
  }
  console.log('  Won lead dates fixed: ' + leadDatesFixed)

  // ── STEP 5: Set jobs updated_at from start_date for completed jobs ─
  console.log('\n5. FIXING COMPLETED JOB updated_at')
  // For completed jobs, set updated_at to start_date (closer to actual completion)
  const { data: completedJobs } = await sb.from('jobs').select('id,start_date,end_date,updated_at')
    .eq('company_id', CID).eq('status', 'Completed')
    .not('start_date', 'is', null)
    .limit(10000)

  let jobDatesFixed = 0
  for (const j of (completedJobs || [])) {
    // Only fix if updated_at is an import date (March/April 2026)
    if (j.updated_at && (j.updated_at.startsWith('2026-03') || j.updated_at.startsWith('2026-04') || j.updated_at.startsWith('2026-01'))) {
      const betterDate = j.end_date || j.start_date
      if (betterDate) {
        await sb.from('jobs').update({ updated_at: betterDate }).eq('id', j.id)
        jobDatesFixed++
      }
    }
  }
  console.log('  Job updated_at fixed: ' + jobDatesFixed)

  // ── VERIFICATION ──────────────────────────────────────────
  console.log('\n═══ VERIFICATION ═══')

  // Job status distribution
  const allJobs = await getAllRows('jobs', CID, 'status')
  const jStatus = {}
  allJobs.forEach(j => { jStatus[j.status || '?'] = (jStatus[j.status || '?'] || 0) + 1 })
  console.log('Job statuses:', JSON.stringify(jStatus))

  // Payment dates
  const allPay = await getAllRows('payments', CID, 'date')
  const payNullDate = allPay.filter(p => !p.date).length
  const payWithDate = allPay.filter(p => p.date).length
  console.log('Payments: ' + allPay.length + ' total, ' + payWithDate + ' with date, ' + payNullDate + ' null')

  // Check date distribution of payments that now have dates
  const payYears = {}
  allPay.filter(p => p.date).forEach(p => { const y = (p.date || '').slice(0, 4); payYears[y] = (payYears[y] || 0) + 1 })
  console.log('Payment years:', JSON.stringify(payYears))

  // Invoice date spread
  const allInv = await getAllRows('invoices', CID, 'created_at')
  const invYears = {}
  allInv.forEach(i => { const y = (i.created_at || '').slice(0, 4); invYears[y] = (invYears[y] || 0) + 1 })
  console.log('Invoice years (created_at):', JSON.stringify(invYears))

  console.log('\n═══ DONE ═══')
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
