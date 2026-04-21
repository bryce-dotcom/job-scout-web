// Back-fill jobs.salesperson_id for HHH (company 3) by re-reading
// assigned_employees on the original Housecall Pro estimates.
//
// Why: the initial HCP migration mostly left salesperson_id null because
// HCP's /employees endpoint (API-key scope) only returned Bryce. But the
// assigned_employees array embedded in each estimate/job payload has the
// real rep with email, so we can re-map to JobScout employees by email.
//
// Strategy:
//   1. Pull all HCP estimates (paginated).
//   2. For each estimate, take assigned_employees[0] as the primary rep.
//   3. Match HCP estimate -> JobScout quote by customer email (case-ins.)
//      + created_at within a day. Pick the closest match.
//   4. Map HCP employee email -> JobScout employees.id.
//   5. Set quote.salesperson_id (if null) and for every job linked to
//      that quote, set jobs.salesperson_id (if null).
//   6. Also pull HCP jobs to catch jobs that weren't created from an
//      estimate.
//
// Safe by default: dry-run mode prints planned updates without writing.
// Pass --commit to actually apply.

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 3
const COMMIT = process.argv.includes('--commit')

async function hcpGet(path, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' },
    })
    if (res.status === 429) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 30000)
      process.stdout.write(` [429 wait ${wait/1000}s] `)
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) throw new Error(`HCP ${res.status} ${path}: ${await res.text()}`)
    return res.json()
  }
  throw new Error('HCP rate limit exceeded')
}

async function hcpGetAll(path, key) {
  const all = []
  for (let p = 1; p <= 200; p++) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await hcpGet(`${path}${sep}page=${p}&page_size=200`)
    const items = data[key]
    if (!items || items.length === 0) break
    all.push(...items)
    process.stdout.write(`  ${key} p${p}: ${all.length} total\r`)
  }
  console.log(`  ${key} total: ${all.length}`)
  return all
}

