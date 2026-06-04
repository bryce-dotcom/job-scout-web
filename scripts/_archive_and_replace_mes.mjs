// Full MES vendor swap, done properly:
//   1) Rollback the in-place swap on 11 SMBE parent-bundles (restore original cost/manufacturer/etc.)
//   2) Archive the ~28 actual lighting-fixture components (active=false, name suffixed with " (ARCHIVED 2026-05-21)")
//   3) Create 28 new MES products (clean rows, type='Electrical Services (Bundles)', full traceability in description)
//   4) Update product_components: repoint component_product_id from old archived fixture → new MES product
//   5) Refresh parent-bundle cost rollup if they recompute, or leave as-is if not
//
// Reversible via scripts/_mes_swap_results.json + this script's _archive_replace_log.json output.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const DRY = process.argv.includes('--dry-run')

// ============ PRE_SWAP snapshot (authoritative original values) ============
const PRE_SWAP = {
  1961: { oldCost: 286.34, oldMarkup: 75, name: 'LEDONE Adjustable Area Lights 160W/200W/240W/320W ' },
  2050: { oldCost: 195.00, oldMarkup: 100, name: 'ML 105W/135W/155W/180W Highbay' },
  1960: { oldCost: 194.15, oldMarkup: 75, name: 'LEDONE Adjustable Area Lights 75W/100W/120W/150W' },
  2003: { oldCost: 156.56, oldMarkup: 75, name: 'LEDONE Vapor Tight Fixtures 60W/75W/90W' },
  1962: { oldCost: 88.91, oldMarkup: 113, name: 'LEDONE Mini Wall Pack 8W/10W/15W/25W' },
  1965: { oldCost: 86.52, oldMarkup: 100, name: 'LEDONE Strip Light 48W/68W/90W' },
  1957: { oldCost: 125.66, oldMarkup: 75, name: 'LEDONE 180W/200W/220W Highbay' },
  1964: { oldCost: 103.51, oldMarkup: 75, name: 'LEDONE Adjustable Wall Packs 50W/60W/80W/100W' },
  1959: { oldCost: 199.30, oldMarkup: 75, name: 'LEDONE 360W/400W/440W Highbay' },
  2006: { oldCost: 67.98, oldMarkup: 100, name: 'LEDONE Canopy 40W/50W/60W/75W' },
  1958: { oldCost: 182.31, oldMarkup: 75, name: 'LEDONE 290W/320W/350W Highbay' },
  1969: { oldCost: 49.95, oldMarkup: 150, name: 'LEDONE Backlit Panels 30W/35W/40W (2X4)' },
  1963: { oldCost: 65.92, oldMarkup: 100, name: 'LEDONE Adjustable Wall Packs 20W/30W/40W/50W' },
  1955: { oldCost: 71.07, oldMarkup: 100, name: 'LEDONE 70W/90W/110W Highbay' },
  1968: { oldCost: 40.17, oldMarkup: 150, name: 'LEDONE Backlit Panels 20W/25W/30W (2X2)' },
  1967: { oldCost: 42.23, oldMarkup: 150, name: 'LEDONE Backlit Panels 20W/25W/30W (1X4)' },
  1966: { oldCost: 70.00, oldMarkup: 100, name: 'LEDONE Strip Light 60W/70W/80W' },
  2002: { oldCost: 69.01, oldMarkup: 100, name: 'LEDONE Vapor Tight Fixtures 25W/35W/50W' },
  2047: { oldCost: 72.80, oldMarkup: 100, name: 'ML 90W/110W/130W/150W/165W Highbay' },
  2046: { oldCost: 65.80, oldMarkup: 100, name: 'ML 50W/60W/70W/90W/110W Highbay' },
  2048: { oldCost: 81.50, oldMarkup: 100, name: 'ML 150W/165W/180W/200W/220W Highbay' },
  2049: { oldCost: 175.00, oldMarkup: 100, name: 'ML 220W/280W/320W/360W/400W Highbay' },
  2051: { oldCost: 35.10, oldMarkup: 99.99, name: 'ML 2x2 Backlit Panel Retrofit Kit 20W/25W/30W' },
  2052: { oldCost: 51.50, oldMarkup: 99.99, name: 'ML 2x4 Backlit Panel Retrofit Kit 23W/30W/36W' },
  2053: { oldCost: 53.50, oldMarkup: 100, name: 'ML 2x4 Backlit Panel Retrofit Kit 35W/40W/46W' },
  2009: { oldCost: 65.00, oldMarkup: 150, name: 'WL 130/150/165W Highbay' },
  2011: { oldCost: 65.00, oldMarkup: 150, name: 'WL 130/150/165W Highbay' },
  2010: { oldCost: 49.00, oldMarkup: 150, name: 'WL 70/90/110W Highbay' },
  // SMBE parent bundles — rollback only, no archive
  1432: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W', isParent: true },
  1436: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W w/ Controls', isParent: true },
  1433: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W w/ Lift', isParent: true },
  1439: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate/Lift/Control', isParent: true },
  1437: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W w/ Lift w/ Controls', isParent: true },
  1438: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate w/ Controls', isParent: true },
  1434: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate', isParent: true },
  1435: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate w/ Lift', isParent: true },
  2029: { oldCost: 0, oldMarkup: null, name: 'SMBE Adjustable Wall Packs 50W/60W/80W/100W LIFT', isParent: true },
  1494: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 60W/70W/80W Relocate', isParent: true },
  1492: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 60W/70W/80W', isParent: true },
}

