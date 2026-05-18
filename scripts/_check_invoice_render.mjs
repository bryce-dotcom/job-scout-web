// Verify the invoice + utility_invoice + invoice_lines state for HHH
// is shaped the way the new PDF rendering expects.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 1) Most-recent utility invoices for HHH
const { data: utils } = await s
  .from('utility_invoices')
  .select('id, job_id, invoice_id, linked_invoice_number, amount, project_cost, incentive_amount, customer_name, created_at')
  .eq('company_id', 3)
  .order('created_at', { ascending: false })
  .limit(5)
console.log('=== Recent utility invoices ===')
for (const u of utils || []) {
  const link = u.invoice_id ? `→ inv ${u.invoice_id} (#${u.linked_invoice_number})` : '(no link)'
  console.log(`  [${u.id}] ${u.customer_name?.slice(0,30).padEnd(30)} $${u.amount} ${link}`)
}

// 2) Most-recent customer invoices for HHH
const { data: invs } = await s
  .from('invoices')
  .select('id, invoice_id, job_id, amount, customer_id, created_at')
  .eq('company_id', 3)
  .order('created_at', { ascending: false })
  .limit(5)
console.log('\n=== Recent customer invoices ===')
for (const i of invs || []) {
  // Count line items for each
  const { count } = await s
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true })
    .eq('invoice_id', i.id)
  console.log(`  [${i.id}] ${i.invoice_id?.padEnd(20)} $${i.amount} · ${count ?? '?'} lines`)
}

// 3) Test the linked-invoice flow on a recent linked utility invoice if exists
const linked = (utils || []).find(u => u.invoice_id)
if (linked) {
  console.log(`\n=== Linked utility invoice ${linked.id} → invoice ${linked.invoice_id} ===`)
  const { data: invLines } = await s
    .from('invoice_lines')
    .select('id, description, quantity, line_total, in_utility_scope, sort_order')
    .eq('invoice_id', linked.invoice_id)
    .order('sort_order')
  console.log(`  ${invLines?.length || 0} invoice_lines:`)
  for (const l of invLines || []) {
    const scope = l.in_utility_scope === false ? '[OUT-OF-SCOPE]' : '[in-scope]'
    console.log(`    ${scope} ${l.description?.slice(0,40).padEnd(43)} qty=${l.quantity} $${l.line_total}`)
  }
} else {
  console.log('\n=== No linked utility invoice yet — none created via createBothInvoices ===')
  console.log('    All recent utility invoices are pre-Phase-5 (no invoice_id link)')
  console.log('    Will render via legacy fallback (material/labor split)')
}

// 4) Sanity: latest job_lines that have in_utility_scope=false
const { data: outScopeLines } = await s
  .from('job_lines')
  .select('id, job_id, description, in_utility_scope, total')
  .eq('company_id', 3)
  .eq('in_utility_scope', false)
  .order('id', { ascending: false })
  .limit(5)
console.log(`\n=== Out-of-scope job_lines (newest ${outScopeLines?.length || 0}) ===`)
for (const l of outScopeLines || []) {
  console.log(`  [${l.id}] job ${l.job_id} ${l.description?.slice(0,40)} $${l.total}`)
}

// 5) Sanity: latest invoice_lines that have in_utility_scope=false
const { data: outScopeInvLines } = await s
  .from('invoice_lines')
  .select('id, invoice_id, description, in_utility_scope, line_total')
  .eq('company_id', 3)
  .eq('in_utility_scope', false)
  .order('id', { ascending: false })
  .limit(5)
console.log(`\n=== Out-of-scope invoice_lines (newest ${outScopeInvLines?.length || 0}) ===`)
for (const l of outScopeInvLines || []) {
  console.log(`  [${l.id}] inv ${l.invoice_id} ${l.description?.slice(0,40)} $${l.line_total}`)
}
