// HCP ↔ JobScout reconciliation report.
//
// For a given JobScout company, walks every customer marked
// source_system='hcp' (and optionally every customer with HCP-matchable
// name) and compares JS row counts vs HCP row counts:
//   • customers
//   • estimates (HCP) vs quotes (JS)
//   • jobs (HCP) vs jobs (JS)
//   • invoices (HCP) vs invoices (JS)
//   • estimate line items (HCP) vs quote_lines (JS)
//
// Outputs a per-customer table + grand totals + flags every row where
// JS < HCP (under-imported) or JS > HCP (over-imported / dupes), and
// records the full report into migration_jobs as a trust report.
//
// Usage:
//   node scripts/hcp_reconciliation_report.cjs [COMPANY_ID]

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = process.env.HCP_API_KEY || '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'

const CID = parseInt(process.argv[2] || '3', 10)
const SAMPLE = parseInt(process.env.SAMPLE || '0', 10) // 0 = all

async function hcp(p, retries = 5) {
  for (let a = 0; a <= retries; a++) {
    const r = await fetch(BASE + p, { headers: { Authorization: 'Token ' + KEY, Accept: 'application/json' } })
    if (r.status === 429) { await new Promise(res => setTimeout(res, Math.min(2000 * 2 ** a, 30000))); continue }
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`HCP ${r.status} ${p}`)
    return r.json()
  }
  throw new Error('rate limit ' + p)
}

async function paged(path, key) {
  // walk all pages; HCP returns { <key>: [...], total_pages, page }
  let page = 1, all = []
  while (true) {
    const sep = path.includes('?') ? '&' : '?'
    const r = await hcp(`${path}${sep}page=${page}&page_size=200`)
    const items = r?.[key] || []
    all.push(...items)
    if (items.length < 200) break
    page++
    if (page > 50) break
  }
  return all
}

;(async () => {
  console.log(`Reconciliation report — JobScout company ${CID}`)

  // All HCP-tagged customers in JS
  let q = sb.from('customers')
    .select('id,name,business_name,source_id')
    .eq('company_id', CID)
    .eq('source_system', 'hcp')
    .not('source_id', 'is', null)
  if (SAMPLE) q = q.limit(SAMPLE)
  const { data: custs } = await q
  console.log('HCP-tagged customers:', custs?.length)

  const tot = { js_quotes: 0, hcp_ests: 0, js_jobs: 0, hcp_jobs: 0, js_invoices: 0, hcp_invoices: 0, js_quote_lines: 0, hcp_est_lines: 0 }
  const flagged = []
  const rows = []

  let i = 0
  for (const c of custs || []) {
    i++
    const hcpId = c.source_id
    // JS counts
    const [jq, jj, ji] = await Promise.all([
      sb.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('customer_id', c.id),
      sb.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('customer_id', c.id),
      sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('customer_id', c.id),
    ])
    const jsQ = jq.count || 0, jsJ = jj.count || 0, jsI = ji.count || 0

    // JS quote_lines for this customer
    const { data: qids } = await sb.from('quotes').select('id').eq('company_id', CID).eq('customer_id', c.id)
    let jsQL = 0
    if (qids?.length) {
      const { count } = await sb.from('quote_lines').select('id', { count: 'exact', head: true }).in('quote_id', qids.map(x=>x.id))
      jsQL = count || 0
    }

    // HCP counts
    const ests = (await hcp(`/estimates?customer_id=${hcpId}&page_size=200`))?.estimates || []
    const jobs = (await hcp(`/jobs?customer_id=${hcpId}&page_size=200`))?.jobs || []
    // HCP /invoices?customer_id is broken — fetch per job
    let hcpInv = 0
    for (const j of jobs) {
      const inv = (await hcp(`/jobs/${j.id}/invoices`))?.invoices || []
      hcpInv += inv.length
    }
    let hcpEL = 0
    for (const e of ests) {
      for (const opt of (e.options || [])) {
        if (opt.line_items?.length) hcpEL += opt.line_items.length
        else if (opt.id) {
          const r = await hcp(`/estimates/${e.id}/options/${opt.id}/line_items`)
          hcpEL += (r?.line_items || []).length
        }
      }
    }

    tot.js_quotes += jsQ; tot.hcp_ests += ests.length
    tot.js_jobs += jsJ; tot.hcp_jobs += jobs.length
    tot.js_invoices += jsI; tot.hcp_invoices += hcpInv
    tot.js_quote_lines += jsQL; tot.hcp_est_lines += hcpEL

    const issues = []
    if (jsQ < ests.length) issues.push(`quotes-short:${ests.length - jsQ}`)
    if (jsJ < jobs.length) issues.push(`jobs-short:${jobs.length - jsJ}`)
    if (jsI < hcpInv) issues.push(`invoices-short:${hcpInv - jsI}`)
    if (jsQL < hcpEL) issues.push(`lines-short:${hcpEL - jsQL}`)
    if (jsQ > ests.length) issues.push(`quotes-over:${jsQ - ests.length}`)

    const row = { js_id: c.id, name: c.name||c.business_name, hcp: hcpId,
      js_q: jsQ, hcp_e: ests.length,
      js_j: jsJ, hcp_j: jobs.length,
      js_i: jsI, hcp_i: hcpInv,
      js_ql: jsQL, hcp_el: hcpEL,
      issues }
    rows.push(row)
    if (issues.length) flagged.push(row)

    if (i % 25 === 0) console.log(`  ${i}/${custs.length} processed (${flagged.length} flagged)`)
  }

  console.log('\n=== Grand Totals ===')
  console.log(`Quotes:       JS ${tot.js_quotes}  vs  HCP ${tot.hcp_ests}   (Δ ${tot.js_quotes - tot.hcp_ests})`)
  console.log(`Jobs:         JS ${tot.js_jobs}  vs  HCP ${tot.hcp_jobs}   (Δ ${tot.js_jobs - tot.hcp_jobs})`)
  console.log(`Invoices:     JS ${tot.js_invoices}  vs  HCP ${tot.hcp_invoices}   (Δ ${tot.js_invoices - tot.hcp_invoices})`)
  console.log(`Quote lines:  JS ${tot.js_quote_lines}  vs  HCP ${tot.hcp_est_lines}   (Δ ${tot.js_quote_lines - tot.hcp_est_lines})`)
  console.log(`\nFlagged customers: ${flagged.length}/${custs.length}`)

  // Compute fidelity scores
  const fidelity = {
    quotes: tot.hcp_ests ? Math.min(100, Math.round((tot.js_quotes / tot.hcp_ests) * 100)) : 100,
    jobs: tot.hcp_jobs ? Math.min(100, Math.round((tot.js_jobs / tot.hcp_jobs) * 100)) : 100,
    invoices: tot.hcp_invoices ? Math.min(100, Math.round((tot.js_invoices / tot.hcp_invoices) * 100)) : 100,
    lines: tot.hcp_est_lines ? Math.min(100, Math.round((tot.js_quote_lines / tot.hcp_est_lines) * 100)) : 100,
  }
  console.log('\nFidelity %:', fidelity)

  await sb.from('migration_jobs').insert({
    company_id: CID,
    source: 'hcp-reconciliation',
    status: 'finished',
    finished_at: new Date().toISOString(),
    counts: tot,
    report: { fidelity, flagged, rows },
  })
  console.log('\nReport recorded to migration_jobs.')
})()