// MES picks per old fixture (already validated in prior runs)
const MES_PICKS = {}
{
  const catalog = JSON.parse(readFileSync('scripts/_mes_catalog_with_colors.json', 'utf8'))
  const greens = catalog.greenRows
  function wattsOf(s) { return [...(s||'').matchAll(/(\d{1,4})\s*W(?=[\s\/\-,]|$)/gi)].map(m => Number(m[1])) }
  function fixtureOf(s) {
    const n = (s || '').toLowerCase()
    if (/2x4|2x2|1x4|backlit\s*panel|back-lit\s*panel/.test(n) && !/troffer/.test(n)) return 'panel'
    if (/troffer/.test(n)) return 'troffer'
    if (/vapor\s*tight/.test(n)) return 'vapor'
    if (/canopy/.test(n)) return 'canopy'
    if (/area\s*light|cobra|pole/.test(n)) return 'area'
    if (/mini\s*wall\s*pack|wall\s*pack/.test(n)) return 'wallpack'
    if (/strip\s*light|strip\s*fixture/.test(n)) return 'strip'
    if (/wrap/.test(n)) return 'wrap'
    if (/highbay|high\s*bay/.test(n)) return 'highbay'
    return null
  }
  function formOf(s) {
    const n = (s || '').toLowerCase()
    if (/2x4|2\s*x\s*4/.test(n)) return '2x4'
    if (/2x2|2\s*x\s*2/.test(n)) return '2x2'
    if (/1x4|1\s*x\s*4/.test(n)) return '1x4'
    return null
  }
  const idx = greens.map(m => ({
    ...m,
    fixture: fixtureOf((m.name||'') + ' ' + (m.section||'') + ' ' + (m.category||'')),
    form: formOf((m.name||'') + ' ' + (m.section||'')),
    watts: wattsOf(m.name),
    priceNum: Number((m.price || '').replace(/[^0-9.]/g, '')) || 0,
  }))
  function pick(oldName) {
    const hWatts = wattsOf(oldName), hF = fixtureOf(oldName), hForm = formOf(oldName)
    if (!hF) return null
    let best = null, score = -1
    for (const m of idx.filter(x => x.fixture === hF)) {
      const overlap = hWatts.filter(w => m.watts.includes(w)).length
      let s = overlap * 10
      if (hForm && m.form === hForm) s += 5
      if (overlap === 0) continue
      if (overlap === hWatts.length && hWatts.length) s += 8
      if (s > score) { best = m; score = s }
    }
    return best
  }
  for (const [idStr, info] of Object.entries(PRE_SWAP)) {
    if (info.isParent) continue
    MES_PICKS[idStr] = pick(info.name)
  }
}

console.log(`MES picks resolved for ${Object.values(MES_PICKS).filter(Boolean).length} fixtures\n`)

