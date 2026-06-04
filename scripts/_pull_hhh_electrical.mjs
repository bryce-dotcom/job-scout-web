import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Paginate through all products
let from = 0
const PAGE = 1000
const data = []
for (;;) {
  const { data: chunk, error } = await sb.from('products_services')
    .select('id, name, type, product_category, unit_price, allotted_time_hours, active, in_utility_scope')
    .eq('company_id', 3)
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); break }
  data.push(...(chunk || []))
  if (!chunk || chunk.length < PAGE) break
  from += PAGE
}
console.log('raw count:', data.length)
// Filter client-side
const filtered = (data || []).filter(p => {
  const t = (p.type || '').toLowerCase() + ' ' + (p.product_category || '').toLowerCase()
  return /electrical|bundle|highbay|panel|tube|strip|wall pack|exit|emergency/i.test(t)
})

console.log(`total HHH products: ${data?.length || 0}, electrical/bundle-like: ${filtered.length}`)
console.log(`active filtered: ${filtered.filter(p => p.active).length}`)
const byType = {}
for (const p of filtered) {
  const t = p.type || p.product_category || '(none)'
  byType[t] = (byType[t] || 0) + 1
}
console.log('by type:', byType)
console.log('\n=== full filtered list ===')
for (const p of filtered) {
  console.log(`${p.id}\t${p.active ? 'A' : '-'}\t${p.type || p.product_category}\t${p.name}\t$${p.unit_price}`)
}
