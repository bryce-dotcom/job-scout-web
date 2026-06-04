// Side-by-side: HHH current (cost + selling price) vs MES green pick (cost),
// showing cost delta. READ-ONLY.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const catalog = JSON.parse(readFileSync('scripts/_mes_catalog_with_colors.json', 'utf8'))
const greens = catalog.greenRows

let from = 0, all = []
for (;;) {
  const { data } = await sb.from('products_services')
    .select('id, name, type, product_category, unit_price, cost, active')
    .eq('company_id', 3)
    .range(from, from + 999)
  all.push(...(data || []))
  if (!data || data.length < 1000) break
  from += 1000
}
const bundles = all.filter(p => p.active && (
  p.type === 'Electrical Services (Bundles)' ||
  /\bbundle\b/i.test(p.product_category || '')
))

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
  if (/tube|t8|t5/i.test(n)) return 'tube'
  return null
}
function formOf(s) {
  const n = (s || '').toLowerCase()
  if (/2x4|2\s*x\s*4/.test(n)) return '2x4'
  if (/2x2|2\s*x\s*2/.test(n)) return '2x2'
  if (/1x4|1\s*x\s*4/.test(n)) return '1x4'
  return null
}

const greenIdx = greens.map(m => ({
  ...m,
  fixture: fixtureOf((m.name||'') + ' ' + (m.section||'') + ' ' + (m.category||'')),
  form: formOf((m.name||'') + ' ' + (m.section||'')),
  watts: wattsOf(m.name),
  priceNum: Number((m.price || '').replace(/[^0-9.]/g, '')) || 0,
}))

function bestGreen(hhh) {
  const hWatts = wattsOf(hhh.name)
  const hFixture = fixtureOf(hhh.name)
  const hForm = formOf(hhh.name)
  if (!hFixture) return null
  const cands = greenIdx.filter(m => m.fixture === hFixture)
  if (!cands.length) return null
  let best = null, score = -1
  for (const m of cands) {
    const overlap = hWatts.filter(w => m.watts.includes(w)).length
    let s = overlap * 10
    if (hForm && m.form === hForm) s += 5
    if (overlap === 0) continue
    if (overlap === hWatts.length && hWatts.length > 0) s += 8
    if (s > score) { best = m; score = s }
  }
  return best
}

const fmt = n => n == null || Number.isNaN(Number(n)) ? '   —   ' : `$${Number(n).toFixed(2).padStart(8)}`
const sign = n => n > 0 ? `+$${n.toFixed(2)}` : n < 0 ? `-$${Math.abs(n).toFixed(2)}` : ' $0.00'

const rows = bundles.map(p => ({ p, match: bestGreen(p) }))
const mapped = rows.filter(r => r.match)
const unmapped = rows.filter(r => !r.match)

// Sort: by largest savings (most negative delta) first
mapped.sort((a, b) => {
  const da = (a.match.priceNum) - (Number(a.p.cost) || 0)
  const db = (b.match.priceNum) - (Number(b.p.cost) || 0)
  return da - db
})

const W = {
  hhhId: 6, hhhName: 50, hhhCost: 10, hhhSell: 10, mesSku: 8, mesName: 52, mesCost: 10, delta: 10, margin: 10,
}

const head = (
  'HHH#'.padEnd(W.hhhId) + ' │ ' +
  'Current product'.padEnd(W.hhhName) + ' │ ' +
  'CurCost'.padStart(W.hhhCost) + ' │ ' +
  'SellPx'.padStart(W.hhhSell) + ' │ ' +
  ' SKU'.padEnd(W.mesSku) + ' │ ' +
  'New MES (green)'.padEnd(W.mesName) + ' │ ' +
  'NewCost'.padStart(W.mesCost) + ' │ ' +
  ' Δ Cost'.padStart(W.delta) + ' │ ' +
  'NewMargin'.padStart(W.margin)
)
console.log(head)
console.log('─'.repeat(head.length))

let totalOldCost = 0, totalNewCost = 0
for (const { p, match } of mapped) {
  const oldCost = Number(p.cost) || 0
  const sellPx = Number(p.unit_price) || 0
  const newCost = match.priceNum
  const delta = newCost - oldCost
  const newMargin = sellPx - newCost
  totalOldCost += oldCost
  totalNewCost += newCost
  console.log(
    String(p.id).padEnd(W.hhhId) + ' │ ' +
    p.name.trim().slice(0, W.hhhName).padEnd(W.hhhName) + ' │ ' +
    fmt(oldCost).padStart(W.hhhCost) + ' │ ' +
    fmt(sellPx).padStart(W.hhhSell) + ' │ ' +
    String(match.sku).padEnd(W.mesSku) + ' │ ' +
    match.name.slice(0, W.mesName).padEnd(W.mesName) + ' │ ' +
    fmt(newCost).padStart(W.mesCost) + ' │ ' +
    sign(delta).padStart(W.delta) + ' │ ' +
    fmt(newMargin).padStart(W.margin)
  )
}

console.log('─'.repeat(head.length))
console.log(`\n${mapped.length} mapped · ${unmapped.length} unmapped`)
console.log(`Total old cost (mapped):  $${totalOldCost.toFixed(2)}`)
console.log(`Total new cost (mapped):  $${totalNewCost.toFixed(2)}`)
console.log(`Net cost change:          ${sign(totalNewCost - totalOldCost)}  (sum across ${mapped.length} bundles, qty=1 each)`)
console.log(`Avg cost change per item: ${sign((totalNewCost - totalOldCost) / mapped.length)}`)

if (unmapped.length) {
  console.log(`\nUnmapped (${unmapped.length}):`)
  for (const { p } of unmapped) {
    console.log(`  ${p.id}  ${p.name.trim().slice(0, 70).padEnd(70)} cost ${fmt(p.cost)}  sell ${fmt(p.unit_price)}`)
  }
}
