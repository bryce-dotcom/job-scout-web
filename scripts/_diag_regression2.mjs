import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: comps } = await supabase.from('companies').select('id, company_name').order('id')
console.log('=== ALL companies ===')
for (const c of comps || []) console.log(`  ${c.id} ${c.company_name}`)

// Find HHH employees
const { data: emps } = await supabase
  .from('employees')
  .select('id, name, email, company_id, active')
  .or('email.ilike.%hhh.services%,email.ilike.%@hhh%')
  .limit(50)
console.log('\n=== HHH-emailed employees ===')
const cIds = new Set()
for (const e of emps || []) {
  console.log(`  ${e.id} co=${e.company_id} active=${e.active} ${e.email} ${e.name}`)
  cIds.add(e.company_id)
}
console.log(`  distinct company_ids: ${[...cIds].join(',')}`)

// Pick the dominant company id
const hhhCo = [...cIds][0]
console.log(`\nUsing HHH co=${hhhCo}`)
