// Backfill quote_lines into existing JobScout quotes that were
// imported by the legacy hcp-migrate before line-item descriptions
// were captured. Joins by HCP estimate number embedded in the
// quote_id (legacy pattern: ST-<HCP_estimate_number>).
//
// Usage:
//   node scripts/backfill_quote_lines_from_hcp.cjs <CUSTOMER_ID> [COMPANY_ID]
//
// CUSTOMER_ID is the JS customers.id (integer). Walks every quote
// for that customer, looks up the matching HCP estimate, and
// inserts any missing line items. Will NOT touch quotes that
// already have line items unless --force is passed.

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = process.env.HCP_API_KEY || '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'

const CUST_ID = parseInt(process.argv[2], 10)
const CID = parseInt(process.argv[3] || '3', 10)
const FORCE = process.argv.includes('--force')

if (!CUST_ID) {
  console.error('Usage: node scripts/backfill_quote_lines_from_hcp.cjs <CUSTOMER_ID> [COMPANY_ID] [--force]')
  process.exit(1)
}

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

const c2d = c => c ? Number((c / 100).toFixed(2)) : 0
const rand = (n=6) => Math.random().toString(36).slice(2, 2+n).toUpperCase()

;(async () => {
  // Build a map of HCP estimate_number -> estimate object.
  // Quote_ids look like "ST-71", "ST-216" — that integer is the HCP
  // estimate_number, not the HCP estimate_id (cus_xxx).
  const { data: cust } = await sb.from('customers').select('id,name,business_name').eq('id', CUST_ID).single()
  console.log('Customer:', cust.id, cust.name, '|', cust.business_name)

  const { data: quotes } = await sb.from('quotes').select('id,quote_id,quote_amount,status').eq('company_id', CID).eq('customer_id', CUST_ID)
  console.log('Quotes for this customer:', quotes?.length)

  // We don't know the HCP customer_id by inversion; safest path is to
  // pull all HCP estimates for the matching email/business and build a
  // number-keyed lookup. For Skaggs we know cus_43f1... already.
  // Let everyone supply via env if known; otherwise search by name.
  let hcpCustId = process.env.HCP_CUSTOMER_ID
  if (!hcpCustId) {
    const search = cust.name || cust.business_name || ''
    const r = await hcp('/customers?q=' + encodeURIComponent(search.split('/')[0].trim()) + '&page_size=10')
    hcpCustId = r?.customers?.[0]?.id
    console.log('  HCP customer guess:', hcpCustId)
  }
  if (!hcpCustId) { console.error('Could not resolve HCP customer'); process.exit(1) }

  const ests = (await hcp(`/estimates?customer_id=${hcpCustId}&page_size=200`))?.estimates || []
  console.log('HCP estimates pulled:', ests.length)
  const byNumber = new Map()
  for (const e of ests) byNumber.set(String(e.estimate_number), e)

  let inserted = 0
  for (const q of quotes || []) {
    const m = (q.quote_id || '').match(/(\d+)/)
    if (!m) { console.log('  skip:', q.quote_id, '(no number)'); continue }
    const num = m[1]
    const est = byNumber.get(num)
    if (!est) { console.log('  no HCP match for', q.quote_id, '(#' + num + ')'); continue }

    const { count } = await sb.from('quote_lines').select('id', { count: 'exact', head: true }).eq('quote_id', q.id)
    if (count > 0 && !FORCE) { console.log(`  skip q${q.id} (${q.quote_id}): already has ${count} lines (use --force to wipe)`); continue }
    if (count > 0 && FORCE) await sb.from('quote_lines').delete().eq('quote_id', q.id)

    let added = 0
    let sort = 0
    for (const opt of (est.options || [])) {
      let lis = opt.line_items || []
      if (!lis.length && opt.id) {
        const r = await hcp(`/estimates/${est.id}/options/${opt.id}/line_items`)
        lis = r?.line_items || []
      }
      for (const li of lis) {
        const qty = Number(li.quantity || 1)
        const unitPrice = c2d(li.unit_price || 0)
        const total = c2d((li.unit_price || 0) * qty)
        const row = {
          company_id: CID,
          source_system: 'hcp', source_id: 'opt-line:' + li.id,
          quote_id: q.id,
          line_id: 'QL-HCP-' + rand(6),
          item_name: li.name || 'Unnamed Item',
          description: li.description || '',
          quantity: qty,
          price: unitPrice,
          line_total: total,
          total: total,
          labor_cost: c2d(li.unit_cost || 0),
          kind: li.kind || null,
          taxable: li.taxable === true,
          unit_of_measure: li.unit_of_measure || null,
          sort_order: sort++,
        }
        const { error } = await sb.from('quote_lines').insert(row)
        if (error) { console.log('    insert err:', error.message); continue }
        added++
      }
    }
    inserted += added
    // Tag the quote with source identity so future re-syncs are clean
    if (!('source_system' in q) || !q.source_system) {
      await sb.from('quotes').update({ source_system: 'hcp', source_id: est.id }).eq('id', q.id)
    }
    console.log(`  q${q.id} ${q.quote_id} → +${added} lines (HCP #${num} = ${est.id})`)
  }
  console.log(`\nDone. Inserted ${inserted} total lines.`)
})()
