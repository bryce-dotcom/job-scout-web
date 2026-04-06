/**
 * fix-hcp-dates.cjs — Pull real dates from HCP API and update Company 3 records
 *
 * Updates ONLY date fields. Never touches status, amounts, customer links, or any other data.
 */
require('dotenv').config()
const sb = require('@supabase/supabase-js').createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'
const CID = 3

async function hcpGetAll(path, key) {
  const all = []
  for (let p = 1; p <= 200; p++) {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(BASE + path + sep + 'page=' + p + '&page_size=200', {
      headers: { 'Authorization': 'Token ' + KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) { await new Promise(r => setTimeout(r, 3000)); p--; continue }
    const d = await res.json()
    if (!d[key] || d[key].length === 0) break
    all.push(...d[key])
    if (p % 10 === 0) process.stderr.write('  ' + key + ': ' + all.length + '...\r')
  }
  console.log('  Fetched ' + all.length + ' ' + key)
  return all
}

async function getAll(table, select) {
  const all = []
  let from = 0
  while (true) {
    const { data } = await sb.from(table).select(select).eq('company_id', CID).range(from, from + 999)
    if (!data || !data.length) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function run() {
  console.log('=== Fix HCP Dates — Company 3 ===\n')

  // ── STEP 1: Pull HCP estimates ─────────────────────────────
  console.log('1. Pulling HCP estimates...')
  const hcpEstimates = await hcpGetAll('/estimates', 'estimates')

  // ── STEP 2: Pull HCP jobs ──────────────────────────────────
  console.log('2. Pulling HCP jobs...')
  const hcpJobs = await hcpGetAll('/jobs', 'jobs')

  // ── STEP 3: Load JS data ───────────────────────────────────
  console.log('3. Loading JS data...')
  const jsQuotes = await getAll('quotes', 'id,quote_id,created_at,sent_date,approved_date,lead_id')
  const jsJobs = await getAll('jobs', 'id,job_id,start_date,end_date,created_at,updated_at,status')
  const jsLeads = await getAll('leads', 'id,created_at,converted_at,quote_id')
  console.log('  JS: ' + jsQuotes.length + ' quotes, ' + jsJobs.length + ' jobs, ' + jsLeads.length + ' leads')

  // Build JS lookup by quote_id (estimate number) and job_id (invoice number)
  const jsByQuoteId = new Map()
  jsQuotes.forEach(q => { if (q.quote_id) jsByQuoteId.set(q.quote_id, q) })

  const jsByJobId = new Map()
  jsJobs.forEach(j => { if (j.job_id) jsByJobId.set(j.job_id, j) })

  // ── STEP 4: Update quote dates from HCP estimates ──────────
  console.log('\n4. Updating quote dates...')
  let quotesUpdated = 0, quotesSkipped = 0

  for (const est of hcpEstimates) {
    // Match by estimate_number → quote_id
    const estNum = est.estimate_number || est.id
    let jsQuote = jsByQuoteId.get(String(estNum))
    if (!jsQuote) {
      // Try matching by HCP ID fragments
      for (const [qid, q] of jsByQuoteId) {
        if (qid === String(estNum)) { jsQuote = q; break }
      }
    }
    if (!jsQuote) { quotesSkipped++; continue }

    const updates = {}

    // created_at → HCP estimate created_at
    if (est.created_at) {
      updates.created_at = est.created_at
    }

    // sent_date → HCP schedule.scheduled_start (when estimate was presented)
    if (est.schedule && est.schedule.scheduled_start) {
      updates.sent_date = est.schedule.scheduled_start
    }

    // approved_date → from option approval
    if (est.options && est.options.length > 0) {
      const approvedOpt = est.options.find(o => o.approval_status === 'approved')
      if (approvedOpt && approvedOpt.updated_at) {
        updates.approved_date = approvedOpt.updated_at
      }
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('quotes').update(updates).eq('id', jsQuote.id)
      quotesUpdated++

      // Also update the linked lead's created_at if it exists
      if (jsQuote.lead_id && updates.created_at) {
        const lead = jsLeads.find(l => l.id === jsQuote.lead_id)
        if (lead) {
          const leadUpdates = { created_at: updates.created_at }
          if (updates.approved_date) {
            leadUpdates.converted_at = updates.approved_date
          }
          await sb.from('leads').update(leadUpdates).eq('id', lead.id)
        }
      }
    }
  }
  console.log('  Quotes updated: ' + quotesUpdated + ', skipped: ' + quotesSkipped)

  // ── STEP 5: Update job dates from HCP jobs ─────────────────
  console.log('\n5. Updating job dates...')
  let jobsUpdated = 0, jobsSkipped = 0

  for (const hJob of hcpJobs) {
    // Match by invoice_number → job_id
    const invNum = hJob.invoice_number || ''
    let jsJob = jsByJobId.get(String(invNum))
    if (!jsJob && invNum) {
      // Try variations
      jsJob = jsByJobId.get(invNum)
    }
    if (!jsJob) { jobsSkipped++; continue }

    const updates = {}

    // created_at → HCP job created_at
    if (hJob.created_at) {
      updates.created_at = hJob.created_at
    }

    // start_date → HCP schedule.scheduled_start
    if (hJob.schedule && hJob.schedule.scheduled_start) {
      updates.start_date = hJob.schedule.scheduled_start
    }

    // end_date → HCP schedule.scheduled_end
    if (hJob.schedule && hJob.schedule.scheduled_end) {
      updates.end_date = hJob.schedule.scheduled_end
    }

    // updated_at → HCP work_timestamps.completed_at (THE KEY DATE for dashboard)
    if (hJob.work_timestamps && hJob.work_timestamps.completed_at) {
      updates.updated_at = hJob.work_timestamps.completed_at
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('jobs').update(updates).eq('id', jsJob.id)
      jobsUpdated++
    }
  }
  console.log('  Jobs updated: ' + jobsUpdated + ', skipped: ' + jobsSkipped)

  // ── VERIFICATION ──────────────────────────────────────────
  console.log('\n=== VERIFICATION ===')

  // Check date distributions
  const finalJobs = await getAll('jobs', 'status,start_date,updated_at')
  const completedWithRealDate = finalJobs.filter(j =>
    j.status === 'Completed' && j.updated_at &&
    !j.updated_at.startsWith('2026-01-2') && !j.updated_at.startsWith('2026-03-0') && !j.updated_at.startsWith('2026-04-0')
  )
  console.log('Completed jobs with real updated_at: ' + completedWithRealDate.length + ' / ' + finalJobs.filter(j => j.status === 'Completed').length)

  // YTD completed by real date
  const ytd2026 = finalJobs.filter(j => j.status === 'Completed' && j.updated_at && j.updated_at.startsWith('2026'))
  const ytdTotal = ytd2026.reduce((s, j) => s, 0) // just count
  console.log('Jobs completed in 2026 (by updated_at): ' + ytd2026.length)

  // Monthly distribution of completed jobs
  const monthDist = {}
  finalJobs.filter(j => j.status === 'Completed' && j.updated_at).forEach(j => {
    const m = j.updated_at.slice(0, 7)
    monthDist[m] = (monthDist[m] || 0) + 1
  })
  const sortedMonths = Object.entries(monthDist).sort((a, b) => b[0].localeCompare(a[0]))
  console.log('\nCompleted jobs by month (updated_at):')
  sortedMonths.slice(0, 12).forEach(([m, c]) => console.log('  ' + m + ': ' + c))

  // Quote approved dates
  const finalQuotes = await getAll('quotes', 'approved_date,status')
  const withApproved = finalQuotes.filter(q => q.approved_date)
  console.log('\nQuotes with approved_date: ' + withApproved.length + ' / ' + finalQuotes.length)

  console.log('\n=== DONE ===')
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