const log = { rollbacks: [], archives: [], newProducts: [], repoints: [], errors: [] }

// ============ STEP 1: ROLLBACK 11 SMBE PARENT BUNDLES ============
console.log('=== STEP 1: Rolling back 11 SMBE parent bundles ===')
const parentIds = Object.entries(PRE_SWAP).filter(([_, v]) => v.isParent).map(([id]) => Number(id))
for (const id of parentIds) {
  const pre = PRE_SWAP[id]
  // Restore: cost=0, manufacturer=null, model_number=null, markup_percent=null, description=null
  const patch = { cost: pre.oldCost, manufacturer: null, model_number: null, markup_percent: pre.oldMarkup, description: null, updated_at: new Date().toISOString() }
  if (DRY) { console.log(`  [DRY] rollback ${id} ${pre.name} → cost ${pre.oldCost}`) }
  else {
    const { error } = await sb.from('products_services').update(patch).eq('id', id)
    if (error) { console.error(`  ✗ ${id}: ${error.message}`); log.errors.push({ step: 'rollback', id, error: error.message }); continue }
    console.log(`  ✓ rolled back ${id} ${pre.name}`)
    log.rollbacks.push({ id, restored: patch })
  }
}

// ============ STEP 2-4: ARCHIVE OLD, CREATE NEW, REPOINT COMPONENTS ============
console.log('\n=== STEP 2-4: Archive / Create / Repoint for 28 fixture components ===')
const fixtureIds = Object.entries(PRE_SWAP).filter(([_, v]) => !v.isParent).map(([id]) => Number(id))

// Pull current rows to use as template for new products
const { data: oldRows } = await sb.from('products_services').select('*').in('id', fixtureIds)
const oldMap = Object.fromEntries(oldRows.map(r => [r.id, r]))

// Pre-fetch all product_components that reference these
const { data: allComps } = await sb.from('product_components').select('*').in('component_product_id', fixtureIds).eq('company_id', 3)
const compsByOldId = {}
for (const c of allComps || []) {
  if (!compsByOldId[c.component_product_id]) compsByOldId[c.component_product_id] = []
  compsByOldId[c.component_product_id].push(c)
}

