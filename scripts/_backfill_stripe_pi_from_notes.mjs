// Backfill stripe_payment_intent_id on payment rows where the PI is
// already sitting in the notes field but the column was left NULL.
//
// Background: pre-June-1 deployments of charge-saved-card wrote
//   notes = `Charged visa ****3977 (pi_3Tbj…)`
// but didn't populate the stripe_payment_intent_id column. The post-fix
// version writes both. This script extracts the pi_xxx token from notes
// and back-fills the column so:
//   (a) the stripe-webhook idempotency check sees the row and doesn't
//       record a duplicate when the same PI's payment_intent.succeeded
//       webhook fires
//   (b) the Books reconciliation view can match the row to a Stripe
//       transaction by PI

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN — pass --apply ===\n')

const { data: orphans } = await sb.from('payments')
  .select('id, invoice_id, amount, notes, date')
  .is('stripe_payment_intent_id', null)
  .ilike('notes', '%pi_%')
  .limit(1000)

console.log('Candidates:', orphans?.length || 0)

const updates = []
for (const p of orphans || []) {
  const m = String(p.notes).match(/pi_[A-Za-z0-9]+/)
  if (m) updates.push({ id: p.id, invoice_id: p.invoice_id, amount: p.amount, date: p.date, pi: m[0] })
}
console.log('Extractable:', updates.length)
for (const u of updates.slice(0, 10)) {
  console.log(' ', u.id, '|', u.date, '| $' + u.amount, '| inv:', u.invoice_id, '| pi:', u.pi)
}

if (!APPLY) {
  console.log('\nDRY RUN — pass --apply to write')
  process.exit(0)
}

let ok = 0, fail = 0, dup = 0
for (const u of updates) {
  // Check if another row already has this PI (paranoia — shouldn't happen)
  const { data: existing } = await sb.from('payments')
    .select('id').eq('stripe_payment_intent_id', u.pi).maybeSingle()
  if (existing && existing.id !== u.id) { dup++; continue }
  const { error } = await sb.from('payments').update({ stripe_payment_intent_id: u.pi }).eq('id', u.id)
  if (error) fail++; else ok++
}
console.log('\nBackfilled:', ok, '| duplicates skipped:', dup, '| failed:', fail)
