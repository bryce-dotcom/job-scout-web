// Find the most recent completed onboarding packet for HHH and check
// its signed_documents — do they have pdf_storage_path stamped? If not,
// invoke render-onboarding-pdfs directly and dump the response so we
// can see what failed.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const s = createClient(URL, KEY)

const { data: packets } = await s
  .from('employee_onboarding_packets')
  .select('id, employee_id, status, completed_at')
  .eq('company_id', 3)
  .order('created_at', { ascending: false })
  .limit(5)
console.log('Recent packets (HHH):')
for (const p of packets || []) {
  console.log(`  [${p.id}] emp=${p.employee_id} status=${p.status} completed=${p.completed_at}`)
}

const lastDone = (packets || []).find(p => p.status === 'completed')
if (!lastDone) { console.log('No completed packets to inspect.'); process.exit(0) }

console.log(`\nInspecting packet ${lastDone.id}...`)
const { data: docs } = await s
  .from('signed_documents')
  .select('id, document_kind, document_label, pdf_storage_path, signed_at')
  .eq('onboarding_packet_id', lastDone.id)
console.log('Signed docs:')
for (const d of docs || []) {
  console.log(`  [${d.id}] ${d.document_kind} pdf=${d.pdf_storage_path || '(none)'}`)
}

console.log('\nInvoking render-onboarding-pdfs directly...')
const res = await fetch(`${URL}/functions/v1/render-onboarding-pdfs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, apikey: KEY },
  body: JSON.stringify({ packet_id: lastDone.id }),
})
console.log(`http=${res.status}`)
const body = await res.json().catch(() => null)
console.log('body:', JSON.stringify(body, null, 2))

// Re-pull docs
const { data: docs2 } = await s
  .from('signed_documents')
  .select('id, document_kind, pdf_storage_path')
  .eq('onboarding_packet_id', lastDone.id)
console.log('\nAfter render, signed_documents:')
for (const d of docs2 || []) {
  console.log(`  [${d.id}] ${d.document_kind} pdf=${d.pdf_storage_path || '(none)'}`)
}
