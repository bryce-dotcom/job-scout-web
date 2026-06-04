// Re-build the HHH → MES mapping using ONLY green-highlighted MES
// products (London's chosen replacements). Compare against the prior
// best-match list to see which proposals stay vs. need rerouting.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const catalog = JSON.parse(readFileSync('scripts/_mes_catalog_with_colors.json', 'utf8'))
const greens = catalog.greenRows  // 65 rows

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
  return best ? { match: best, score } : { match: null, candCount: cands.length, hFixture, hWatts }
}

let withGreen = 0, withoutGreen = 0
const rows = []
for (const p of bundles) {
  const m = bestGreen(p)
  if (m?.match) {
    withGreen++
    rows.push({ p, match: m.match, ok: true })
  } else {
    withoutGreen++
    rows.push({ p, fallback: m, ok: false })
  }
}

console.log(`HHH electrical bundles: ${bundles.length}`)
console.log(`Mapped to a GREEN MES pick: ${withGreen}`)
console.log(`No green match found:        ${withoutGreen}`)
console.log('')
console.log('CURRENT (HHH)                                                            →  GREEN-APPROVED MES')
console.log('-'.repeat(180))
for (const r of rows) {
  const hhh = `${r.p.id}  ${r.p.name.trim().padEnd(58).slice(0, 58)} $${(r.p.unit_price + '').padStart(7)}`
  if (r.ok) {
    const right = `${r.match.sku}  ${r.match.name.slice(0, 70).padEnd(70)} $${(r.match.priceNum + '').padStart(7)}  [${r.match.section || r.match.sheet}]`
    console.log(`${hhh}  →  ${right}`)
  } else {
    const reason = r.fallback?.candCount ? `(${r.fallback.candCount} green ${r.fallback.hFixture} but no watt overlap)` : `(no green ${r.fallback?.hFixture || 'fixture'} match in catalog)`
    console.log(`${hhh}  →  ❌ ${reason}`)
  }
}
