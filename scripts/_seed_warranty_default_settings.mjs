// Seed company warranty defaults into the settings table.
//
// The "Extended Service Coverage" upsell flow needs to know what every
// company's STANDARD (no-upsell, included free) labor and parts warranty
// looks like, so convert-to-job can stamp the right coverage_until dates
// on the new job. Hardcoding HHH's 12mo labor / 60mo parts into the
// codepath was wrong — when other tenants come on board they'll have
// different standards (e.g. an HVAC shop typically does 12/12).
//
// This script seeds safe defaults for every existing company and then
// overrides HHH (company 3) with their actual lighting standard.
//
// Going forward, the company onboarding flow should seed these settings
// for new tenants. Add to the existing onboarding script later.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN — pass --apply ===\n')

// Generic-safe default for any field-service tenant. HHH overrides
// parts to 60 because DLC requires LED fixtures to carry a 5-yr
// manufacturer parts warranty for rebate eligibility — that's HHH's
// included baseline.
const GENERIC_LABOR_MONTHS = 12
const GENERIC_PARTS_MONTHS = 12
const HHH_PARTS_MONTHS = 60
const HHH_COMPANY_ID = 3

const SETTING_KEYS = {
  labor: 'default_labor_warranty_months',
  parts: 'default_parts_warranty_months',
}

const { data: companies } = await sb.from('companies').select('id, company_name').eq('active', true).order('id')
console.log(`Found ${companies?.length || 0} active companies`)

let inserted = 0, skipped = 0
for (const c of companies || []) {
  const isHHH = c.id === HHH_COMPANY_ID
  const partsMonths = isHHH ? HHH_PARTS_MONTHS : GENERIC_PARTS_MONTHS
  const laborMonths = GENERIC_LABOR_MONTHS

  for (const [colKey, value] of [
    [SETTING_KEYS.labor, String(laborMonths)],
    [SETTING_KEYS.parts, String(partsMonths)],
  ]) {
    const { data: existing } = await sb.from('settings')
      .select('id, value').eq('company_id', c.id).eq('key', colKey).maybeSingle()
    if (existing) {
      console.log(`  ${c.id} ${c.company_name?.slice(0,30) || ''}: ${colKey} already = ${existing.value} (skip)`)
      skipped++
      continue
    }
    console.log(`  ${c.id} ${c.company_name?.slice(0,30) || ''}: insert ${colKey} = ${value}`)
    if (APPLY) {
      const { error } = await sb.from('settings').insert({
        company_id: c.id,
        key: colKey,
        list_name: 'Warranty Defaults',
        value,
      })
      if (error) console.log(`    ERROR: ${error.message}`)
      else inserted++
    }
  }
}

console.log('\n========================================')
console.log(APPLY ? `APPLIED: ${inserted} inserted, ${skipped} skipped` : `DRY RUN: ${inserted ? 'would insert' : `would insert ~${(companies?.length||0)*2 - skipped}`}, ${skipped} already-set`)
