// Auto-classify products as 'material' or 'labor' so the invoice renderer
// can show a real Materials / Labor breakdown. Leaves unclear cases NULL
// for London to review.
//
// Heuristic (in order, first match wins):
//   1. Type 'Electrical Services (Bundles)'        → NULL (bundle — components decide)
//   2. Type 'Incentives'                            → NULL (not real work)
//   3. Name matches LABOR patterns                  → labor
//   4. Type 'LABOR Energy Scout' / 'Service' /
//      'service' / 'Custom Services'                → labor
//   5. Everything else (Electrical, Window
//      Cleaning, Energy Efficiency products, etc.)  → material
//
// READ-ONLY by default. Pass --apply to write changes.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')

const LABOR_NAME_PATTERNS = [
  /\bLIFT\b/i,
  /\bRelocat(e|ion)\b/i,                 // matches "Relocate" and "Relocation"
  /\bInstall(ation)?\b/i,
  /\bLabor\b/i,
  /\bService\s+(call|charge|fee)\b/i,
  /\bRepair\b/i,
  /\bDisposal\b/i,
  /\bRemoval\b/i,
  /\bcommission(ing)?\b/i,
]
const LABOR_NAME_DENY = [
  // Names that look labor-y but are actually materials/accessories
  /\bAccessor(y|ies)\b/i,
  /\bMaterials?\b/i,
]
const LABOR_TYPES = new Set([
  'LABOR Energy Scout',
  'Service',
  'service',
  'Custom Services',
  // Cleaning services are labor (the service IS the labor performed)
  'Window Cleaning',
  'Commercial Window Cleaning',
  'Residential Window Cleaning',
  'Exterior Cleaning & Maint',
])
const NULL_TYPES = new Set([
  'Electrical Services (Bundles)',  // bundle — components decide
  'Energy Efficiency',               // bundle-like — components decide
  'Incentives',                      // not real work
  'Google',                          // placeholder/import noise
])

function classify(p, hasChildren) {
  const name = (p.name || '').trim()
  const type = (p.type || '').trim()

  // True bundle (has component children) → null, real components decide.
  // Bundle-typed leaf product (no children) is just a single fixture →
  // treat as material so the math works.
  if (NULL_TYPES.has(type)) {
    if (hasChildren) return { label: null, reason: `type='${type}' is a real bundle with components — components decide` }
    return { label: 'material', reason: `type='${type}' but leaf product (no components) — treated as material fixture` }
  }
  if (LABOR_TYPES.has(type)) return { label: 'labor', reason: `type='${type}' is labor-only` }

  // Labor name patterns — but only if no deny pattern hits
  const matchedLaborPattern = LABOR_NAME_PATTERNS.find(re => re.test(name))
  const matchedDeny = LABOR_NAME_DENY.find(re => re.test(name))
  if (matchedLaborPattern && !matchedDeny) {
    return { label: 'labor', reason: `name matches /${matchedLaborPattern.source}/` }
  }
  if (matchedLaborPattern && matchedDeny) {
    return { label: 'material', reason: `name has labor pattern but also material keyword ('${matchedDeny.source}') — defaulting material` }
  }

  return { label: 'material', reason: 'default fallback (physical product / fixture / equipment)' }
}

// Pull all active products + which products have children in product_components
const [{ data: products }, { data: childrenRows }] = await Promise.all([
  sb.from('products_services')
    .select('id, name, type, product_category, labor_rate_id, cost, unit_price, material_or_labor')
    .eq('company_id', 3)
    .eq('active', true),
  sb.from('product_components').select('parent_product_id').eq('company_id', 3),
])

const productsWithChildren = new Set((childrenRows || []).map(r => r.parent_product_id))
console.log(`Active products: ${products.length}`)
console.log(`Products with children in product_components: ${productsWithChildren.size}`)

const results = products.map(p => ({ p, ...classify(p, productsWithChildren.has(p.id)) }))

const counts = { material: 0, labor: 0, null: 0 }
for (const r of results) counts[r.label === null ? 'null' : r.label]++

console.log('\nClassification distribution:')
console.log(`  material: ${counts.material}`)
console.log(`  labor:    ${counts.labor}`)
console.log(`  null:     ${counts.null}  (bundle / incentive — components decide)`)

// Confidence tiers for review report:
//  - HIGH: type-driven (Service / LABOR Energy Scout) or name has clear labor verb
//  - MEDIUM: bundle / NULL types (intentional)
//  - LOW: defaulted to material (no positive signal — most need review)
function confidence(p, r) {
  if (r.label === null) return 'intentional-null'
  if (r.reason.startsWith("type='")) return 'high'
  if (r.reason.startsWith('name matches')) return 'high'
  if (r.reason.startsWith('name has labor pattern')) return 'medium'
  return 'low-default-material'
}

const tiered = { high: [], medium: [], 'low-default-material': [], 'intentional-null': [] }
for (const r of results) tiered[confidence(r.p, r)].push(r)

console.log('\nConfidence tiers:')
for (const [t, rows] of Object.entries(tiered)) console.log(`  ${t}: ${rows.length}`)

