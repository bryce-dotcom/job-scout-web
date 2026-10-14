import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

// 1. the duplicate synthetic rows, unpaid ones only
const DUPES = [10440, 10442, 10443, 10454, 10455, 10461, 10468, 10473, 10500, 10501, 10502, 10503, 10507]
const { data: toDelete } = await s.from('rep_commissions')
  .select('id, employee_id, invoice_id, amount, payment_status, payment_id').in('id', DUPES)
console.log('— duplicates to remove —')
let sum = 0
for (const r of toDelete || []) {
  const bad = r.payment_status === 'paid' || r.payment_id != null
  sum += parseFloat(r.amount) || 0
  console.log(`  ${r.id} emp ${r.employee_id} inv ${r.invoice_id} $${r.amount} ${r.payment_status}${bad ? '  <-- REFUSING' : ''}`)
  if (bad) process.exit(1)
}
console.log(`  ${toDelete.length} rows, $${sum.toFixed(2)}`)

// 2. Christopher's two September commissions at the rate he earned them
const RERATE = [
  { id: 10425, label: 'Juan Diego 1 Sep' },
  { id: 10417, label: 'Power Wash 17 Sep' },
]
console.log('\n— re-rate to 6% (earned before the 5% arrangement) —')
const updates = []
for (const t of RERATE) {
  const { data: r } = await s.from('rep_commissions').select('*').eq('id', t.id).single()
  if (r.payment_status === 'paid') { console.log(`  ${t.id} already paid — REFUSING`); process.exit(1) }
  const amount = Math.round(r.basis_amount * 6) / 100
  console.log(`  ${t.id} ${t.label}: basis $${r.basis_amount}  ${r.rate}% $${r.amount}  ->  6% $${amount.toFixed(2)}`)
  updates.push({ id: t.id, amount })
}

if (!APPLY) { console.log('\nDRY RUN — pass --apply to write'); process.exit(0) }

const del = await s.from('rep_commissions').delete().in('id', DUPES).select('id')
console.log('\ndeleted:', del.error ? del.error.message : del.data.length)
for (const u of updates) {
  const { error } = await s.from('rep_commissions').update({ rate: 6, amount: u.amount }).eq('id', u.id)
  console.log(`updated ${u.id}:`, error ? error.message : `6% $${u.amount.toFixed(2)}`)
}
