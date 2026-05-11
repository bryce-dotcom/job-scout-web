import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('=== q#4220 (bitter creek) ===')
const { data: q } = await sb.from('quotes')
  .select('id, estimate_name, status, quote_amount, customer_id, lead_id, salesperson_id, salesperson, sent_date, approved_date')
  .eq('id', 4220).single()
console.log(JSON.stringify(q, null, 2))

console.log('\n=== lead 3164 ===')
const { data: l } = await sb.from('leads')
  .select('id, customer_name, status, salesperson_id, salesperson, lead_owner_id, last_updated, quote_id')
  .eq('id', 3164).single()
console.log(JSON.stringify(l, null, 2))

console.log('\n=== ALL Noah-owned leads (including lead 3164?) ===')
const { data: noahLeads } = await sb.from('leads')
  .select('id, customer_name, status, salesperson_id, lead_owner_id')
  .eq('company_id', 3).or('salesperson_id.eq.34,lead_owner_id.eq.34')
console.log('count:', noahLeads.length)
console.log('lead 3164 present?', noahLeads.find(x => x.id === 3164) ? 'YES' : 'NO')

console.log('\n=== Same query as the front-end fetch (with quotes embedded)? ===')
// The pipeline page fetches leads. Let's see how it joins quotes — peek
// at the schema usually used:
const { data: leadJoin, error } = await sb.from('leads')
  .select('id, customer_name, status, salesperson_id, lead_owner_id, quotes(id, estimate_name, status, salesperson_id)')
  .eq('id', 3164).single()
console.log('lead 3164 with quotes:', JSON.stringify(leadJoin, null, 2))
console.log('err:', error?.message)
