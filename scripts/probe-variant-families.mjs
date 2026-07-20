// Discovery: what product families exist across the whole catalog, and how do
// their names encode variants? Read-only — designs the general parser.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Strip the tokens that vary WITHIN a family, to find the family's base name.
const baseKey = (name) => String(name || '')
  .replace(/(\d+\s*\/\s*)+\d+\s*w\b/gi, ' ')          // wattage lists: 50/60/70W
  .replace(/\bw?\d{2,4}\s*\/\s*\d{2,4}\s*\/\s*\d{2,4}w?\b/gi, ' ') // 290W/320W/350W
  .replace(/\b\d+(\.\d+)?\s?w(att)?s?\b/gi, ' ')      // single wattage 150W
  .replace(/\b\d+\s?-\s?\d+\s?v\b/gi, ' ')            // volt range
  .replace(/\b\d+\s?v(olt)?s?\b/gi, ' ')             // volts
  .replace(/\b\d{2}k\b/gi, ' ')                        // kelvin 50K
  .replace(/\b\d{4}k\b/gi, ' ')                        // kelvin 5000K
  .replace(/\b(lift|controls?|photocell|photo\s?cell|relocat\w*|sensor)\b/gi, ' ')
  .replace(/\bw\/\s*/gi, ' ')
  .replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

const pageAll = async (t, sel, f) => { const o = []; for (let i = 0; ; i += 1000) { let q = s.from(t).select(sel).range(i, i + 999); if (f) q = f(q); const { data, error } = await q; if (error) { console.error('FAIL', error.message); return o } o.push(...(data || [])); if (!data || data.length < 1000) break } return o }

;(async () => {
  const p = await pageAll('products_services', 'id,name,type,group_id,product_category,unit_price,vendor_sku,variant_group_id,active', q => q.eq('company_id', 3))
  const active = p.filter(x => x.active !== false)
  console.log(`active products: ${active.length}`)

  const fam = new Map()
  for (const x of active) {
    const bk = baseKey(x.name)
    if (bk.length < 3) continue
    const key = `${x.group_id}::${bk}`
    if (!fam.has(key)) fam.set(key, [])
    fam.get(key).push(x)
  }
  const multi = [...fam.entries()].filter(([, arr]) => arr.length >= 3).sort((a, b) => b[1].length - a[1].length)
  const singles = active.length - multi.reduce((n, [, a]) => n + a.length, 0)
  console.log(`families (>=3 members): ${multi.length}  |  covering ${active.length - singles} products  |  ${singles} left standalone\n`)

  for (const [key, arr] of multi) {
    const [gid, bk] = key.split('::')
    const skus = arr.filter(r => r.vendor_sku).length
    const alreadyGrouped = arr.filter(r => r.variant_group_id).length
    console.log(`\n[${arr.length}] "${bk}"  (group_id=${gid}, cat=${arr[0].product_category || '-'}, ${skus}/${arr.length} have codes${alreadyGrouped ? `, ${alreadyGrouped} already grouped` : ''})`)
    for (const r of arr.slice(0, 10)) console.log(`     #${r.id}  $${r.unit_price}  ${r.name}`)
    if (arr.length > 10) console.log(`     ...+${arr.length - 10} more`)
  }
})()
