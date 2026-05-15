require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const items = [
    { id: '202e554d-527f-4a16-949a-dd121f9a6e31', note: 'Custom date range now persists across refreshes — was only the dropdown choice surviving before.' },
    { id: '6202dbcb-ae2d-46bb-b198-94eca11167de', note: 'EOS to-do owners are now multi-select chips on both the standalone form and the IDS Solve panel. Stored as owner_ids array (with the first id mirrored to owner_id for legacy display).' },
    { id: '9e710e2d-2070-4d98-ba09-cb231a739521', note: 'Archived 3,534 pre-2023 jobs on HHH (skipped 74 with unpaid invoices). Used Archive instead of hard delete so historical references still resolve.' },
    { id: 'ebdeaa08-b5ba-42ba-8815-e7938af93104', note: 'Payroll Lead Commissions card now shows "<N> qualified meetings" (green) AND "<N> pending (no estimate yet)" (amber) when setter rule = quote_created. Hover tooltips explain the difference. The earned count is what gets paid; pending moves to qualified when an estimate is created on the lead.' },
    { id: '3ceee043-31b9-4817-99de-196958a7667b', note: 'Estimate PDF now renders "Estimated Annual Energy Savings: $X/yr" + payback under the totals block. Pulls from manual_annual_savings override, falling back to the linked audit\'s annual_savings_dollars. Audit data is now fetched at PDF-generate time so audit-backed proposals always include the savings line.' },
    { id: '809db90d-8380-469c-84f0-893fcab95f54', note: 'Job costing now reads from time_clock (which already reflects manager adjustments) instead of the empty legacy time_log. Job 21014: time_tracked = 42.19h (after corrections), originals (144.45h, 142.65h app errors) properly discarded.' },
    { id: '446c224e-b134-4639-8d9a-28b54e953439', note: 'Time logged + Time tracking now agree — both sourced from time_clock. The legacy time_log table was 43 rows total company-wide; all real punches are in time_clock and that\'s what the bonus card and the time list now read.' },
    { id: '6502e64b-34bb-4dab-b534-06cdb7e8f2bd', note: 'Estimates create form: lead picker upgraded to a searchable list (Appointment Set leads first, with service type + appointment date in the label). New-Lead form auto-matches by phone digits or name substring and shows a "Use existing lead" button so reps don\'t create duplicates that orphan setter commission.' },
    { id: 'fab00a12-30c8-4baf-866a-1546e57a29f2', note: 'Verified Stripe sync runs cleanly for HHH (9 payouts imported, $845.37 pending). Stripe deposits leaving Stripe show as negative-amount "Stripe Payout" rows. To see the matching incoming deposit into your bank, you need the *checking* account connected via Plaid — currently only the Rewards Visa + Primary Savings are linked. Add the checking account in Settings → Plaid and the deposits will appear.' },
  ]
  for (const r of items) {
    const { error } = await s.from('feedback').update({ status: 'resolved' }).eq('id', r.id)
    if (error) console.error(r.id, error)
    else console.log(`✓ ${r.id.slice(0,8)} — ${r.note.slice(0,80)}`)
  }
})()
