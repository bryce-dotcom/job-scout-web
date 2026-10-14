import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// every rep_commission, paged past the 1000-row cap
const all = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await s.from('rep_commissions')
    .select('id, company_id, employee_id, invoice_id, payment_id, utility_invoice_id, kind, amount, payment_status, source, earned_at')
    .order('id').range(from, from + 999)
  if (error) { console.log('err', error.message); break }
  all.push(...data)
  if (data.length < 1000) break
}
console.log('rep_commissions rows:', all.length)

// a synthetic row (no payment) sitting beside a payment-backed row for the
// same invoice + employee + kind = the same money twice
const payBacked = new Set()
for (const r of all) if (r.payment_id != null && r.invoice_id != null) payBacked.add(`${r.invoice_id}:${r.employee_id}:${r.kind}`)
const dupes = all.filter(r => r.payment_id == null && r.utility_invoice_id == null && r.invoice_id != null
  && payBacked.has(`${r.invoice_id}:${r.employee_id}:${r.kind}`))
console.log('\nsynthetic rows duplicating a paid-backed row:', dupes.length)
let sum = 0
for (const d of dupes) {
  sum += parseFloat(d.amount) || 0
  console.log(`  id ${d.id} co ${d.company_id} emp ${d.employee_id} inv ${d.invoice_id} $${d.amount} ${d.payment_status} (${d.source})`)
}
console.log('overstated by: $' + sum.toFixed(2))
const paidDupes = dupes.filter(d => d.payment_status === 'paid')
console.log('of which ALREADY PAID OUT:', paidDupes.length, '$' + paidDupes.reduce((a,b)=>a+(parseFloat(b.amount)||0),0).toFixed(2))
