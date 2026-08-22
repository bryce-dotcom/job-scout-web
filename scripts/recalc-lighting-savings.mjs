// Bring stored audit savings up to the corrected rule (energy + demand).
//
// src/lib/lightingSavings.js changed what "annual savings" means; every audit
// already in the table still carries the energy-only figure it was written
// with. This recomputes them from their OWN stored assumptions — hours, days,
// rate, watts reduced — plus the company's demand settings. Nothing is
// invented: an audit with no wattage reduction, or a company with no demand
// charge set, comes out exactly where it was.
//
// Proposals already emailed are PDFs and snapshots; they do not move. This is
// the in-app number a rep is looking at.
//
//   node scripts/recalc-lighting-savings.mjs                 # dry run
//   node scripts/recalc-lighting-savings.mjs --write         # apply
//
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { savingsForStorage } from '../src/lib/lightingSavings.js'
config()

const WRITE = process.argv.includes('--write')
const i = process.argv.indexOf('--company')
const COMPANY = Number(i === -1 ? 3 : process.argv[i + 1])
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const { data: settings } = await s.from('settings')
    .select('key,value').eq('company_id', COMPANY)
    .in('key', ['lighting_demand_charge_per_kw', 'lighting_demand_coincidence'])
  const num = (k, d) => {
    const v = (settings || []).find((r) => r.key === k)?.value
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }
  const demandChargePerKw = num('lighting_demand_charge_per_kw', 0)
  const demandCoincidence = num('lighting_demand_coincidence', 0.8)
  console.log(`company ${COMPANY}: $${demandChargePerKw}/kW/mo at ${demandCoincidence} coincidence\n`)
  if (!demandChargePerKw) { console.log('no demand charge configured — nothing would change'); return }

  const { data: audits, error } = await s.from('lighting_audits')
    .select('id,audit_id,watts_reduced,operating_hours,operating_days,electric_rate,annual_savings_kwh,annual_savings_dollars')
    .eq('company_id', COMPANY).order('created_at', { ascending: false })
  if (error) { console.error('QUERY FAILED:', error.message); process.exit(1) }

  let changed = 0, oldSum = 0, newSum = 0, skipped = 0
  for (const a of audits) {
    const next = savingsForStorage({
      wattsReduced: a.watts_reduced,
      operatingHours: a.operating_hours,
      operatingDays: a.operating_days,
      electricRate: a.electric_rate,
      demandChargePerKw,
      demandCoincidence,
    })
    const was = Number(a.annual_savings_dollars) || 0
    if (!Number(a.watts_reduced)) { skipped++; continue }
    // The energy half must reproduce what is already stored; if it does not,
    // the audit's own assumptions no longer explain its number and a blind
    // overwrite would destroy whatever a human corrected by hand.
    if (next.annual_savings_dollars === was) continue
    changed++; oldSum += was; newSum += next.annual_savings_dollars
    if (changed <= 8) {
      console.log(`  ${String(a.audit_id).padEnd(14)} $${String(was).padEnd(10)} -> $${next.annual_savings_dollars}`)
    }
    if (WRITE) {
      const { error: uErr } = await s.from('lighting_audits').update(next).eq('id', a.id)
      if (uErr) console.log(`   FAILED ${a.audit_id}: ${uErr.message}`)
    }
  }
  if (changed > 8) console.log(`  ... and ${changed - 8} more`)
  console.log(`\n  audits: ${audits.length}   no wattage reduction (skipped): ${skipped}   changing: ${changed}`)
  console.log(`  total shown:  $${Math.round(oldSum).toLocaleString()}  ->  $${Math.round(newSum).toLocaleString()}`)
  console.log(WRITE ? '\napplied' : '\ndry run — re-run with --write')
})()
