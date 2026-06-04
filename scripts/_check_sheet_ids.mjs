import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const sampleIds = [6681, 6682, 5116, 5117, 5118, 5742, 5743, 6078, 6422, 6423, 6418, 6419, 6420]

const { data } = await sb.from('products_services')
  .select('id, name, company_id, type, product_category, active, unit_price, sku')
  .in('id', sampleIds)
console.log('matches found:', data?.length || 0)
for (const p of data || []) {
  console.log(`  ${p.id}  [co ${p.company_id}]  ${p.active ? 'A' : '-'}  ${p.type || p.product_category || '?'}  ${(p.name || '').slice(0, 80)}  $${p.unit_price}`)
}

// Also pull electrical bundle products from HHH to see what's there
console.log('\n=== current electrical bundle products (HHH, company 3, sample 10) ===')
const { data: elec } = await sb.from('products_services')
  .select('id, name, type, product_category, unit_price, active')
  .eq('company_id', 3)
  .or('type.ilike.%Electrical%,product_category.ilike.%Electrical%')
  .order('id', { ascending: false })
  .limit(10)
for (const p of elec || []) {
  console.log(`  ${p.id}  ${p.active ? 'A' : '-'}  ${p.type || p.product_category}  ${(p.name || '').slice(0, 80)}  $${p.unit_price}`)
}
