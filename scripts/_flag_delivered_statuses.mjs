// Flag category='delivered' on HHH's terminal job statuses.
//
// Why: EOS "Jobs Completed" / "Job Revenue" / "Dollars per Hour" count jobs
// whose status has category='delivered' in the job_statuses setting. HHH's
// 13 statuses were ALL category-less, so those metrics read 0 every week
// (true numbers last week: 18 jobs / $31,507). jobMetrics.js now has a
// name-based fallback, but the explicit flags are still the right config —
// they also drive SalesPipeline's date-filter terminality, which is what
// Doug expected when he reported "Filter by Date pulling all projects".
//
// Delivered set for HHH (work is done; date filter applies):
//   Completed, Verified Complete, Post Inspection (Req), Paid, Closed
// Everything else stays open-pipeline (always visible regardless of filter).

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const HHH = 3
const DELIVERED = new Set(['Completed', 'Verified Complete', 'Post Inspection (Req)', 'Paid', 'Closed'])

const { data: row, error } = await sb.from('settings').select('id, value')
  .eq('company_id', HHH).eq('key', 'job_statuses').single()
if (error || !row) { console.error('job_statuses row not found:', error?.message); process.exit(1) }

const statuses = JSON.parse(row.value)
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN — pass --apply ===')
const updated = statuses.map(s => {
  const obj = typeof s === 'string' ? { name: s } : { ...s }
  const name = obj.name
  const newCat = DELIVERED.has(name) ? 'delivered' : (obj.category || 'open')
  console.log(' ', (name || '?').padEnd(24), obj.category || '(none)', '→', newCat)
  return { ...obj, category: newCat }
})

if (APPLY) {
  const { error: upErr } = await sb.from('settings')
    .update({ value: JSON.stringify(updated), updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (upErr) { console.error('UPDATE FAILED:', upErr.message); process.exit(1) }
  console.log('\nSaved. Verifying readback…')
  const { data: check } = await sb.from('settings').select('value').eq('id', row.id).single()
  const parsed = JSON.parse(check.value)
  const delivered = parsed.filter(s => s.category === 'delivered').map(s => s.name)
  console.log('Delivered statuses now:', delivered.join(', '))
} else {
  console.log('\nDry run only.')
}
