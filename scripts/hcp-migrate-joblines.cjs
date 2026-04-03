const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 5

// Slower HCP API helper — waits between calls and retries with longer backoff
async function hcpGet(path, retries = 6) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      const wait = Math.min(5000 * Math.pow(2, attempt), 60000)
      process.stdout.write(' [429, wait ' + (wait/1000) + 's]')
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      // For line items, 404 means job has none
      if (res.status === 404) return { line_items: [] }
      const text = await res.text()
      throw new Error('HCP ' + res.status + ' on ' + path + ': ' + text)
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

let idCounter = 50000
function genId(prefix) { idCounter++; return prefix + '-HCP-' + String(idCounter).padStart(5, '0') }

async function insertBatch(table, rows) {
  if (rows.length === 0) return []
  const all = []
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await sb.from(table).insert(chunk).select()
    if (error) {
      console.error('Insert error ' + table + ':', error.message)
      for (const row of chunk) {
        const { data: s, error: e } = await sb.from(table).insert(row).select()
        if (e) console.error('  Bad:', e.message)
        else if (s) all.push(...s)
      }
    } else if (data) all.push(...data)
  }
  return all
}

async function run() {
  console.log('=== Job Line Items Migration (company_id=' + CID + ') ===\n')

  // Load products for matching
  const { data: products } = await sb.from('products_services').select('*').eq('company_id', CID)
  console.log('Products: ' + (products||[]).length)

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

  // Load ALL existing jobs (need to paginate Supabase — default limit is 1000)
  let allJobs = []
  let from = 0
  while (true) {
    const { data } = await sb.from('jobs').select('id, job_id').eq('company_id', CID).range(from, from + 999).order('id')
    if (!data || data.length === 0) break
    allJobs.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  console.log('Total jobs in DB: ' + allJobs.length)

  // Delete any existing job_lines (should be 0 but just in case)
  await sb.from('job_lines').delete().eq('company_id', CID)

  // Fetch HCP jobs in same order
  const hcpJobs = await hcpGetAll('/jobs', 'jobs', 100)
  console.log('HCP jobs: ' + hcpJobs.length + ', DB jobs: ' + allJobs.length)

  // Process in smaller batches with deliberate delays
  const BATCH_SIZE = 20
  const DELAY_BETWEEN_BATCHES = 3000 // 3 seconds between batches of 20
  const jobLineRows = []
  let processed = 0
  let apiErrors = 0

  for (let batch = 0; batch < hcpJobs.length; batch += BATCH_SIZE) {
    const batchJobs = hcpJobs.slice(batch, batch + BATCH_SIZE)

    for (let i = 0; i < batchJobs.length; i++) {
      const hcpJob = batchJobs[i]
      const jsJob = allJobs[batch + i]
      if (!jsJob) continue

      processed++

      try {
        const liData = await hcpGet('/jobs/' + hcpJob.id + '/line_items')
        const items = liData.data || liData.line_items || []
        for (const li of items) {
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
        apiErrors++
        if (apiErrors < 10) console.error('  Error on job ' + hcpJob.id + ': ' + e.message)
      }
    }

    if (processed % 100 === 0 || processed === hcpJobs.length) {
      process.stdout.write('  Processed ' + processed + '/' + hcpJobs.length + ' jobs, ' + jobLineRows.length + ' lines found\r')
    }

    // Deliberate delay between batches
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES))
  }

  console.log('\n  Total job lines found: ' + jobLineRows.length)
  console.log('  API errors: ' + apiErrors)

  if (jobLineRows.length > 0) {
    console.log('  Inserting...')
    await insertBatch('job_lines', jobLineRows)
    console.log('  Done!')
  } else {
    console.log('  No job lines found — HCP jobs may not have line items via API')
  }

  // Final count
  const { count } = await sb.from('job_lines').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('\nFinal job_lines count: ' + (count || 0))
}

run().catch(err => { console.error('FAILED:', err); process.exit(1) })
