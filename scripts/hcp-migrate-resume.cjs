const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 5 // company created in first run

// ── HCP API helper with retry on 429 ────────────────────────────
async function hcpGet(path, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 30000)
      process.stdout.write(' [429, waiting ' + (wait/1000) + 's...]')
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error('HCP API error ' + res.status + ' on ' + path + ': ' + text)
    }
    return res.json()
  }
  throw new Error('Rate limit exceeded on ' + path)
}

async function hcpGetAll(path, key, maxPages = 100) {
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

function c2d(cents) { return cents ? Number((cents / 100).toFixed(2)) : 0 }

let idCounter = 20000 // offset to avoid collisions with first run
function genId(prefix) { idCounter++; return prefix + '-HCP-' + String(idCounter).padStart(5, '0') }

async function insertBatch(table, rows) {
  if (rows.length === 0) return []
  const allInserted = []
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await sb.from(table).insert(chunk).select()
    if (error) {
      console.error('Insert error on ' + table + ' (chunk ' + Math.floor(i/500) + '):', error.message)
      for (const row of chunk) {
        const { data: single, error: sErr } = await sb.from(table).insert(row).select()
        if (sErr) console.error('  Bad row:', sErr.message, JSON.stringify(row).slice(0, 150))
        else if (single) allInserted.push(...single)
      }
    } else if (data) {
      allInserted.push(...data)
    }
  }
  return allInserted
}

function mapInvoiceStatus(s) {
  const map = { 'new':'Pending','due':'Pending','overdue':'Overdue','paid':'Paid','partial':'Partial','void':'Void','closed':'Paid','open':'Pending','pending':'Pending' }
  return map[(s||'').toLowerCase()] || 'Pending'
}
function mapPaymentStatus(s) {
  const map = { 'succeeded':'Completed','pending':'Pending','failed':'Failed','refunded':'Refunded' }
  return map[(s||'').toLowerCase()] || 'Pending'
}
function mapPaymentMethod(s) {
  const map = { 'cash':'Cash','check':'Check','credit_card':'Credit Card','ach':'ACH','financing':'Financing','other':'Other' }
  return map[(s||'').toLowerCase()] || 'Other'
}

