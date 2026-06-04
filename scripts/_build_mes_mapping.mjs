// Build the current → new MES mapping for electrical bundles.
// READ-ONLY. Outputs a TSV the user can review before any DB changes.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// MES products extracted from the user's sheet (gid=398901913). Captured
// from the clipboard read — only the fields we need for matching.
// (Imported subset; we'll re-pull live if the user wants full coverage.)
const MES = [
  // Panel High Bay
  { id: '6681', section: 'Panel High Bay', name: '02861 - LED 2x2 Back-Lit Panel Highbay 100W-150W-210W', price: 99.00, watts: [100,150,210] },
  { id: '6682', section: 'Panel High Bay', name: '02862 - LED 2x4 Back-Lit Panel Highbay 180W-260W-325W', price: 131.00, watts: [180,260,325] },
  // Linear High Bay (2FT/3FT)
  { id: '5116', section: 'Linear High Bay', name: '09240 03 - LED 2FT Linear High Bay 50W-60W-70W-90W-110W', price: 65.80, watts: [50,60,70,90,110] },
  { id: '5117', section: 'Linear High Bay', name: '09241 03 - LED 2FT Linear High Bay 90W-110W-130W-150W-165W', price: 72.50, watts: [90,110,130,150,165] },
  { id: '5118', section: 'Linear High Bay', name: '09242 03 - LED 2FT Linear High Bay 150W-165W-180W-200W-220W', price: 81.50, watts: [150,165,180,200,220] },
  { id: '5742', section: 'Linear High Bay', name: '09245 - LED 2FT Linear High Bay 90W-110W-130W-150W-165W 277-480V', price: 102.50, watts: [90,110,130,150,165] },
  { id: '5743', section: 'Linear High Bay', name: '09246 - LED 2FT Linear High Bay 150W-165W-180W-200W-220W 277-480V', price: 111.50, watts: [150,165,180,200,220] },
  { id: '6078', section: 'Linear High Bay', name: '09247 01 - LED 3FT Linear High Bay 110W-165W-220W-300W', price: 175.00, watts: [110,165,220,300] },
  // Magnetic Strip Kits (drivers/strips)
  { id: '6422', section: 'Magnetic Strip Kits', name: '03751 - LED Magnetic Retrofit Strip 2 Prong', price: 1.40, watts: [] },
  { id: '6423', section: 'Magnetic Strip Kits', name: '03752 - LED Magnetic Retrofit Strip 3 Prong', price: 2.20, watts: [] },
  { id: '6418', section: 'Magnetic Strip Kits', name: '09051 - Magnetic Strip Kit Driver 9W-12W-18W', price: 15.75, watts: [9,12,18] },
  { id: '6419', section: 'Magnetic Strip Kits', name: '09052 - Magnetic Strip Kit Driver 24W-30W-40W', price: 17.00, watts: [24,30,40] },
  { id: '6420', section: 'Magnetic Strip Kits', name: '09053 - Magnetic Strip Kit Driver 30W-45W-60W', price: 20.00, watts: [30,45,60] },
]

// Pull HHH (company 3) active electrical bundle products.
let from = 0, all = []
for (;;) {
  const { data, error } = await sb.from('products_services')
    .select('id, name, type, product_category, unit_price, active')
    .eq('company_id', 3)
    .range(from, from + 999)
  if (error) { console.error(error); process.exit(1) }
  all.push(...(data || []))
  if (!data || data.length < 1000) break
  from += 1000
}
const bundles = all.filter(p =>
  p.active && (p.type === 'Electrical Services (Bundles)' || /\bbundle\b/i.test(p.product_category || ''))
)
console.log(`total HHH products: ${all.length}`)
console.log(`active "Electrical Services (Bundles)": ${bundles.length}`)

// Parse a product name into { fixture, watts[] }
function parseProduct(name) {
  const n = (name || '').toLowerCase()
  // Wattage list, e.g. "90W/110W/130W" or "90W-110W-130W"
  const wattMatches = [...n.matchAll(/(\d+)\s*w(?=[\s/\-]|$)/g)].map(m => Number(m[1]))
  let fixture = 'unknown'
  if (/highbay|high bay/.test(n)) fixture = 'highbay'
  else if (/2x4|2x2|1x4|backlit\s+panel|back-lit\s+panel/.test(n)) fixture = 'panel'
  else if (/vapor\s+tight/.test(n)) fixture = 'vapor_tight'
  else if (/wall\s*pack/.test(n)) fixture = 'wall_pack'
  else if (/wrap/.test(n)) fixture = 'wrap'
  else if (/strip\s*light/.test(n)) fixture = 'strip'
  else if (/troffer/.test(n)) fixture = 'troffer'
  else if (/area\s*light|cobra/.test(n)) fixture = 'area'
  return { fixture, watts: wattMatches }
}

function bestMesMatch(hhh) {
  const { fixture, watts } = parseProduct(hhh.name)
  if (fixture === 'unknown') return null
  const compatibleSection = {
    highbay: ['Linear High Bay', 'Panel High Bay', 'Round High Bay'],
    panel: ['Back-Lit Panels', 'Panel High Bay'],
    vapor_tight: ['Vapor Tight High Bay'],
    wall_pack: [],   // No wall packs in the High Bay tab; need other MES tabs
    wrap: [],
    strip: ['Linear Strip Fixtures'],
    troffer: ['Troffer (Center Basket)'],
    area: [],
  }[fixture] || []

  // Match: same fixture family + max overlap on wattage list
  let best = null, bestScore = 0
  for (const m of MES) {
    if (compatibleSection.length && !compatibleSection.includes(m.section)) continue
    if (!m.watts.length) continue
    // Score: number of HHH watts present in MES watts
    const overlap = watts.filter(w => m.watts.includes(w)).length
    if (overlap > bestScore || (overlap === bestScore && best && Math.abs(m.price - hhh.unit_price) < Math.abs(best.price - hhh.unit_price))) {
      best = m
      bestScore = overlap
    }
  }
  if (bestScore === 0) return null
  return { match: best, score: bestScore }
}

console.log('\nHHH_ID\tHHH_NAME\tHHH_PRICE\t→\tMES_SKU\tMES_NAME\tMES_PRICE\tMATCH_SCORE')
for (const p of bundles) {
  const m = bestMesMatch(p)
  if (m) {
    console.log(`${p.id}\t${p.name}\t$${p.unit_price}\t→\t${m.match.id}\t${m.match.name}\t$${m.match.price}\t${m.score}/${parseProduct(p.name).watts.length}`)
  } else {
    console.log(`${p.id}\t${p.name}\t$${p.unit_price}\t→\t(no MES match — check sheet)\t-\t-\t0`)
  }
}
