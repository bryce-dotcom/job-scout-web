import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ids = [4143, 4898, 10440, 10442, 10443, 10454, 10455, 10461, 10468, 10473, 10500, 10501, 10502, 10503, 10507]
for (const id of ids) {
  const { data: synth } = await s.from('rep_commissions').select('*').eq('id', id).single()
  const { data: twins } = await s.from('rep_commissions').select('id, payment_id, basis_amount, amount, rate, payment_status, paid_payroll_run_id')
    .eq('invoice_id', synth.invoice_id).eq('employee_id', synth.employee_id).eq('kind', synth.kind).not('payment_id','is',null)
  const { data: inv } = await s.from('invoices').select('amount, discount_applied, customer_owes, payment_status').eq('id', synth.invoice_id).single()
  const { data: pays } = await s.from('payments').select('id, amount, date').eq('invoice_id', synth.invoice_id)
  const paidSum = (pays||[]).reduce((a,p)=>a+(parseFloat(p.amount)||0),0)
  console.log(`synth ${id} emp ${synth.employee_id} inv ${synth.invoice_id} basis ${synth.basis_amount} amt ${synth.amount} [${synth.payment_status}]`)
  console.log(`   invoice: amount ${inv.amount} customer_owes ${inv.customer_owes} | payments ${(pays||[]).length} totalling ${paidSum}`)
  console.log(`   payment-backed twin(s):`, JSON.stringify(twins))
}
