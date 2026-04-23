// Bulk backfill: walk every ST-{number} quote across given company that
// has 0 quote_lines, look up the matching HCP estimate, insert the
// missing line items.
//
// Strategy:
//   1. Pull all quotes in COMPANY_ID with quote_id matching ^ST-\d+$
//      and 0 lines (computed via per-row count).
//   2. Group by customer_id.
//   3. For each customer, resolve the HCP customer_id:
//        a) Prefer customers.source_id when source_system='hcp'
//        b) Else search HCP /customers?q= by business_name then name,
//           skip the customer (and log) if multiple ambiguous matches.
//   4. Pull HCP estimates for that customer (page_size=200) and build
//      number→estimate map.
//   5. For each missing-lines quote, look up by extracted number and
//      insert lines exactly like backfill_quote_lines_from_hcp.cjs.
//   6. Tag the quote with source_system + source_id.
//   7. Tag the customer with source_system + source_id when resolved.
//   8. Record one migration_jobs row at the end with counts + per-
//      customer report.
//
// Usage:
//   node scripts/backfill_all_legacy_quote_lines.cjs [COMPANY_ID]
//
// Defaults to company 3 (HHH production).

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = process.env.HCP_API_KEY || '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'

const CID = parseInt(process.argv[2] || '3', 10)
const DRY = process.argv.includes('--dry')

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

async function resolveHcpCustomer(cust) {
  if (cust.source_system === 'hcp' && cust.source_id) {
    return { id: cust.source_id, source: 'tag' }
  }
  // Try business_name first (more unique), then name.
  for (const term of [cust.business_name, cust.name].filter(Boolean)) {
    const cleaned = term.split('/')[0].trim()
    if (!cleaned) continue
    const r = await hcp('/customers?q=' + encodeURIComponent(cleaned) + '&page_size=10')
    const matches = r?.customers || []
    if (matches.length === 1) return { id: matches[0].id, source: `q=${cleaned}` }
    if (matches.length > 1) {
      // Try to disambiguate by exact name match
      const exact = matches.filter(m => (m.first_name + ' ' + m.last_name).trim().toLowerCase() === (cust.name||'').trim().toLowerCase()
        || (m.company || '').trim().toLowerCase() === (cust.business_name||'').trim().toLowerCase())
      if (exact.length === 1) return { id: exact[0].id, source: `exact ${cleaned}` }
      return { id: null, source: `ambiguous (${matches.length}) for "${cleaned}"` }
    }
  }
  return { id: null, source: 'no match' }
}

;(async () => {
  console.log('Bulk backfill — company', CID, DRY ? '(DRY)' : '')

  // Find all quotes matching ST-<digits> pattern. Pull more than enough.
  const { data: quotesRaw } = await sb.from('quotes')
    .select('id,customer_id,quote_id,quote_amount,source_system,source_id')
    .eq('company_id', CID)
    .ilike('quote_id', 'ST-%')
    .limit(5000)
  console.log('Total ST-* quotes in co=' + CID + ':', quotesRaw?.length)

  // Compute per-quote line count and keep only zero-line quotes.
  const empty = []
  for (const q of quotesRaw || []) {
    if (!/^ST-\d+$/.test(q.quote_id || '')) continue
    const { count } = await sb.from('quote_lines').select('id', { count: 'exact', head: true }).eq('quote_id', q.id)
    if ((count || 0) === 0) empty.push(q)
  }
  console.log('ST-* quotes with 0 lines:', empty.length)
  if (!empty.length) { console.log('Nothing to do.'); return }

  // Group by customer
  const byCust = new Map()
  for (const q of empty) {
    if (!byCust.has(q.customer_id)) byCust.set(q.customer_id, [])
    byCust.get(q.customer_id).push(q)
  }
  console.log('Customers with backfill candidates:', byCust.size)

  let totalInserted = 0
  let quotesFilled = 0
  let quotesSkipped = 0
  const report = []

  for (const [custId, qs] of byCust) {
    const { data: cust } = await sb.from('customers')
      .select('id,name,business_name,source_system,source_id')
      .eq('id', custId).single()
    if (!cust) { console.log(' [skip] customer', custId, 'missing'); continue }

    const resolved = await resolveHcpCustomer(cust)
    console.log(`\n=== cust ${custId} | ${cust.name} | ${cust.business_name||''} | hcp=${resolved.id||'NONE'} (${resolved.source}) | ${qs.length} quote(s)`)

    if (!resolved.id) {
      quotesSkipped += qs.length
      report.push({ customer_id: custId, name: cust.name, hcp: null, reason: resolved.source, quotes: qs.length, inserted: 0 })
      continue
    }

    // Tag the customer with source identity if not already
    if (!DRY && (cust.source_system !== 'hcp' || cust.source_id !== resolved.id)) {
      await sb.from('customers').update({ source_system: 'hcp', source_id: resolved.id }).eq('id', custId)
    }

    // Pull all estimates for this HCP customer
    const ests = (await hcp(`/estimates?customer_id=${resolved.id}&page_size=200`))?.estimates || []
    const byNumber = new Map()
    for (const e of ests) byNumber.set(String(e.estimate_number), e)
    console.log('  HCP estimates:', ests.length)

    let custInserted = 0
    let custFilled = 0
    for (const q of qs) {
      const m = q.quote_id.match(/^ST-(\d+)$/)
      const num = m[1]
      const est = byNumber.get(num)
      if (!est) { console.log('  no HCP match for', q.quote_id); quotesSkipped++; continue }

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
          if (DRY) { added++; continue }
          const { error } = await sb.from('quote_lines').insert(row)
          if (error) { console.log('    insert err:', error.message); continue }
          added++
        }
      }
      if (added > 0) {
        custFilled++
        quotesFilled++
        if (!DRY) {
          await sb.from('quotes').update({ source_system: 'hcp', source_id: est.id }).eq('id', q.id)
        }
      }
      custInserted += added
      console.log(`  q${q.id} ${q.quote_id} → +${added} lines (HCP #${num} = ${est.id})`)
    }
    totalInserted += custInserted
    report.push({ customer_id: custId, name: cust.name, hcp: resolved.id, quotes: qs.length, filled: custFilled, inserted: custInserted })
  }

  console.log('\n========================================')
  console.log('Quotes filled:', quotesFilled)
  console.log('Quotes skipped:', quotesSkipped)
  console.log('Lines inserted:', totalInserted)

  if (!DRY) {
    await sb.from('migration_jobs').insert({
      company_id: CID,
      source: 'hcp-backfill-quote-lines',
      status: 'finished',
      finished_at: new Date().toISOString(),
      counts: { quotes_filled: quotesFilled, quotes_skipped: quotesSkipped, lines_inserted: totalInserted, customers_processed: byCust.size },
      report,
    })
    console.log('Recorded to migration_jobs.')
  }
})()
