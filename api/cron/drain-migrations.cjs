// Vercel cron worker — drains queued migration_jobs.
//
// Runs every minute via vercel.json "crons". Picks the oldest queued
// hcp-onboarding-import job and processes one batch of customers per
// invocation, saving its cursor back to migration_jobs.report so the
// next invocation picks up where this one left off. Avoids the 5-min
// function timeout for tenants with thousands of customers.
//
// Auth: Vercel cron sends `x-vercel-cron-signature` automatically; we
// also accept a CRON_SECRET bearer token for manual / Railway runs.

const { createClient } = require('@supabase/supabase-js')
const { importOneCustomer } = require('../../scripts/lib/hcpImporter.cjs')

const BATCH = parseInt(process.env.MIGRATION_BATCH || '10', 10)
const HCP_BASE = 'https://api.housecallpro.com'

async function listHcpCustomers(hcpKey, page) {
  const r = await fetch(`${HCP_BASE}/customers?page=${page}&page_size=100`, {
    headers: { Authorization: 'Token ' + hcpKey, Accept: 'application/json' }
  })
  if (!r.ok) throw new Error(`HCP /customers ${r.status}`)
  return r.json()
}

module.exports = async function handler(req, res) {
  // Auth: prefer Vercel's signed cron header; otherwise require bearer.
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Pick the oldest queued or running onboarding import. Running rows
  // are picked up too because each invocation processes a batch and
  // leaves status='running' until the cursor reaches the end.
  const { data: jobs, error: pickErr } = await sb.from('migration_jobs')
    .select('*')
    .in('status', ['queued', 'running'])
    .eq('source', 'hcp-onboarding-import')
    .order('id', { ascending: true })
    .limit(1)
  if (pickErr) return res.status(500).json({ error: pickErr.message })
  if (!jobs?.length) return res.status(200).json({ ok: true, message: 'no jobs queued' })

  const job = jobs[0]
  const hcpKey = job.report?.hcp_api_key
  if (!hcpKey) {
    await sb.from('migration_jobs').update({ status: 'error', error: 'missing hcp_api_key in report', finished_at: new Date().toISOString() }).eq('id', job.id)
    return res.status(200).json({ ok: false, message: 'job missing api key, marked error' })
  }

  // Cursor: { page, customerIndex, totalImported, customerCursor }
  const cursor = job.report?.cursor || { page: 1, customerIndex: 0, totalImported: 0, totalErrors: 0 }
  const startedAt = job.started_at || new Date().toISOString()

  // Fetch the current HCP customers page
  const pageData = await listHcpCustomers(hcpKey, cursor.page)
  const custs = pageData.customers || []
  const totalPages = pageData.total_pages || 1

  if (!custs.length) {
    // Done.
    await sb.from('migration_jobs').update({
      status: 'finished',
      finished_at: new Date().toISOString(),
      counts: { customers_imported: cursor.totalImported, errors: cursor.totalErrors },
      report: { ...job.report, hcp_api_key: undefined, cursor }, // scrub key
    }).eq('id', job.id)
    return res.status(200).json({ ok: true, message: 'finished', cursor })
  }

  // Process up to BATCH customers from current page
  let processed = 0
  let errors = 0
  const sliceStart = cursor.customerIndex
  for (let i = sliceStart; i < custs.length && processed < BATCH; i++) {
    const c = custs[i]
    try {
      const r = await importOneCustomer({
        companyId: job.company_id,
        hcpCustomerId: c.id,
        hcpKey,
        sb,
      })
      cursor.totalImported++
      if (r.error) { cursor.totalErrors++; errors++ }
    } catch (e) {
      cursor.totalErrors++
      errors++
    }
    cursor.customerIndex = i + 1
    processed++
  }

  // Advance page if we finished current page
  if (cursor.customerIndex >= custs.length) {
    cursor.page++
    cursor.customerIndex = 0
  }

  const isFinal = cursor.page > totalPages
  const status = isFinal ? 'finished' : 'running'
  const update = {
    status,
    started_at: startedAt,
    counts: { customers_imported: cursor.totalImported, errors_total: cursor.totalErrors },
    report: {
      ...job.report,
      cursor,
      // Scrub the API key once we're done so it isn't sitting in the DB.
      ...(isFinal ? { hcp_api_key: undefined } : {}),
    },
    ...(isFinal ? { finished_at: new Date().toISOString() } : {}),
  }
  await sb.from('migration_jobs').update(update).eq('id', job.id)

  return res.status(200).json({ ok: true, processed, errors, cursor, isFinal })
}
