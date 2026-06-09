// Archive HHH's 3 wrong upsell products and create the 2 correct ones,
// per Bryce's correction:
//
//   STANDARD (free, no upsell needed): 5 yr parts (DLC-mandated for
//                                       rebate-eligible LED) + 1 yr labor
//   TIER A (+1 yr labor): 2.5% of contract, $250 floor, $3,500 ceiling
//                         labor_coverage_months_added = 12
//                         parts_coverage_months_added = 0
//   TIER B (+2 yr labor, +2 yr parts): 6% of contract, $1,500 floor,
//                                       $10,000 ceiling
//                                       labor_coverage_months_added = 24
//                                       parts_coverage_months_added = 24
//
// The 3 wrong existing products (2084, 2085, 2086) describe a different
// warranty structure that doesn't match Bryce's standard offering. We
// archive (don't delete) so existing references on past quotes still
// resolve cleanly.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN — pass --apply ===\n')

const log = { archived: [], created: [], warnings: [] }
const COMPANY_ID = 3 // HHH
const UPSELLS_GROUP_ID = 27

// ───────── Archive the 3 wrong upsells ─────────
const WRONG_IDS = [2084, 2085, 2086]
console.log('Step 1: Archive wrong upsell products')
for (const id of WRONG_IDS) {
  const { data: p } = await sb.from('products_services').select('id, name, active, company_id').eq('id', id).maybeSingle()
  if (!p) { console.log(`  skip ${id} — not found`); continue }
  if (p.company_id !== COMPANY_ID) { console.log(`  skip ${id} — wrong company`); continue }
  if (!p.active) {
    console.log(`  ${id} — already inactive: "${p.name}"`)
    log.warnings.push(`${id} already archived`)
    continue
  }
  const archivedName = p.name.includes('ARCHIVED') ? p.name : `${p.name} (ARCHIVED 2026-06-09)`
  console.log(`  archive ${id}: "${p.name}" → "${archivedName}"`)
  if (APPLY) {
    await sb.from('products_services').update({
      active: false,
      name: archivedName,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }
  log.archived.push({ id, oldName: p.name, newName: archivedName })
}

// ───────── Create the 2 correct upsells ─────────
const NEW_PRODUCTS = [
  {
    name: 'Extended Service Coverage — Tier A (+1 yr labor)',
    description: [
      'Adds 1 additional year of labor coverage on top of HHH\'s standard 1-year labor + 5-year parts warranty.',
      '',
      'COVERAGE TOTAL: 5 years parts + 2 years labor',
      '',
      'PRICING: 2.5% of contract value, minimum $250, maximum $3,500.',
      '',
      'What this covers: any warranty service call in year 2 — HHH eats the labor + lift + travel. Parts during that window are still covered by the DLC-mandated 5-year manufacturer warranty.',
    ].join('\n'),
    type: 'Service',
    group_id: UPSELLS_GROUP_ID,
    unit_price: 250,           // shown as starting price; the % rule overrides at line add
    cost: null,
    taxable: false,
    active: true,
    pricing_model: 'percent_of_contract',
    pricing_percent: 2.5,
    pricing_floor: 250,
    pricing_ceiling: 3500,
    labor_coverage_months_added: 12,
    parts_coverage_months_added: 0,
    suggest_in_lenard: false,
  },
  {
    name: 'Extended Service Coverage — Tier B (+2 yr labor, +2 yr parts)',
    description: [
      'Adds 2 additional years of labor coverage AND 2 additional years of parts coverage on top of HHH\'s standard.',
      '',
      'COVERAGE TOTAL: 7 years parts + 3 years labor',
      '',
      'PRICING: 6% of contract value, minimum $1,500, maximum $10,000.',
      '',
      'What this covers: any warranty service call in years 2-3 (labor) and any parts failure in years 6-7 (after the DLC 5-year manufacturer warranty ends, before HHH\'s extended coverage ends). HHH eats the labor + lift + travel + parts during those windows.',
      '',
      'Best for: high-bay warehouses running 2nd shift or 24/7, where manufacturer burning-hour caps (often 20,000 hrs = 2.5 years of 24/7) reduce the effective manufacturer warranty.',
    ].join('\n'),
    type: 'Service',
    group_id: UPSELLS_GROUP_ID,
    unit_price: 1500,          // starting price; % rule overrides
    cost: null,
    taxable: false,
    active: true,
    pricing_model: 'percent_of_contract',
    pricing_percent: 6,
    pricing_floor: 1500,
    pricing_ceiling: 10000,
    labor_coverage_months_added: 24,
    parts_coverage_months_added: 24,
    suggest_in_lenard: false,
  },
]

console.log('\nStep 2: Create new upsell products')
for (const p of NEW_PRODUCTS) {
  // Check if one already exists with same name (idempotency)
  const { data: existing } = await sb.from('products_services').select('id, name')
    .eq('company_id', COMPANY_ID)
    .eq('name', p.name)
    .maybeSingle()
  if (existing) {
    console.log(`  skip "${p.name}" — already exists (id ${existing.id})`)
    log.warnings.push(`already exists: ${p.name}`)
    continue
  }
  console.log(`  create "${p.name}"`)
  console.log(`    pricing: ${p.pricing_percent}% of contract, floor $${p.pricing_floor}, ceiling $${p.pricing_ceiling}`)
  console.log(`    coverage added: labor +${p.labor_coverage_months_added}mo, parts +${p.parts_coverage_months_added}mo`)
  if (APPLY) {
    const payload = { company_id: COMPANY_ID, ...p }
    const { data, error } = await sb.from('products_services').insert(payload).select('id').single()
    if (error) {
      console.log(`    ERROR: ${error.message}`)
      log.warnings.push(`insert failed: ${error.message}`)
    } else {
      console.log(`    created id ${data.id}`)
      log.created.push({ id: data.id, name: p.name })
    }
  }
}

console.log('\n========================================')
console.log(APPLY ? 'APPLIED:' : 'DRY RUN — pass --apply')
console.log(' archived:', log.archived.length)
console.log(' created: ', log.created.length)
console.log(' warnings:', log.warnings.length)

const fs = await import('node:fs')
fs.writeFileSync('./scripts/_setup_extended_service_coverage_log.json', JSON.stringify({ applied: APPLY, ranAt: new Date().toISOString(), ...log }, null, 2))
console.log('Log: ./scripts/_setup_extended_service_coverage_log.json')
