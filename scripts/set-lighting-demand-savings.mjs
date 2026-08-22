// Turn on the demand half of lighting savings for a company.
//
// Cole (869599b1): "Learned savings is showing low." The audit only ever
// computed the energy charge; a commercial customer also pays for peak demand.
// See src/lib/lightingSavings.js for the reasoning and the numbers.
//
// Deliberately opt-in per company, and 0 by default in the store: a tenant
// whose customers are on residential or small general-service tariffs has no
// demand charge to save, and inventing one for them would overstate every
// proposal they send.
//
//   node scripts/set-lighting-demand-savings.mjs                     # show current
//   node scripts/set-lighting-demand-savings.mjs --company 3 --charge 9.50 --coincidence 0.8 --write
//
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? dflt : process.argv[i + 1]
}
const WRITE = process.argv.includes('--write')
const COMPANY = Number(arg('company', 3))
const CHARGE = arg('charge')
const COINCIDENCE = arg('coincidence')
const LIST = 'Lighting Savings'

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const KEYS = {
  lighting_demand_charge_per_kw: 'Demand charge from the tariff, $/kW/month. 0 = customer is not on a demand tariff.',
  lighting_demand_coincidence: 'How much of the lighting load is assumed on at the building peak, 0..1. 0.8 is the conservative convention.',
}

;(async () => {
  const { data: existing, error } = await s.from('settings')
    .select('id,key,value').eq('company_id', COMPANY).in('key', Object.keys(KEYS))
  if (error) { console.error('QUERY FAILED:', error.message); process.exit(1) }

  console.log(`company ${COMPANY} — current:`)
  for (const k of Object.keys(KEYS)) {
    const row = existing.find((r) => r.key === k)
    console.log(`  ${k.padEnd(34)} ${row ? JSON.stringify(row.value) : '(not set)'}`)
  }

  const want = {}
  if (CHARGE != null) want.lighting_demand_charge_per_kw = String(Number(CHARGE))
  if (COINCIDENCE != null) want.lighting_demand_coincidence = String(Number(COINCIDENCE))
  if (!Object.keys(want).length) { console.log('\nnothing to set — pass --charge and/or --coincidence'); return }

  for (const [k, v] of Object.entries(want)) {
    if (!Number.isFinite(Number(v))) { console.error(`refusing to write ${k}=${v}: not a number`); process.exit(1) }
    if (k === 'lighting_demand_coincidence' && (Number(v) < 0 || Number(v) > 1)) {
      console.error(`refusing to write ${k}=${v}: must be between 0 and 1`); process.exit(1)
    }
    const row = existing.find((r) => r.key === k)
    console.log(`\n  ${row ? 'update' : 'insert'} ${k} -> ${v}`)
    if (!WRITE) continue
    const payload = { company_id: COMPANY, key: k, list_name: LIST, value: v }
    const { error: wErr } = row
      ? await s.from('settings').update({ value: v, list_name: LIST }).eq('id', row.id)
      : await s.from('settings').insert(payload)
    if (wErr) console.error(`   FAILED: ${wErr.message}`)
  }
  console.log(WRITE ? '\napplied' : '\ndry run — re-run with --write')
})()
