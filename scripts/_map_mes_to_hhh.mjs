// Build current → MES replacement mapping for HHH's "Electrical
// Services (Bundles)" products. READ-ONLY. Outputs a TSV the user can
// review before any DB changes.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// MES catalog from the parsed XLSX
const catalog = JSON.parse(readFileSync('scripts/_mes_catalog.json', 'utf8'))
const mesAll = []
for (const [sheet, info] of Object.entries(catalog.sheets)) {
  for (const p of info.products) {
    mesAll.push({ ...p, sheet })
  }
}
console.log(`MES catalog: ${mesAll.length} products from ${Object.keys(catalog.sheets).join(', ')}`)

// Pull HHH active electrical bundle products
let from = 0, all = []
for (;;) {
  const { data } = await sb.from('products_services')
    .select('id, name, type, product_category, unit_price, active')
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
console.log(`HHH electrical bundles (active): ${bundles.length}\n`)

// === Parsing ===
function wattsOf(s) {
  return [...(s || '').matchAll(/(\d{1,4})\s*W(?=[\s\/\-,]|$)/gi)].map(m => Number(m[1]))
}
function fixtureOf(s) {
  const n = (s || '').toLowerCase()
  if (/2x4|2x2|1x4|backlit\s*panel|back-lit\s*panel/.test(n) && !/troffer/.test(n)) return 'panel'
  if (/troffer/.test(n)) return 'troffer'
  if (/vapor\s*tight/.test(n)) return 'vapor'
  if (/canopy/.test(n)) return 'canopy'
  if (/flood/.test(n)) return 'flood'
  if (/bollard/.test(n)) return 'bollard'
  if (/sport/.test(n) && /light/.test(n)) return 'sport'
  if (/area\s*light|cobra|pole/.test(n)) return 'area'
  if (/mini\s*wall\s*pack|wall\s*pack/.test(n)) return 'wallpack'
  if (/soffit/.test(n)) return 'soffit'
  if (/dusk\s*to\s*dawn|d2d/.test(n)) return 'd2d'
  if (/post\s*top/.test(n)) return 'posttop'
  if (/strip\s*light|strip\s*fixture/.test(n)) return 'strip'
  if (/wrap/.test(n)) return 'wrap'
  if (/highbay|high\s*bay/.test(n)) return 'highbay'
  if (/tube|t8|t5/i.test(n)) return 'tube'
  if (/downlight|down\s*light/.test(n)) return 'downlight'
  if (/exit|emergency/.test(n)) return 'exit'
  return null
}
function formFactorOf(s) {
  const n = (s || '').toLowerCase()
  if (/2x4|2\s*x\s*4/.test(n)) return '2x4'
  if (/2x2|2\s*x\s*2/.test(n)) return '2x2'
  if (/1x4|1\s*x\s*4/.test(n)) return '1x4'
  return null
}

// Pre-classify MES catalog
const mesIdx = mesAll.map(m => ({
  ...m,
  fixture: fixtureOf(m.name + ' ' + (m.section || '') + ' ' + (m.category || '')),
  form: formFactorOf(m.name + ' ' + (m.section || '')),
  watts: wattsOf(m.name),
  priceNum: Number((m.price || '').replace(/[^0-9.]/g, '')) || 0,
}))

function bestMatchFor(hhh) {
  const hWatts = wattsOf(hhh.name)
  const hFixture = fixtureOf(hhh.name)
  const hForm = formFactorOf(hhh.name)
  if (!hFixture) return null

  const candidates = mesIdx.filter(m => m.fixture === hFixture)
  if (!candidates.length) return null

  // Score = wattage-overlap × 10 + (form-factor match ? 5 : 0) + (sheet-relevant ? 2 : 0)
  let best = null, bestScore = -1
  for (const m of candidates) {
    const overlap = hWatts.filter(w => m.watts.includes(w)).length
    let score = overlap * 10
    if (hForm && m.form === hForm) score += 5
    if (overlap === 0) continue  // require at least one watt match
    // Prefer items with all our watts (full overlap)
    if (overlap === hWatts.length && hWatts.length > 0) score += 8
    if (score > bestScore) { best = m; bestScore = score }
  }
  return best ? { match: best, score: bestScore, hWatts, hFixture, hForm } : { match: null, candidates: candidates.length, hFixture, hWatts }
}

// === Build mapping ===
const rows = []
let mapped = 0, unmapped = 0
for (const p of bundles) {
  const m = bestMatchFor(p)
  if (m?.match) {
    mapped++
    rows.push({
      hhh_id: p.id,
      hhh_name: p.name.trim(),
      hhh_price: p.unit_price,
      mes_sku: m.match.sku,
      mes_name: m.match.name,
      mes_section: m.match.section,
      mes_sheet: m.match.sheet,
      mes_price: m.match.priceNum,
      fixture: m.hFixture,
      form: m.hForm || '',
      hhh_watts: m.hWatts.join('/'),
      mes_watts: m.match.watts.join('/'),
      score: m.score,
    })
  } else {
    unmapped++
    rows.push({
      hhh_id: p.id,
      hhh_name: p.name.trim(),
      hhh_price: p.unit_price,
      mes_sku: '',
      mes_name: m?.candidates ? `(${m.candidates} candidates in ${m.hFixture} but no watt overlap)` : '(no fixture match)',
      mes_section: '',
      mes_sheet: '',
      mes_price: '',
      fixture: m?.hFixture || '?',
      form: '',
      hhh_watts: (m?.hWatts || []).join('/'),
      mes_watts: '',
      score: 0,
    })
  }
}

// === Write TSV ===
const headers = ['hhh_id','hhh_name','hhh_price','mes_sku','mes_name','mes_section','mes_sheet','mes_price','fixture','form','hhh_watts','mes_watts','score']
const tsv = [headers.join('\t'), ...rows.map(r => headers.map(h => r[h]).join('\t'))].join('\n')
writeFileSync('scripts/_mes_mapping.tsv', tsv)

console.log(`mapped: ${mapped} · unmapped: ${unmapped}`)
console.log(`Wrote scripts/_mes_mapping.tsv\n`)

// === Console summary ===
console.log('CURRENT (HHH)                                                            →  REPLACEMENT (MES)')
console.log('-'.repeat(180))
for (const r of rows) {
  const left = `${r.hhh_id}  ${r.hhh_name.padEnd(58).slice(0, 58)} $${(r.hhh_price+'').padStart(7)}`
  const right = r.mes_sku
    ? `${r.mes_sku}  ${r.mes_name.slice(0, 70).padEnd(70)} $${(r.mes_price+'').padStart(7)}  [${r.mes_section}]`
    : `❌ ${r.mes_name}`
  console.log(`${left}  →  ${right}`)
}
