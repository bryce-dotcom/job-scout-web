#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed the RMP UT Express Tool Measure Table into Supabase.
 *
 * Reads the `RMP UT Express Tool v*.xlsx` file and upserts:
 *   1. A Rocky Mountain Power utility_providers row per company
 *   2. Two utility_programs rows (SMBE + Express) per company
 *   3. 178 prescriptive_measures rows (172 interior + 6 exterior UT)
 *
 * All upserts are idempotent. Safe to re-run after an RMP update.
 *
 * Usage:
 *   node scripts/seed-rmp-ut-measures.js <path-to-xlsx> [--company-id=3]
 *
 * Requires .env with VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

const path = require('path')
const XLSX = require('xlsx')
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

// ---------- CLI ----------
const args = process.argv.slice(2)
const xlsxPath = args.find((a) => !a.startsWith('--'))
const companyArg = args.find((a) => a.startsWith('--company-id='))
const COMPANY_ID = companyArg ? parseInt(companyArg.split('=')[1]) : 3

if (!xlsxPath) {
  console.error('Usage: node scripts/seed-rmp-ut-measures.js <path-to-xlsx> [--company-id=3]')
  process.exit(1)
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------- Measure name parser ----------
// Example names:
//   Interior Lighting Express - No Control - Warehouse - Retrofit - SBE - UT
//   Interior Lighting Express - LED w/LLLC - Assembly - Retrofit - UT
//   Exterior Lighting Express - LED 3W to 47W - Retrofit - SBE - UT
function parseMeasureName(name) {
  if (!name || typeof name !== 'string') return null
  const parts = name.split(' - ').map((s) => s.trim())
  // Strip the trailing ' - UT' and optional ' - SBE'
  const state = parts[parts.length - 1]
  const is_sbe = parts[parts.length - 2] === 'SBE'
  const tail = is_sbe ? parts.slice(0, -2) : parts.slice(0, -1) // remove state (+ SBE if present)
  // Expected: [ category, controls_descr, business_type, 'Retrofit' ]
  // Last element should be 'Retrofit' — drop it.
  if (tail[tail.length - 1] !== 'Retrofit') return null
  const body = tail.slice(0, -1)
  // body[0] = "Interior Lighting Express" / "Exterior Lighting Express"
  // body[1] = "No Control" | "Control Ready" | "LED w/NLC" | "LED w/LLLC" | "LED 3W to 47W" etc.
  // body[2] = business type (optional for exterior)
  const category = (body[0] || '').toLowerCase().includes('exterior') ? 'Exterior' : 'Interior'
  const controlsDescr = body[1] || ''
  let tier = null
  if (category === 'Exterior') {
    tier = 'exterior'
  } else if (/no control/i.test(controlsDescr)) tier = 'none'
  else if (/control ready/i.test(controlsDescr)) tier = 'control_ready'
  else if (/w\/nlc/i.test(controlsDescr)) tier = 'nlc'
  else if (/w\/lllc/i.test(controlsDescr)) tier = 'lllc'
  const business_type = body[2] || null
  return { state, category, tier, business_type, is_sbe }
}

// ---------- Main ----------
async function main() {
  console.log(`\nSeeding RMP UT Express Tool measures for company ${COMPANY_ID}`)
  console.log(`  File: ${path.resolve(xlsxPath)}\n`)

  const wb = XLSX.readFile(xlsxPath)
  const mt = wb.Sheets['Measure Table']
  if (!mt) {
    console.error('Workbook is missing "Measure Table" sheet')
    process.exit(1)
  }
  const rows = XLSX.utils.sheet_to_json(mt, { header: 1, defval: '', raw: true })
  console.log(`  Raw rows: ${rows.length - 1}`)

  // Filter to UT only
  const utRows = rows.slice(1).filter((r) => r[0] === 'UT')
  console.log(`  UT rows:  ${utRows.length}`)

  // ---------- Step 1: Resolve existing global RMP programs ----------
  console.log('\n[1/2] Resolving existing global RMP utility_programs')
  // Two global rows (company_id IS NULL) were seeded in an earlier migration:
  //   "Wattsmart Business Incentives (2025)" → non-SBE "Express" (max_cap 70)
  //   "Small and Medium Business Express (2025)" → SBE (max_cap 75)
  const { data: existingPrograms } = await supabase
    .from('utility_programs')
    .select('id, program_name, max_cap_percent')
    .eq('utility_name', 'Rocky Mountain Power')
    .in('program_name', [
      'Wattsmart Business Incentives (2025)',
      'Small and Medium Business Express (2025)',
    ])

  const programIds = {}
  for (const p of existingPrograms || []) {
    if (p.program_name.includes('Small and Medium Business')) programIds.sbe = p.id
    else programIds.express = p.id
  }
  if (!programIds.sbe || !programIds.express) {
    console.error('  Could not find both RMP utility_programs rows. Found:', existingPrograms)
    process.exit(1)
  }
  console.log(`  SBE program:     ${programIds.sbe}`)
  console.log(`  Express program: ${programIds.express}`)

  // ---------- Step 2: Measures ----------
  console.log('\n[2/2] Upserting prescriptive_measures')
  // Header index: State=0, Category=1, Type=2, SubType=3, Name=4, RefNumber=5, ...
  // Using 0-indexed columns:
  //   0 State, 1 Measure Category, 2 Measure Type, 3 Measure Sub Type,
  //   4 Measure Name, 5 Measure Reference Number, 6 Version, 7 Spruce ID,
  //   8 Effective Start, 9 Effective End, 10 kWh unit label, 11 kWh/yr,
  //   12 kW/unit, 13 cost unit, 14 cost/unit, 15 incentive/unit, 16 unit label,
  //   17 project cap bool, 18 project cap %
  let upserts = 0
  let skipped = 0
  const toUpsert = []
  for (const r of utRows) {
    const name = r[4]
    const code = r[5]
    if (!name || !code) { skipped++; continue }
    const parsed = parseMeasureName(name)
    if (!parsed || !parsed.tier) { skipped++; continue }

    const programId = parsed.is_sbe ? programIds.sbe : programIds.express
    if (!programId) { skipped++; continue }

    toUpsert.push({
      company_id: COMPANY_ID,
      program_id: programId,
      measure_code: String(code),
      measure_name: name,
      measure_category: 'Lighting',
      measure_subcategory: parsed.category + ' LED',
      location_type: parsed.category,
      application_type: 'retrofit',
      building_type: parsed.business_type,
      incentive_amount: parseFloat(r[15]) || 0,
      incentive_unit: 'per_watt_installed',
      max_project_percent: parseFloat(r[18]) || null,
      annual_kwh_per_unit: parseFloat(r[11]) || null,
      incremental_cost_per_unit: parseFloat(r[14]) || null,
      rmp_controls_tier: parsed.tier,
      rmp_business_type: parsed.business_type,
      rmp_is_sbe: parsed.is_sbe,
      effective_date: '2025-07-11',
      is_active: true,
      notes: `Seeded from RMP UT Express Tool v071125.2 (code ${code})`,
      source_notes: 'Rocky Mountain Power Wattsmart Business Express Lighting Retrofits, UT',
    })
  }

  console.log(`  Prepared ${toUpsert.length} rows (${skipped} skipped)`)

  // Upsert in batches of 50, keyed on company_id + measure_code
  const batchSize = 50
  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize)
    // Delete existing by company_id + measure_code, then insert. Simpler than
    // composite-key upsert (prescriptive_measures has no unique index on
    // (company_id, measure_code) by default).
    const codes = batch.map((b) => b.measure_code)
    await supabase
      .from('prescriptive_measures')
      .delete()
      .eq('company_id', COMPANY_ID)
      .in('measure_code', codes)
    const { error: insErr } = await supabase.from('prescriptive_measures').insert(batch)
    if (insErr) {
      console.error(`  Batch ${i} insert failed:`, insErr)
      process.exit(1)
    }
    upserts += batch.length
    process.stdout.write(`\r  Upserted ${upserts}/${toUpsert.length}`)
  }
  process.stdout.write('\n')

  console.log('\nSeed complete.')
  console.log(`  SBE program:  ${programIds.sbe}`)
  console.log(`  Express prog: ${programIds.express}`)
  console.log(`  Measures:     ${upserts} upserted, ${skipped} skipped`)
  console.log('\nSpot-check examples:')
  const samples = [
    { name: 'Warehouse SBE No Control', where: { rmp_is_sbe: true, rmp_controls_tier: 'none', rmp_business_type: 'Warehouse' } },
    { name: 'Warehouse SBE LLLC', where: { rmp_is_sbe: true, rmp_controls_tier: 'lllc', rmp_business_type: 'Warehouse' } },
    { name: 'Manufacturing Express NLC', where: { rmp_is_sbe: false, rmp_controls_tier: 'nlc', rmp_business_type: 'Manufacturing' } },
    { name: 'Exterior SBE', where: { rmp_is_sbe: true, rmp_controls_tier: 'exterior' } },
  ]
  for (const s of samples) {
    const { data } = await supabase
      .from('prescriptive_measures')
      .select('measure_name, incentive_amount, max_project_percent')
      .eq('company_id', COMPANY_ID)
      .match(s.where)
      .limit(1)
    if (data?.length) {
      console.log(`  ${s.name}: $${data[0].incentive_amount}/W, cap ${data[0].max_project_percent}`)
    } else {
      console.log(`  ${s.name}: NO MATCH`)
    }
  }
}

main().catch((err) => {
  console.error('\nSeed failed:', err)
  process.exit(1)
})
