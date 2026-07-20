// Backfill the SMBE Highbay family into ONE variant group.
//
// Parses each of the 40 catalog names ONCE (here, human-verifiable) into a
// structured option map, then stores it. The app never re-parses names — it
// reads variant_options. Real data in, structured data out.
//
//   node scripts/backfill-smbe-variants.mjs          # dry run (prints the plan)
//   node scripts/backfill-smbe-variants.mjs --write   # apply
//
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
config()

const WRITE = process.argv.includes('--write')
const COMPANY = 3
const LABEL = 'SMBE Highbay'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// --- the one-time parse -----------------------------------------------------
const flags = (n) => {
  n = n.toLowerCase()
  return { Lift: /\blift\b/.test(n), Controls: /control/.test(n), Relocate: /relocat/.test(n) }
}
const wattageRange = (name) => {
  const m = name.match(/SMBE\s+([\d/wW]+)/)
  if (!m) return null
  const nums = m[1].toUpperCase().replace(/W/g, '').split('/').map(x => x.trim()).filter(Boolean)
  if (!nums.length) return null
  return `${nums[0]}-${nums[nums.length - 1]}W`
}

;(async () => {
  const { data: rows, error } = await s.from('products_services')
    .select('id,name,unit_price,vendor_sku,variant_group_id,variant_options')
    .eq('company_id', COMPANY)
    .or('name.ilike.%SMBE%highbay%,name.ilike.%SMBE%high bay%')
    .order('name')
  if (error) { console.error('QUERY FAILED:', error.message); process.exit(1) }
  console.log(`SMBE Highbay rows: ${rows.length}\n`)

  // Stable group id: reuse any existing one on the family, else mint one.
  const existing = rows.map(r => r.variant_group_id).find(Boolean)
  const groupId = existing || randomUUID()
  console.log(`variant_group_id: ${groupId}${existing ? ' (reused)' : ' (new)'}\n`)

  const plan = []
  const wattSet = new Set()
  for (const r of rows) {
    const watt = wattageRange(r.name)
    if (!watt) { console.error(`  !! could not parse wattage from: ${r.name}`); continue }
    wattSet.add(watt)
    const f = flags(r.name)
    const options = { Wattage: watt, Lift: f.Lift, Controls: f.Controls, Relocate: f.Relocate }
    plan.push({ id: r.id, name: r.name, price: r.unit_price, sku: r.vendor_sku, options })
  }

  // Report grouped by wattage so the parse is easy to eyeball
  console.log(`Wattage tiers found (${wattSet.size}): ${[...wattSet].join(', ')}\n`)
  const badge = (o) => [o.Lift && 'Lift', o.Controls && 'Controls', o.Relocate && 'Relocate'].filter(Boolean).join('+') || 'Standard'
  for (const w of [...wattSet].sort((a, b) => parseInt(a) - parseInt(b))) {
    const mem = plan.filter(p => p.options.Wattage === w)
    console.log(`  ${w}  (${mem.length} installs, sku=${mem.find(m => m.sku)?.sku || 'NONE'})`)
    for (const m of mem) console.log(`      #${m.id}  ${badge(m.options).padEnd(22)} $${m.price}   ${m.name}`)
  }

  if (!WRITE) {
    console.log(`\n[dry run] would set variant_group_id + label "${LABEL}" + variant_options on ${plan.length} rows.`)
    console.log('Re-run with --write to apply.')
    return
  }

  console.log(`\nApplying to ${plan.length} rows...`)
  let ok = 0, fail = 0
  for (const p of plan) {
    const { error: uErr } = await s.from('products_services')
      .update({ variant_group_id: groupId, variant_group_label: LABEL, variant_options: p.options })
      .eq('id', p.id).eq('company_id', COMPANY)
    if (uErr) { console.error(`  FAIL #${p.id}: ${uErr.message}`); fail++ } else { ok++ }
  }
  console.log(`\nDone. updated=${ok} failed=${fail}`)

  // Verify round-trip
  const { data: check } = await s.from('products_services')
    .select('id,variant_group_id,variant_group_label,variant_options')
    .eq('company_id', COMPANY).eq('variant_group_id', groupId)
  console.log(`Verify: ${check?.length || 0} rows now carry variant_group_id ${groupId}`)
  console.log('Sample:', JSON.stringify(check?.[0]?.variant_options))
})()
