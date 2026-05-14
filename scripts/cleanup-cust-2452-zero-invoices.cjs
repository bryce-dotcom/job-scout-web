require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
;(async () => {
  const { data: cust } = await s.from('customers').select('id,name,business_name,company_id').eq('id', 2452).single()
  console.log('Customer:'); console.log(JSON.stringify(cust, null, 2))

  const r = await s.from('invoices')
    .select('*')
    .eq('customer_id', 2452)
    .order('created_at', { ascending: false })
  if (r.error) { console.error(r.error); return }
  const invs = r.data || []
  console.log(`\n${invs.length} invoices on this customer:`)
  for (const i of invs) {
    console.log(`  #${i.id} ${i.invoice_id || ''}  amount=$${i.amount || 0}  status=${i.payment_status}  due=${(i.due_date||'').slice(0,10)}  job=${i.job_id || '-'}`)
  }

  // Safe-to-delete = Housecall Pro imports (INV-HCP-*) with $0 amount.
  // These were duplicate imports — Tracy confirmed no real job in 2+ months.
  // We explicitly do NOT touch any non-HCP invoice or any with amount > 0.
  const candidates = invs.filter(i =>
    typeof i.invoice_id === 'string' &&
    i.invoice_id.startsWith('INV-HCP-') &&
    (Number(i.amount) || 0) === 0
  )
  console.log(`\nZero-amount candidates: ${candidates.length}`)
  for (const i of candidates) console.log(`  → #${i.id} ${i.invoice_id || ''}`)

  if (!APPLY) { console.log('\n[DRY RUN] Pass --apply to actually delete.'); return }
  if (!candidates.length) { console.log('Nothing to delete.'); return }
  const ids = candidates.map(i => i.id)
  const { error } = await s.from('invoices').delete().in('id', ids)
  if (error) { console.error('Delete failed:', error); return }
  console.log(`\n✓ Deleted ${ids.length} zero-amount invoices on customer 2452.`)
})()
