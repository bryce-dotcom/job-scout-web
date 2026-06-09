// Fix the SMBE/MES 8ft strip data corruption that caused Cole's
// crew to be in the field with the wrong product (4ft strips when
// the estimate said 8ft).
//
// Background:
// - Product 1496 was originally "SMBE Strip Light 60W/70W/80W w/ Controls"
//   (8ft, LEDOne model LOC-8FTSL-MW(60/70/80)). On 2026-05-29 someone
//   renamed it in place to "SMBE 24/32/40W Linear Strip - 4ft w/ Controls"
//   and rewired its children to 4ft MES components, BUT left the model
//   number, DLC listing, spec sheet, and labor hours describing the
//   original 8ft variant. That's the smoking gun — the row was reused
//   for a different product instead of creating a new product.
// - Bundle 1436 ("SMBE 40/50/64W Linear Strip - 8ft w/ Controls") still
//   exists as the catalog's 8ft option, but it was wired to product 2141
//   ("MES 40/50/64W Linear Strip - 8ft" at $63 cost) with wrong wattages.
// - The actual right MES 8ft strip is product 2104, which has model
//   number 6686 — MES catalog ID `02382 05 - LED 8FT Covered Strip
//   Fixture (Juniper GSR+) 40W-53W-68W-80W` — cost $68. Bryce confirmed
//   this is the real product spec; the bundle name and child product
//   both need to read 40/53/68/80W.
//
// Plan (5 steps):
//   1) Rename product 2104 → "MES 8ft Linear Strip 40/53/68/80W"
//      (cost stays $68)
//   2) Rename bundle 1436 → "SMBE 40/53/68/80W Linear Strip - 8ft w/ Controls"
//   3) Repoint bundle 1436's component edge: child 2141 → 2104
//   4) Fix 3 wrong job_lines (Green River 23019, Evergreen 23286,
//      Biorge 23293): item_id 1496 → 1436. Preserve qty + price the
//      customer was quoted.
//   5) Audit pass: list every other job/quote_line that mentions
//      8ft language but references the now-4ft product 1496, so we
//      can flag them in feedback.
//
// Leaves alone:
//   - Job 21004 (Jayleen, already invoiced) — water under bridge.
//   - Job 23285 (dave reed) — pricing fits 4ft, leave on 1496.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING CHANGES ===' : '=== DRY RUN — pass --apply to write ===\n')

const log = { renames: [], repoints: [], jobLineFixes: [], warnings: [] }

// ---------- Step 1: Rename product 2104 ----------
console.log('Step 1: Rename product 2104 (MES 8ft strip)')
const { data: p2104 } = await sb.from('products_services').select('id, name, description, cost, manufacturer, model_number, unit_price').eq('id', 2104).single()
console.log('  Before:', p2104.name, '| cost $' + p2104.cost)
const newName2104 = 'MES 8ft Linear Strip 40/53/68/80W'
const newDesc2104 = (p2104.description || '')
  .replace(/Strip Light 60W\/70W\/80W/g, 'MES 8ft Linear Strip 40/53/68/80W')
  + '\n[Renamed 2026-06-08 — actual MES wattages are 40W/53W/68W/80W per MES catalog 02382 05 (SKU 6686). Bryce confirmed spec on Cole feedback.]'
console.log('  After: ', newName2104)
if (APPLY) {
  await sb.from('products_services').update({
    name: newName2104,
    description: newDesc2104,
    updated_at: new Date().toISOString(),
  }).eq('id', 2104)
}
log.renames.push({ id: 2104, from: p2104.name, to: newName2104 })

// ---------- Step 2: Rename bundle 1436 ----------
console.log('\nStep 2: Rename bundle 1436 (8ft SMBE strip with controls)')
const { data: p1436 } = await sb.from('products_services').select('id, name, description, unit_price, dlc_listing_number').eq('id', 1436).single()
console.log('  Before:', p1436.name)
const newName1436 = 'SMBE 40/53/68/80W Linear Strip - 8ft w/ Controls'
const newDesc1436 = (p1436.description || '')
  + (p1436.description ? '\n\n' : '')
  + '[Renamed 2026-06-08 — actual SMBE wattages are 40W/53W/68W/80W per MES catalog 02382 05. Previously labeled 40/50/64W which was incorrect.]'
console.log('  After: ', newName1436)
if (APPLY) {
  await sb.from('products_services').update({
    name: newName1436,
    description: newDesc1436,
    updated_at: new Date().toISOString(),
  }).eq('id', 1436)
}
log.renames.push({ id: 1436, from: p1436.name, to: newName1436 })

// ---------- Step 3: Repoint bundle 1436's component 2141 → 2104 ----------
console.log('\nStep 3: Repoint bundle 1436 component child 2141 → 2104')
const { data: comps } = await sb.from('product_components').select('id, parent_product_id, component_product_id, quantity').eq('parent_product_id', 1436)
const edge2141 = (comps || []).find(c => c.component_product_id === 2141)
if (!edge2141) {
  console.log('  WARN: bundle 1436 does not have a child 2141 — already repointed? Check manually.')
  log.warnings.push('bundle 1436 has no child 2141')
} else {
  console.log('  Found edge', edge2141.id, '| 1436 → 2141 × ' + edge2141.quantity)
  if (APPLY) {
    await sb.from('product_components').update({
      component_product_id: 2104,
    }).eq('id', edge2141.id)
  }
  log.repoints.push({ edgeId: edge2141.id, parent: 1436, oldChild: 2141, newChild: 2104, quantity: edge2141.quantity })
}

