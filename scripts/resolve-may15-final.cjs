require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const items = [
    { id: '98bb3dd2-4513-4e29-9378-cfaaff0905b6', note: 'Meeting delete: lead_commissions.appointment_id FK was blocking the delete. Migration relaxed it to ON DELETE SET NULL. Deleting a meeting now works on next refresh — the linked commission row will just have its appointment_id nulled out, preserving the commission record.' },
    { id: '536dac38-f4d9-4e18-98b7-83cbccd50a53', note: 'Estimate stale-layout: when the line items have been edited AFTER the proposal layout was generated, the Interactive Proposal card now shows a yellow "Layout is older than the latest estimate edits — Regenerate" warning. Click Regenerate to refresh the customer-facing proposal.' },
    { id: '867c4029-827e-4ecc-a21e-ba80631e7fb5', note: 'Closing — message was just "I" with no detail. Reopen with specifics if there\'s a real issue on FieldScout.' },
  ]
  for (const r of items) {
    const { error } = await s.from('feedback').update({ status: 'resolved' }).eq('id', r.id)
    if (error) console.error(r.id, error)
    else console.log(`✓ ${r.id.slice(0,8)} — ${r.note.slice(0,80)}`)
  }
})()
