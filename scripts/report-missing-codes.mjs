// Which variant fixtures still have no order code (vendor_sku)?
// Grouped by product line -> wattage tier, because one order code covers ALL
// install variants (Lift/Controls/Relocate) of the same fixture. So the vendor
// ask is one code per (family, wattage), not per row.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const { data: rows } = await s.from('products_services')
    .select('id,name,unit_price,model_number,vendor_sku,variant_group_id,variant_group_label,variant_options')
    .eq('company_id', 3).not('variant_group_id', 'is', null)

  // family -> wattage tier -> { anyCode, members[] }
  const fams = {}
  for (const r of rows) {
    const label = r.variant_group_label || 'Unlabeled'
    const watt = r.variant_options?.Wattage || '(single)'
    fams[label] = fams[label] || { fixtures: {}, gid: r.variant_group_id }
    const f = fams[label].fixtures
    f[watt] = f[watt] || { anyCode: false, code: null, model: null, count: 0, minPrice: Infinity }
    f[watt].count++
    if (r.vendor_sku) { f[watt].anyCode = true; f[watt].code = r.vendor_sku }
    if (r.model_number && !f[watt].model) f[watt].model = r.model_number
    const p = Number(r.unit_price) || 0
    if (p > 0) f[watt].minPrice = Math.min(f[watt].minPrice, p)
  }

  // Reduce to the fixtures MISSING a code
  const needing = []
  for (const [label, fam] of Object.entries(fams)) {
    const missing = Object.entries(fam.fixtures).filter(([, v]) => !v.anyCode)
    if (missing.length) needing.push({ label, missing: missing.map(([w, v]) => ({ watt: w, model: v.model, variants: v.count, from: v.minPrice })) })
  }
  needing.sort((a, b) => a.label.localeCompare(b.label))

  const totalFixtures = needing.reduce((n, f) => n + f.missing.length, 0)
  const totalVariants = needing.reduce((n, f) => n + f.missing.reduce((m, x) => m + x.variants, 0), 0)
  console.log(`Product lines needing codes: ${needing.length}`)
  console.log(`Distinct fixtures (family x wattage) needing a code: ${totalFixtures}`)
  console.log(`(covering ${totalVariants} catalog rows once each code is set)\n`)
  for (const f of needing) {
    console.log(`\n${f.label}  (${f.missing.length} fixture${f.missing.length > 1 ? 's' : ''})`)
    for (const m of f.missing) console.log(`   ${m.watt.padEnd(10)} ${m.model ? 'model ' + m.model : '(no model # on file)'}   — covers ${m.variants} install variant${m.variants > 1 ? 's' : ''}`)
  }

  // Emit JSON for the emailer
  const fs = await import('node:fs')
  const out = process.argv[2]
  if (out) { fs.writeFileSync(out, JSON.stringify({ needing, totalFixtures, totalVariants, lines: needing.length }, null, 2)); console.log(`\nwrote ${out}`) }
})()