// ---------- Step 4: Fix 3 wrong job_lines ----------
console.log('\nStep 4: Fix wrong job_lines on Green River 23019, Evergreen 23286, Biorge 23293')
const TARGETS = [
  { jobId: 23019, jobLineId: 12326, customer: 'Green River (Dave Dj glass quote 4208)' },
  { jobId: 23286, jobLineId: 12330, customer: 'Evergreen North America (quote 4227)' },
  { jobId: 23293, jobLineId: 12356, customer: 'Biorge contractors (quote 4418)' },
]
for (const t of TARGETS) {
  const { data: line } = await sb.from('job_lines').select('id, item_id, item_name, quantity, price, total, description').eq('id', t.jobLineId).single()
  if (!line) { console.log('  WARN: job_line', t.jobLineId, 'not found'); continue }
  if (line.item_id !== 1496) {
    console.log('  WARN: job_line', t.jobLineId, 'item_id is', line.item_id, '(expected 1496) — skipping')
    log.warnings.push(`job_line ${t.jobLineId} item_id was ${line.item_id}, not 1496`)
    continue
  }
  console.log('  Fixing', t.customer, '/ jobLine', t.jobLineId, '| qty', line.quantity, '@ $' + line.price, '| desc:', (line.description||'').slice(0,40))
  if (APPLY) {
    await sb.from('job_lines').update({
      item_id: 1436,
      item_name: newName1436, // snapshot the corrected name
      updated_at: new Date().toISOString(),
    }).eq('id', t.jobLineId)
  }
  log.jobLineFixes.push({ jobLineId: t.jobLineId, jobId: t.jobId, customer: t.customer, qty: line.quantity, price: line.price })
}

// ---------- Step 4b: Fix one unconverted quote_line on quote 4210 ----------
// qLine 11130 on quote 4210 (Approved, no job yet) references item_id 1496
// with snapshot "SMBE Strip Light 60W/70W/80W" — an 8ft. Repoint to 1436
// so the eventual convert-to-job will inherit the right product.
console.log('\nStep 4b: Repoint unconverted quote_line on quote 4210')
const QUOTE_LINE_FIXES = [
  { quoteLineId: 11130, quoteId: 4210, note: 'Approved quote, no job yet' },
]
for (const t of QUOTE_LINE_FIXES) {
  const { data: line } = await sb.from('quote_lines').select('id, quote_id, item_id, item_name, quantity, price').eq('id', t.quoteLineId).single()
  if (!line) { console.log('  WARN: quote_line', t.quoteLineId, 'not found'); continue }
  if (line.item_id !== 1496) {
    console.log('  WARN: quote_line', t.quoteLineId, 'item_id is', line.item_id, '(expected 1496) — skipping')
    log.warnings.push(`quote_line ${t.quoteLineId} item_id was ${line.item_id}, not 1496`)
    continue
  }
  console.log('  Fixing quote', t.quoteId, '/ qLine', t.quoteLineId, '| qty', line.quantity, '@ $' + line.price, '|', t.note)
  if (APPLY) {
    await sb.from('quote_lines').update({
      item_id: 1436,
      item_name: newName1436,
      updated_at: new Date().toISOString(),
    }).eq('id', t.quoteLineId)
  }
  log.jobLineFixes.push({ kind: 'quote_line', quoteLineId: t.quoteLineId, quoteId: t.quoteId, qty: line.quantity, price: line.price })
}

// ---------- Step 5: Audit pass — flag other quote_lines that look like 8ft on 1496 ----------
console.log('\nStep 5: Audit quote_lines that look 8ft but reference now-4ft product 1496')
const { data: ql1496 } = await sb.from('quote_lines').select('id, quote_id, item_name, description, quantity, price, created_at').eq('item_id', 1496).gte('created_at', '2026-04-01')
const audit = []
for (const l of ql1496 || []) {
  const txt = ((l.item_name || '') + ' ' + (l.description || '')).toLowerCase()
  const looksLike8ft = txt.includes("8'") || /\b8\s*ft\b/.test(txt) || txt.includes('60w') || txt.includes('70w') || (txt.includes('80w') && !txt.includes('24'))
  if (looksLike8ft) audit.push({ quoteLineId: l.id, quoteId: l.quote_id, name: l.item_name, description: l.description, qty: l.quantity, price: l.price })
}
console.log('  Found', audit.length, 'quote_lines that mention 8ft but reference the now-4ft 1496:')
for (const a of audit) console.log('    qLine', a.quoteLineId, '| quote', a.quoteId, '| qty', a.qty, '@ $' + a.price, '|', a.name)
log.auditFlagged = audit

// ---------- Summary ----------
console.log('\n========================================')
console.log(APPLY ? 'APPLIED:' : 'DRY RUN — pass --apply to write changes')
console.log(' renames:    ', log.renames.length)
console.log(' repoints:   ', log.repoints.length)
console.log(' jobLineFix: ', log.jobLineFixes.length)
console.log(' auditFlag:  ', log.auditFlagged.length, '(quotes to follow up on)')
console.log(' warnings:   ', log.warnings.length)

const fs = await import('node:fs')
const outPath = './scripts/_fix_smbe_8ft_strip_log.json'
fs.writeFileSync(outPath, JSON.stringify({ applied: APPLY, ranAt: new Date().toISOString(), ...log }, null, 2))
console.log('\nFull log written to', outPath)
