require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const items = [
    { id: 'd338f6c4-e0b5-4581-bee8-7938d27c1c98', note: 'Bonus + time tracking module: JobDetail + MyPay now read from time_clock (not the empty legacy time_log table). Western States now shows 42.19h. jobs.time_tracked backfilled across 39 jobs.' },
    { id: '4eb22873-9f13-4c0d-9ce9-b111a51d840b', note: 'Lenard transition: the (existW - newW) × costPerWatt formula went NEGATIVE when audits had existW=0, corrupting line items on every project. Fixed in lenard-save edge fn to use productPrice × scale. Backfilled 4 affected quotes (#2720, #4412, #4418, #4420) — all match their quote_amount exactly now.' },
    { id: 'fc3eaf35-a9dd-4fe9-9e66-d51a54017618', note: 'Customer page Jobs tab now shows the dollar total + completed date on each row so you can spot the price without drilling in.' },
    { id: 'b25c10b8-c5fe-4547-9d0b-0fa6b09c8566', note: 'PKCE/Google sign-in: when the verifier is missing (cross-browser or PWA-vs-tab flow), we now wipe any half-baked auth state and show a "Try again" button instead of dumping the raw error. Best to start the Google flow in the same browser/PWA you ended up in.' },
    { id: '3d45761a-7f97-47bf-b361-07948f1c6ee7', note: 'Job page now shows: customer name (with secondary contact name), tappable phone, tappable email. Customer JOIN extended to pull secondary_contact_* fields.' },
    { id: '988c8356-e3e7-4868-a465-3c5626a98603', note: 'Lenard summary card now shows a yellow warning when existing wattage is 0 across all fixtures — that\'s the input gap that produces 20+ year paybacks. Fill in each fixture\'s existing wattage and the math will compute correctly.' },
    { id: 'e0179d34-cc4a-494b-a336-d9e6da60297c', note: 'When Tracy schedules a meeting for a rep, the lead\'s lead_owner_id now auto-transfers to that rep. The rep\'s "My Projects" picker in Lenard will show the appointment-set lead, so they can save the proposal into the SAME lead instead of creating a new one and orphaning your setter commission.' },
    { id: '5a6f4bb0-9f63-4577-9c70-39381d157ba4', note: 'Saved cards now sync: (1) when a customer saves a new card via the payment portal, the stripe-webhook setup_intent.succeeded handler writes it into customer_payment_methods so it shows on the invoice in JobScout. (2) ran a one-shot backfill that synced 8 cards across HHH customers. (3) for the specific invoice 32432 — there are 0 recorded payments yet; if the Stripe portal payment did succeed, send the Stripe charge id and we\'ll manually record the payment.' },
  ]
  for (const r of items) {
    const { error } = await s.from('feedback').update({ status: 'resolved' }).eq('id', r.id)
    if (error) console.error(r.id, error)
    else console.log(`✓ ${r.id.slice(0,8)} — ${r.note.slice(0,80)}`)
  }
})()