async function paginateSb(buildQuery) {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

function normEmail(e) { return (e || '').trim().toLowerCase() }
function dateKey(iso) { return (iso || '').slice(0, 10) }

(async () => {
  console.log('Mode:', COMMIT ? 'COMMIT (will write)' : 'DRY-RUN (no writes)')

  // 1. Pull HCP estimates
  console.log('\n1. Fetching HCP estimates...')
  const hcpEstimates = await hcpGetAll('/estimates', 'estimates')

  // 2. Pull HCP jobs (for jobs not tied to an estimate)
  console.log('\n2. Fetching HCP jobs...')
  const hcpJobs = await hcpGetAll('/jobs', 'jobs')

  // 3. Pull JobScout data
  console.log('\n3. Fetching JobScout data...')
  const [jsEmps, jsCustomers, jsQuotes, jsJobs, jsLeads] = await Promise.all([
    paginateSb(() => sb.from('employees').select('id, name, email').eq('company_id', CID)),
    paginateSb(() => sb.from('customers').select('id, name, email, business_name').eq('company_id', CID)),
    paginateSb(() => sb.from('quotes').select('id, quote_id, customer_id, lead_id, salesperson_id, quote_amount, created_at').eq('company_id', CID)),
    paginateSb(() => sb.from('jobs').select('id, job_id, customer_id, salesperson_id, quote_id, lead_id, created_at, job_title').eq('company_id', CID)),
    paginateSb(() => sb.from('leads').select('id, salesperson_id, email, customer_name').eq('company_id', CID)),
  ])
  console.log(` JS: ${jsEmps.length} emps, ${jsCustomers.length} customers, ${jsQuotes.length} quotes, ${jsJobs.length} jobs, ${jsLeads.length} leads`)

  // Lookup: email -> employee
  const empByEmail = new Map()
  jsEmps.forEach(e => { if (e.email) empByEmail.set(normEmail(e.email), e) })

  // Lookup: email -> customer(s)
  const customersByEmail = new Map()
  jsCustomers.forEach(c => {
    if (c.email) {
      const k = normEmail(c.email)
      if (!customersByEmail.has(k)) customersByEmail.set(k, [])
      customersByEmail.get(k).push(c)
    }
  })

  // 4. For each HCP estimate, try to map to a JS quote
  const planned = [] // { jobIdsToUpdate: [], quoteIdsToUpdate: [], empId, source, hcpRef }
  // Salesperson roles (HCP role strings): admin, office staff, office,
  // sales. Field tech / technician / installer are excluded — those are
  // WORK assignees, not salespeople. If a job has only field techs on it,
  // we return null and skip rather than wrongly crediting a sale.
  const SALES_ROLES = new Set(['admin', 'office staff', 'office', 'sales', 'sales rep'])
  const isSalesRole = (role) => SALES_ROLES.has((role || '').toLowerCase())

  const resolveAssignedEmp = (assigned, { allowFieldFallback = false } = {}) => {
    if (!Array.isArray(assigned) || assigned.length === 0) return null
    // Pass 1: only sales-roleed employees
    for (const a of assigned) {
      if (!isSalesRole(a.role)) continue
      const jsEmp = empByEmail.get(normEmail(a.email))
      if (jsEmp) return jsEmp
    }
    // Pass 2: any matchable employee (estimates are OK here — whoever
    // is on an estimate was involved in the sale). Jobs shouldn't use
    // this fallback.
    if (allowFieldFallback) {
      for (const a of assigned) {
        const jsEmp = empByEmail.get(normEmail(a.email))
        if (jsEmp) return jsEmp
      }
    }
    return null
  }

  let matched = 0, unmatched = 0, noAssign = 0
  console.log('\n4. Matching HCP estimates -> JS quotes by customer email + date...')
  for (const est of hcpEstimates) {
    // Estimates: allow any matchable employee (whoever created/holds the
    // estimate was on the sales side even if their HCP role is "field tech").
    const jsEmp = resolveAssignedEmp(est.assigned_employees, { allowFieldFallback: true })
    if (!jsEmp) { noAssign++; continue }

    const custEmail = normEmail(est.customer?.email)
    if (!custEmail) { unmatched++; continue }
    const jsCusts = customersByEmail.get(custEmail) || []
    if (jsCusts.length === 0) { unmatched++; continue }

    // Candidate quotes from those customers with null salesperson
    const candidates = jsQuotes.filter(q =>
      jsCusts.some(c => c.id === q.customer_id) &&
      !q.salesperson_id
    )
    if (candidates.length === 0) continue // already assigned or not imported

    // Pick closest by created_at
    const estDate = new Date(est.created_at).getTime()
    candidates.sort((a, b) => Math.abs(new Date(a.created_at).getTime() - estDate) - Math.abs(new Date(b.created_at).getTime() - estDate))
    const chosen = candidates[0]
    matched++

    // Find jobs linked to that quote with null salesperson
    const linkedJobs = jsJobs.filter(j => j.quote_id === chosen.id && !j.salesperson_id)
    planned.push({
      source: 'hcp_estimate',
      hcpRef: est.estimate_number || est.id,
      empId: jsEmp.id,
      empName: jsEmp.name,
      quoteId: chosen.id,
      jobIds: linkedJobs.map(j => j.id),
    })
  }
  console.log(` Estimates: matched=${matched}, unmatched=${unmatched}, noAssignableEmp=${noAssign}`)

  // 5. Same pass for HCP jobs not linked via estimate
  console.log('\n5. Matching HCP jobs directly -> JS jobs...')
  let jobMatched = 0
  for (const hj of hcpJobs) {
    // Jobs: STRICT. Only credit employees with a sales/admin/office role.
    // Never attribute a sale to a field tech just because they're doing
    // the install. Jobs without a sales-role assignee are skipped and
    // those jobs stay with salesperson_id = null (intentional).
    const jsEmp = resolveAssignedEmp(hj.assigned_employees, { allowFieldFallback: false })
    if (!jsEmp) continue
    const custEmail = normEmail(hj.customer?.email)
    if (!custEmail) continue
    const jsCusts = customersByEmail.get(custEmail) || []
    if (jsCusts.length === 0) continue

    const hjDate = new Date(hj.created_at).getTime()
    const candidates = jsJobs.filter(j =>
      jsCusts.some(c => c.id === j.customer_id) &&
      !j.salesperson_id
    )
    if (candidates.length === 0) continue
    candidates.sort((a, b) => Math.abs(new Date(a.created_at).getTime() - hjDate) - Math.abs(new Date(b.created_at).getTime() - hjDate))
    const chosen = candidates[0]

    // Skip if already planned (via estimate)
    if (planned.some(p => p.jobIds.includes(chosen.id))) continue

    planned.push({
      source: 'hcp_job',
      hcpRef: hj.invoice_number || hj.id,
      empId: jsEmp.id,
      empName: jsEmp.name,
      quoteId: null,
      jobIds: [chosen.id],
    })
    jobMatched++
  }
  console.log(` HCP jobs matched: ${jobMatched}`)

  // 6. Summarize
  const totalJobUpdates = planned.reduce((s, p) => s + p.jobIds.length, 0)
  const totalQuoteUpdates = planned.filter(p => p.quoteId).length
  const byEmp = {}
  planned.forEach(p => { byEmp[p.empName] = (byEmp[p.empName] || 0) + p.jobIds.length })
  console.log('\n6. Planned updates:')
  console.log(` ${totalJobUpdates} jobs will get salesperson_id set`)
  console.log(` ${totalQuoteUpdates} quotes will get salesperson_id set`)
  console.log(' By rep:')
  Object.entries(byEmp).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`   ${n.padEnd(25)} ${c} jobs`))

  if (!COMMIT) {
    console.log('\nDRY-RUN complete. Re-run with --commit to apply.')
    return
  }

  // 7. Apply in batches. Skip rows where salesperson_id is no longer null
  //    (another process filled it); eq('salesperson_id', null) guard.
  console.log('\n7. Applying updates...')
  let jobsWritten = 0, quotesWritten = 0
  for (const p of planned) {
    if (p.quoteId) {
      const { error } = await sb.from('quotes')
        .update({ salesperson_id: p.empId, updated_at: new Date().toISOString() })
        .eq('id', p.quoteId).is('salesperson_id', null)
      if (!error) quotesWritten++
    }
    for (const jid of p.jobIds) {
      const { error } = await sb.from('jobs')
        .update({ salesperson_id: p.empId, updated_at: new Date().toISOString() })
        .eq('id', jid).is('salesperson_id', null)
      if (!error) jobsWritten++
    }
  }
  console.log(` Wrote salesperson_id to ${quotesWritten} quotes and ${jobsWritten} jobs.`)
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
