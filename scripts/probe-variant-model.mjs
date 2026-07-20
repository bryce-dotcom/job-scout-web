import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const flags = (n) => { n = n.toLowerCase(); return { lift: /\blift\b/.test(n), controls: /control/.test(n), relocate: /relocat/.test(n) } }
const famKey = (n) => { const m = n.match(/SMBE\s+([\d/wW]+)/); return m ? m[1].toUpperCase().replace(/\s/g, '') : n }

;(async () => {
  // 1. Does variant_group_id already exist on products_services?
  for (const col of ['variant_group_id', 'variant_group_label', 'variant_options']) {
    const { error } = await s.from('products_services').select(col).limit(1)
    console.log(`  column ${col}: ${error ? 'MISSING (' + error.message.slice(0, 40) + ')' : 'ALREADY EXISTS'}`)
  }

  // 2. What is group_id? (confirm it's the product_groups link, not free for variants)
  const { data: pg } = await s.from('product_groups').select('id,name,service_type').eq('company_id', 3).limit(50)
  console.log(`\n  product_groups (co 3): ${pg?.length || 0} — e.g. ${(pg || []).slice(0, 4).map(g => g.name).join(', ')}`)

  // 3. The SMBE Highbay family
  const { data: rows } = await s.from('products_services')
    .select('id,name,type,product_category,group_id,unit_price,cost,model_number,vendor_sku,default_vendor_id,allotted_time_hours,active')
    .eq('company_id', 3)
    .or('name.ilike.%SMBE%highbay%,name.ilike.%SMBE%high bay%')
    .order('name')
  console.log(`\n=== SMBE Highbay rows: ${rows?.length || 0} ===`)

  // group by famKey, map combos
  const fam = {}
  for (const r of rows || []) {
    const fk = famKey(r.name), f = flags(r.name)
    const combo = (f.lift ? 1 : 0) + '' + (f.controls ? 1 : 0) + '' + (f.relocate ? 1 : 0)
    if (!fam[fk]) fam[fk] = { rows: {}, sku: null, gid: new Set(), cat: new Set(), vendor: new Set(), active: 0 }
    fam[fk].rows[combo] = r
    if (r.vendor_sku) fam[fk].sku = r.vendor_sku
    fam[fk].gid.add(r.group_id)
    fam[fk].cat.add(r.product_category)
    fam[fk].vendor.add(r.default_vendor_id)
    if (r.active !== false) fam[fk].active++
  }
  const COMBOS = ['000', '100', '010', '001', '110', '101', '011', '111']
  const LBL = { '000': 'base', '100': 'lift', '010': 'ctrl', '001': 'reloc', '110': 'lift+ctrl', '101': 'reloc+lift', '011': 'reloc+ctrl', '111': 'all3' }
  console.log(`\n  families: ${Object.keys(fam).length}`)
  for (const [fk, v] of Object.entries(fam)) {
    const have = COMBOS.filter(c => v.rows[c])
    const miss = COMBOS.filter(c => !v.rows[c])
    console.log(`\n  [${fk}]  ${have.length}/8 combos  sku=${v.sku || 'NONE'}  group_id=${[...v.gid].join('/')}  cat=${[...v.cat].join('/')}  vendor=${[...v.vendor].join('/')}  active=${v.active}`)
    if (miss.length) console.log(`        MISSING: ${miss.map(c => LBL[c]).join(', ')}`)
    // labor per combo present
    console.log(`        prices: ${have.map(c => `${LBL[c]} $${v.rows[c].unit_price}/${v.rows[c].allotted_time_hours}h`).join('  ')}`)
  }

  // 4. sku readiness summary
  const withSku = Object.values(fam).filter(v => v.sku).length
  console.log(`\n=== ${withSku}/${Object.keys(fam).length} fixture families have an order code (vendor_sku) ===`)

  // emit id list per family for the backfill
  console.log('\n=== FAMILY -> row ids ===')
  for (const [fk, v] of Object.entries(fam)) {
    console.log(`  ${fk}: [${COMBOS.filter(c => v.rows[c]).map(c => v.rows[c].id).join(',')}]`)
  }
})()