for (const oldId of fixtureIds) {
  const pre = PRE_SWAP[oldId]
  const mes = MES_PICKS[oldId]
  const old = oldMap[oldId]
  if (!old) { console.warn(`  ! ${oldId} not found in DB`); continue }
  if (!mes) { console.warn(`  ! ${oldId} no MES pick — skipping`); continue }

  const refCount = (compsByOldId[oldId] || []).length

  // --- Create new MES product (clone old, override fields) ---
  const cleanMesName = (mes.name || '').replace(/^\d+\s*\d*\s*-\s*/, '').trim()
  const description = [
    `Vendor: MES (replaces archived ${old.name?.trim()} on 2026-05-21)`,
    `MES Product: ${mes.name}`,
    `MES Section/Sheet: ${mes.section || mes.sheet || ''}`,
    `MES SKU: ${mes.sku}`,
    `MES Cost: $${mes.priceNum.toFixed(2)}`,
    `Wattage Options: ${(mes.watts || []).map(w=>w+'W').join(' / ')}`,
    `Replaces old product ID: ${oldId} (${pre.name.trim()})`,
    `Original Cost: $${pre.oldCost.toFixed(2)} → New Cost: $${mes.priceNum.toFixed(2)}`,
    `Selected by: London (green-highlighted in MES pricing sheet)`,
    `Referenced by ${refCount} parent bundle${refCount !== 1 ? 's' : ''}`,
  ].join('\n')

  // Use existing selling price (unit_price) so parent bundle math stays consistent
  const sellPx = Number(old.unit_price) || 0
  const newCost = mes.priceNum
  const rawMarkup = newCost > 0 ? ((sellPx - newCost) / newCost) * 100 : null
  const newMarkup = rawMarkup == null ? null : Math.min(rawMarkup, 999.99)

  // Clone all fields from old, override only what should change
  const newProduct = {
    company_id: old.company_id,
    item_id: null, // let DB generate or stay null
    business_unit: old.business_unit,
    type: old.type,
    name: `${pre.name.trim().replace(/^(LEDONE|ML|WL)\s*/, '')} (MES)`.trim(),
    description,
    unit_price: sellPx,
    cost: newCost,
    markup_percent: newMarkup,
    taxable: old.taxable,
    active: true,
    allotted_time_hours: old.allotted_time_hours,
    group_id: old.group_id,
    labor_rate_id: old.labor_rate_id,
    manufacturer: 'MES',
    model_number: mes.sku,
    product_category: old.product_category,
    dlc_listed: old.dlc_listed,
    in_utility_scope: old.in_utility_scope,
    floor_price: old.floor_price,
    ceiling_price: old.ceiling_price,
    suggest_in_lenard: old.suggest_in_lenard,
  }

  let newId = null
  if (DRY) {
    newId = -oldId
    console.log(`  [DRY] would create new product replacing ${oldId} → ${newProduct.name}`)
  } else {
    const { data: created, error: cErr } = await sb.from('products_services').insert(newProduct).select('id').single()
    if (cErr) { console.error(`  ✗ create for ${oldId}: ${cErr.message}`); log.errors.push({ step: 'create', oldId, error: cErr.message }); continue }
    newId = created.id
    console.log(`  ✓ created new product ${newId} (replaces ${oldId}): ${newProduct.name}`)
    log.newProducts.push({ oldId, newId, ...newProduct })
  }

  // --- Repoint product_components ---
  const refs = compsByOldId[oldId] || []
  for (const c of refs) {
    if (DRY) { console.log(`     [DRY] repoint component_id ${c.id}: ${oldId} → ${newId} (parent ${c.parent_product_id})`) }
    else {
      const { error: rErr } = await sb.from('product_components').update({ component_product_id: newId }).eq('id', c.id)
      if (rErr) { console.error(`     ✗ repoint ${c.id}: ${rErr.message}`); log.errors.push({ step: 'repoint', compRowId: c.id, error: rErr.message }); continue }
      log.repoints.push({ compRowId: c.id, parentId: c.parent_product_id, oldComponentId: oldId, newComponentId: newId })
    }
  }
  if (refs.length) console.log(`     → repointed ${refs.length} product_components row${refs.length !== 1 ? 's' : ''}`)

  // --- Archive old fixture ---
  const archivePatch = {
    active: false,
    name: old.name?.trim() + ' (ARCHIVED 2026-05-21)',
    // Restore original cost so historical reports stay accurate
    cost: pre.oldCost,
    manufacturer: old.manufacturer || null,
    model_number: old.model_number || null,
    markup_percent: pre.oldMarkup,
    description: `ARCHIVED 2026-05-21. Replaced by product ID ${newId} (MES vendor swap).\nOriginal name: ${pre.name.trim()}\nOriginal cost: $${pre.oldCost.toFixed(2)}\nReason: vendor consolidation to MES (London's green-highlighted picks).`,
    updated_at: new Date().toISOString(),
  }
  if (DRY) { console.log(`     [DRY] archive ${oldId} → active=false, name appended " (ARCHIVED 2026-05-21)"`) }
  else {
    const { error: aErr } = await sb.from('products_services').update(archivePatch).eq('id', oldId)
    if (aErr) { console.error(`     ✗ archive ${oldId}: ${aErr.message}`); log.errors.push({ step: 'archive', id: oldId, error: aErr.message }); continue }
    console.log(`     ✓ archived ${oldId}`)
    log.archives.push({ id: oldId, archivedAs: archivePatch.name })
  }
}

writeFileSync('scripts/_archive_replace_log.json', JSON.stringify(log, null, 2))
console.log(`\n✓ Wrote scripts/_archive_replace_log.json`)
console.log(`\nSummary:`)
console.log(`  Rollbacks: ${log.rollbacks.length}`)
console.log(`  New products created: ${log.newProducts.length}`)
console.log(`  product_components repointed: ${log.repoints.length}`)
console.log(`  Old products archived: ${log.archives.length}`)
console.log(`  Errors: ${log.errors.length}`)
if (log.errors.length) console.log(JSON.stringify(log.errors, null, 2))
