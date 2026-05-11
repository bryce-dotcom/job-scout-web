import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('=== Invoice 30278 (Motion Flow) — current state ===')
const { data: inv } = await sb.from('invoices').select('*').eq('id', 30278).single()
const interesting = ['id','invoice_id','customer_id','job_id','amount','original_amount','discount_applied','payment_status','created_at','updated_at','due_date','notes','description','sent_at','last_sent_at','portal_token']
interesting.forEach(k => { if (inv[k] != null) console.log(`  ${k}: ${typeof inv[k] === 'object' ? JSON.stringify(inv[k]) : inv[k]}`) })

console.log('\n=== Payments on invoice 30278 ===')
const { data: pays } = await sb.from('payments').select('id, payment_id, amount, status, date, method, notes, is_deposit, created_at').eq('invoice_id', 30278).order('created_at')
pays?.forEach(p => console.log(`  id=${p.id} payment_id=${p.payment_id||'-'} $${p.amount} ${p.method} ${p.date} status=${p.status} created=${p.created_at?.slice(0,10)} notes=${(p.notes||'').slice(0,80)}`))

console.log('\n=== ALL invoices for this customer (3411) — looking for sister invoices Tracy may have created ===')
const { data: allInv } = await sb.from('invoices').select('id, invoice_id, amount, payment_status, created_at, updated_at, job_id, notes, description').eq('customer_id', 3411).order('created_at', { ascending: false }).limit(15)
allInv?.forEach(i => console.log(`  inv#${i.id} '${i.invoice_id}' $${i.amount} ${i.payment_status} created=${i.created_at?.slice(0,10)} updated=${i.updated_at?.slice(0,10)} job=${i.job_id||'-'}`))

console.log('\n=== ALL payments for this customer (via invoice) — full payment trail ===')
const invIds = allInv.map(i => i.id)
const { data: allPays } = await sb.from('payments').select('id, invoice_id, amount, method, date, status, notes, created_at').in('invoice_id', invIds).order('created_at')
let runTotal = 0
allPays?.forEach(p => {
  runTotal += parseFloat(p.amount) || 0
  console.log(`  ${p.created_at?.slice(0,10)} inv#${p.invoice_id} $${p.amount} ${p.method} ${p.status}  running=$${runTotal.toFixed(2)}`)
})
console.log(`  TOTAL collected from MFCP: $${runTotal.toFixed(2)}`)

console.log('\n=== Job linked to invoice 30278 ===')
if (inv.job_id) {
  const { data: job } = await sb.from('jobs').select('id, job_id, job_title, job_total, status, created_at').eq('id', inv.job_id).maybeSingle()
  console.log(' ', job)
}