// Sample each tier
console.log('\n=== Sample labor (high confidence) ===')
for (const r of tiered.high.filter(r => r.label === 'labor').slice(0, 8)) {
  console.log(`  ${r.p.id}  [${r.p.type}]  ${r.p.name?.trim().slice(0, 55)}  → ${r.label}  (${r.reason})`)
}
console.log('\n=== Sample material (low-confidence default — review candidates) ===')
for (const r of tiered['low-default-material'].slice(0, 10)) {
  console.log(`  ${r.p.id}  [${r.p.type}]  ${r.p.name?.trim().slice(0, 60)}  → material`)
}
console.log('\n=== Intentional NULLs (bundles + incentives) ===')
for (const r of tiered['intentional-null'].slice(0, 6)) {
  console.log(`  ${r.p.id}  [${r.p.type}]  ${r.p.name?.trim().slice(0, 60)}  → NULL  (${r.reason})`)
}

// Apply or dry-run
if (APPLY) {
  console.log('\n=== APPLYING classifications to DB ===')
  let updated = 0, errored = 0
  for (const r of results) {
    const { error } = await sb.from('products_services')
      .update({ material_or_labor: r.label })
      .eq('id', r.p.id)
    if (error) {
      console.error(`✗ ${r.p.id}: ${error.message}`)
      errored++
    } else {
      updated++
    }
  }
  console.log(`\n✓ Updated ${updated}, errored ${errored}`)
} else {
  console.log('\n(DRY RUN — pass --apply to write to DB)')
}

// Write review report for London
const lines = []
lines.push('# Material / Labor classification — needs your review')
lines.push('')
lines.push(`Auto-classified ${results.length} active products today (2026-05-26) so invoices can show a real Materials / Labor breakdown instead of a 70/30 estimate.`)
lines.push('')
lines.push(`Distribution: **${counts.material} material · ${counts.labor} labor · ${counts.null} NULL (bundles & incentives — components decide)**`)
lines.push('')
lines.push('## How the renderer uses this')
lines.push('')
lines.push('When an invoice line item is a bundle, we walk its components (`product_components` table) and sum the labeled costs:')
lines.push('- Sum of `material`-labeled component costs → parts portion')
lines.push('- Sum of `labor`-labeled component costs → labor portion')
lines.push('- The ratio is applied to the line\'s selling price (covers the margin proportionally)')
lines.push('- If ANY component is unclassified for a line, that line falls back to 70/30')
lines.push('')
lines.push('## Action items for London')
lines.push('')
lines.push('Go to **Products & Services** in the admin nav. Each product card has a new Material/Labor toggle. The categories below need your attention in priority order:')
lines.push('')

// Section 1: low-confidence material defaults (the things most likely to be wrong)
const lowConfLabor = tiered['low-default-material'].filter(r => {
  const n = (r.p.name || '').toLowerCase()
  // Flag anything that has a slight whiff of labor: words like 'tune', 'check', 'maintenance', 'replace'
  return /\b(tune|check|maintenance|maintain|replace|swap|move|trip|visit|hour|hr|truck|crew)\b/i.test(n)
})
lines.push(`### Possibly mis-classified (currently 'material', may actually be 'labor') — ${lowConfLabor.length} products`)
lines.push('')
if (lowConfLabor.length) {
  lines.push('| ID | Type | Name | Cost |')
  lines.push('|---|---|---|---:|')
  for (const r of lowConfLabor.slice(0, 40)) {
    lines.push(`| ${r.p.id} | ${r.p.type || ''} | ${r.p.name?.trim() || ''} | $${(r.p.cost ?? 0)} |`)
  }
  if (lowConfLabor.length > 40) lines.push(`| ... | | | ${lowConfLabor.length - 40} more — see full list |`)
} else {
  lines.push('_None flagged — heuristic looks clean for this run._')
}
lines.push('')

// Section 2: all labor assignments — quick scan
lines.push(`### Tagged 'labor' (${counts.labor} products) — quick scan to confirm`)
lines.push('')
lines.push('| ID | Type | Name | Reason |')
lines.push('|---|---|---|---|')
for (const r of results.filter(r => r.label === 'labor')) {
  lines.push(`| ${r.p.id} | ${r.p.type || ''} | ${r.p.name?.trim() || ''} | ${r.reason} |`)
}
lines.push('')

// Section 3: full classification list (collapsed)
lines.push('### Full classification reference')
lines.push('')
lines.push('<details><summary>All material-labeled products (click to expand)</summary>')
lines.push('')
lines.push('| ID | Type | Name | Cost |')
lines.push('|---|---|---|---:|')
for (const r of results.filter(r => r.label === 'material')) {
  lines.push(`| ${r.p.id} | ${r.p.type || ''} | ${r.p.name?.trim() || ''} | $${(r.p.cost ?? 0)} |`)
}
lines.push('')
lines.push('</details>')
lines.push('')

lines.push('---')
lines.push('')
lines.push(`*Generated by \`scripts/_classify_material_or_labor.mjs\` on 2026-05-26. Re-run with \`--apply\` to refresh classifications after heuristic changes.*`)

writeFileSync('scripts/MATERIAL_LABOR_REVIEW.md', lines.join('\n'))
console.log('\n✓ Wrote scripts/MATERIAL_LABOR_REVIEW.md')