async function run() {
  console.log('=== HCP Migration RESUME (company_id=' + CID + ') ===\n')

  // Load existing data from first run
  const { data: products } = await sb.from('products_services').select('*').eq('company_id', CID)
  console.log('Products in company: ' + (products||[]).length)

  const productByName = new Map()
  for (const p of (products||[])) {
    productByName.set(p.name, p)
    productByName.set(p.name.toLowerCase(), p)
  }
  function findProduct(name) {
    if (!name) return null
    let m = productByName.get(name) || productByName.get(name.toLowerCase())
    if (m) return m
    const lower = name.toLowerCase()
    for (const p of (products||[])) {
      if (lower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lower)) return p
    }
    return null
  }

  // Load existing jobs (already inserted)
  const { data: existingJobs } = await sb.from('jobs').select('id, job_id').eq('company_id', CID)
  console.log('Existing jobs: ' + (existingJobs||[]).length)

  // Load existing customers
  const { data: existingCustomers } = await sb.from('customers').select('id, name').eq('company_id', CID)
  const custByName = new Map()
  for (const c of (existingCustomers||[])) { custByName.set(c.name.toLowerCase(), c) }

  // Check how many job_lines already exist
  const { count: existingJobLines } = await sb.from('job_lines').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('Existing job_lines: ' + (existingJobLines || 0))

  // Check how many invoices already exist
  const { count: existingInvCount } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('Existing invoices: ' + (existingInvCount || 0))

  // ── STEP 6b: Re-fetch job line items (got 0 due to rate limiting) ──
  if ((existingJobLines || 0) === 0 && (existingJobs||[]).length > 0) {
    console.log('\nSTEP 6b: Fetching job line items (with rate limit handling)...')

    // Re-fetch all HCP jobs to get HCP IDs
    const hcpJobs = await hcpGetAll('/jobs', 'jobs', 100)

    // Map HCP job invoice_number to our jobs (job_id field stores our genId)
    // We need to match by order — same as first run
    const jobLineRows = []
    let count = 0
    for (let i = 0; i < hcpJobs.length; i++) {
      const hcpJob = hcpJobs[i]
      const jsJob = existingJobs[i] // same order as first insert
      if (!jsJob) continue

      count++
      if (count % 100 === 0) process.stdout.write('  job lines ' + count + '/' + hcpJobs.length + '...\r')

      try {
        const liData = await hcpGet('/jobs/' + hcpJob.id + '/line_items')
        for (const li of (liData.line_items || [])) {
          const product = findProduct(li.name)
          jobLineRows.push({
            company_id: CID,
            job_line_id: genId('JL'),
            job_id: jsJob.id,
            item_id: product ? product.id : null,
            description: li.name || 'Unnamed Item',
            quantity: li.quantity || 1,
            price: c2d(li.unit_price || li.unit_cost || 0),
            total: c2d((li.unit_price || 0) * (li.quantity || 1)),
          })
        }
      } catch (e) {
        // skip jobs without line items
      }

      // Small delay every 50 requests to avoid 429
      if (count % 50 === 0) await new Promise(r => setTimeout(r, 500))
    }

    console.log('\n  Inserting ' + jobLineRows.length + ' job lines...')
    await insertBatch('job_lines', jobLineRows)
    console.log('  Done with job lines')
  } else {
    console.log('  Skipping job lines (already ' + (existingJobLines||0) + ' exist)')
  }

  // ── STEP 7: Invoices + Payments ─────────────────────────────
  if ((existingInvCount || 0) === 0) {
    console.log('\nSTEP 7: Pulling invoices from HCP (with rate limit handling)...')

    // Small delay before starting to let rate limit window reset
    console.log('  Waiting 10s for rate limit to reset...')
    await new Promise(r => setTimeout(r, 10000))

    const hcpInvoices = await hcpGetAll('/invoices', 'invoices', 100)

    // Re-fetch HCP jobs to build lookup
    console.log('  Building job lookup...')
    const hcpJobs = await hcpGetAll('/jobs', 'jobs', 100)
    const jobByHcpId = new Map()
    for (let i = 0; i < hcpJobs.length; i++) {
      if (existingJobs[i]) jobByHcpId.set(hcpJobs[i].id, existingJobs[i])
    }

    const invoiceRows = []
    const paymentBatch = [] // { hcpPayments, invIdx }

    for (const inv of hcpInvoices) {
      // Find customer
      let custId = null
      if (inv.customer) {
        const name = ((inv.customer.first_name||'') + ' ' + (inv.customer.last_name||'')).trim().toLowerCase()
        const match = custByName.get(name)
        if (match) custId = match.id
      }

      // Find linked job
      const linkedJob = inv.job_id ? jobByHcpId.get(inv.job_id) : null

      const idx = invoiceRows.length
      invoiceRows.push({
        company_id: CID,
        invoice_id: genId('INV'),
        customer_id: custId,
        job_id: linkedJob ? linkedJob.id : null,
        amount: c2d(inv.total_amount || 0),
        payment_status: mapInvoiceStatus(inv.status),
        payment_method: '',
        job_description: inv.description || '',
        created_at: inv.created_at || new Date().toISOString(),
      })

      paymentBatch.push({ payments: inv.payments || [], invIdx: idx })
    }

    console.log('  Inserting ' + invoiceRows.length + ' invoices...')
    const newInvoices = await insertBatch('invoices', invoiceRows)
    console.log('  Inserted ' + newInvoices.length + ' invoices')

    // Insert payments
    const paymentRows = []
    for (const { payments, invIdx } of paymentBatch) {
      const jsInv = newInvoices[invIdx]
      if (!jsInv) continue

      for (const pmt of payments) {
        paymentRows.push({
          company_id: CID,
          payment_id: genId('PMT'),
          invoice_id: jsInv.id,
          amount: c2d(pmt.amount || 0),
          date: pmt.paid_at ? pmt.paid_at.split('T')[0] : (pmt.created_at ? pmt.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
          method: mapPaymentMethod(pmt.payment_method),
          status: mapPaymentStatus(pmt.status),
          notes: 'Migrated from HouseCall Pro',
        })
      }
    }

    console.log('  Inserting ' + paymentRows.length + ' payments...')
    await insertBatch('payments', paymentRows)
    console.log('  Done with payments')
  } else {
    console.log('  Skipping invoices (already ' + (existingInvCount||0) + ' exist)')
  }

  // ── Summary ─────────────────────────────────────────────────
  const counts = {}
  for (const table of ['products_services','employees','customers','leads','quotes','quote_lines','jobs','job_lines','invoices','payments']) {
    const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('company_id', CID)
    counts[table] = count || 0
  }

  console.log('\n══════════════════════════════════════')
  console.log('  MIGRATION RESUME COMPLETE (company_id=' + CID + ')')
  console.log('══════════════════════════════════════')
  for (const [t, c] of Object.entries(counts)) {
    console.log('  ' + t + ': ' + c)
  }
  console.log('══════════════════════════════════════')
}

run().catch(err => {
  console.error('RESUME FAILED:', err)
  process.exit(1)
})
