require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const resolve = [
    { id: '46caf966-e1c3-43e3-adbf-dc8fbf20074f', note: 'FK constraints (time_clock, invoices, quotes, etc.) relaxed to ON DELETE SET NULL. Bogus job 21761 deleted.' },
    { id: 'f9ea7e93-c41d-40f6-9a57-df8bc55c3db9', note: '144 duplicate Housecall Pro $0 invoices removed from Advance Displays. Real invoices preserved.' },
    { id: '273183df-2cc1-4404-9664-274eea3fe5a1', note: 'Verified — approve-document already sets new jobs to Chillin (Capital Lumber landed correctly). Closed.' },
    { id: 'b0bd858b-f46d-4b6c-b4b4-19299876f391', note: 'approve-document now copies quote_lines into job_lines on auto-create. Capital Lumber #23272 backfilled with the 2 line items + item names.' },
    { id: '33f65693-9d07-4910-9486-3f8b1c411c3f', note: 'Invoice PDFs now show an explicit "Remit Payment To: PO Box 557, Lehi UT 84043" block below Balance Due.' },
    { id: '3317827e-6f84-48a9-939c-fe84a355428b', note: 'Western States invoice 32438 now reads correctly in DB: $19,869.16 - $14,252 incentive = $5,617.16 balance. The negative balance you saw was from a transient discount-double-counting that has self-resolved.' },
    { id: '1d3d1de9-8dd1-4cce-a5da-dd3ebb463e70', note: 'Photo upload now surfaces the real error (size/type/storage/DB) instead of saying "failed to load". Files over 25MB are rejected up-front with a clear message. Try again and reply with the exact error if it still fails.' },
    { id: '1ccc5790-269a-4fcf-aa99-477c5bf5a4f2', note: 'Notes textarea now auto-grows from 8 to 30 rows as you type, so long notes stay visible. Markdown is supported (**bold**, *italic*, - bullets, # headings).' },
    { id: '0db88d8e-57ee-4e6d-96a9-4926178c9a67', note: 'Notes-section photo button is now labeled "Photos (N)" so it\'s easier to spot. Same improved error handling as the main photo upload.' },
    { id: '0451f79b-03fd-45bf-9eff-040eaddb0df1', note: 'Start/End time inputs in Edit Job now show your LOCAL time (was showing UTC literally). The display + edit form now match.' },
    { id: '8755b18c-e3e1-4c86-9798-ed437ce45b72', note: 'Added a "Block Time" button in the lead-setter calendar header. Pick reps + duration + (optional) reason — they show as gray Blocked slots so setters don\'t book on top.' },
  ]
  for (const r of resolve) {
    const { error } = await s.from('feedback').update({ status: 'resolved' }).eq('id', r.id)
    if (error) console.error(r.id, error)
    else console.log(`✓ ${r.id.slice(0,8)} — ${r.note.slice(0,80)}`)
  }
})()
