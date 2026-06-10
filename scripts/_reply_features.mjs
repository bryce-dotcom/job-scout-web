// Replies for the feature-request batch: 6 shipped, 6 acknowledged-deferred.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN ===\n')

const SHIPPED = [
  { id: 'b261b3f6-a5a6-4cab-8c4f-6afdf6caf666', text: // Bryce: order code
`Shipped. Open any product → Specs tab → there's now an "Order Code (vendor SKU)" field right under Manufacturer / Model Number. It also shows on the product detail view. Put the manufacturer's order code there and whoever places the order sees it without a lookup. (The MES products from the vendor swap already have their SKUs in the model_number field — you can copy those over or keep using model_number for those.)` },

  { id: 'e140e8a8-f71e-4955-9589-2b1b7f99ee73', text: // Damien: estimate filter
`Shipped. On the Estimates page there's now an "Only mine" toggle next to "Hide $0 drafts" — flips the list to just the estimates where you're the salesperson. Hard refresh to pick up the new version.` },

  { id: '5d8bd15a-3e5b-4326-8cf2-5d776b5d6a5e', text: // Damien: project search
`Shipped. Open the Projects list in Lenard (the folder icon) — there's now a search box at the top. Type a customer name, address, phone, or email and hit Enter (or tap Search). It searches ALL projects in the system, not just the recent 50, so those old projects you couldn't find will come up. Notes and audit data load when you tap the result, same as before.` },

  { id: '24caf472-a940-471f-9604-9b67d76315c7', text: // Noah: search in lenard
`Shipped — same as Damien's request. The Projects modal in Lenard now has a search box that hits the whole project history (name / address / phone / email), not just recents. Hit Enter or tap Search.` },

  { id: '5fbb9359-ef02-4ce2-bc39-c64c12905bb5', text: // London: switch jobs
`Shipped. When you're clocked into one job and open another job's card in Field Scout, there's now a blue "Switch to This Job" button. One tap: your time on the current job is saved (with a note showing the switch), and a new punch starts on the new job. No more clock-out → clock-in dance. GPS is captured on both ends so the punches stay audit-clean.` },

  { id: '4d30fe3f-b124-40f9-aab0-0c88371299fa', text: // Tracy: Damien as rep
`Done — actually it was already done. Damien's employee record (Damien Hargett, damien.hargett@gmail.com) has the Sales role and is active, which means he shows up in the rep picker on Lead Setter. If you're not seeing him in the list, hard refresh (Ctrl+Shift+R) — the employee list may have been cached from before he was added.` },

  { id: 'eb14afd2-c134-4019-abab-7ef128dfc7c7', text: // Tracy: auto receipt
`Shipped. Receipts now go out automatically in all three payment paths:
1. When YOU record a manual payment on an invoice (this already worked)
2. When you charge a saved card ("pushed through an automatic payment" — this was the gap)
3. When a customer pays via the Stripe payment link

The receipt email shows the amount, payment method, remaining balance (or PAID IN FULL), and a link to their portal. It goes to the email the invoice was sent to, falling back to the customer's email on file. No action needed from you — it just happens when the payment lands.` },
]

const DEFERRED = [
  { id: 'd21abb04-a6e5-4042-9f6c-0f13428bb7b6', text: // Tracy: shared notes
`Got it — this one's a real feature (shared lead-list with check-offs + AI reading a photo of a Google Maps list) and I want to build it properly rather than bolt something on. It's on the roadmap. In the meantime the Google Doc workflow you described is the right workaround. One question when you have a sec: is the core need (a) the shared visibility of who-set-what, or (b) the AI converting a photo/map link into lead rows? Knowing which half matters most changes what we build first.` },

  { id: 'cf8dc259-c32a-46af-9813-694572a9fc39', text: // Cole: sales dash
`On the roadmap. Before building it I need to pin down the funnel definitions so the numbers are trustworthy: (a) "meetings Tracy set" = appointments created by setter per rep, (b) "turned to take offs" = should that be audits created, or estimates created? (c) "closed" = estimate approved or job completed? (d) average job size = average of approved estimate totals or completed job totals? Reply with your picks and I'll build it to match how you actually run the meeting.` },

  { id: '7c7e401f-17e7-45a3-b666-74b6ff7325a9', text: // Christopher: one-spot
`You're right that recurring work has too many steps right now. This needs a proper design (it touches job creation, scheduling, and recurrence), so I'm not going to rush a half-fix. Two things shipped recently that may help in the meantime: job times no longer shift on re-open (timezone fix), and jobs created from the customer page keep their times. The full "one spot, one touch" recurring flow is on the roadmap — I'll loop you in when there's a design to react to.` },

  { id: 'd54271c2-c630-4c8b-96ce-8b9b0a3837e5', text: // Bryce: LVL10 editable
`Acknowledged — making the LVL 10 modules editable while the meeting is running is on the list, along with your Time Off module request. Both are EOS-page changes that I want to do together rather than piecemeal.` },

  { id: '8e2bdbd5-ab2e-44ff-9b36-fa8c69465b3b', text: // Bryce: time off module
`Acknowledged — bundling this with the "Make LVL 10 Editable" work so the EOS meeting page gets one coherent update instead of two half-changes.` },

  { id: '4984abe2-ce56-4cbd-b060-02664b99891e', text: // Cameron: work orders
`Good idea. Quick clarifying question so I build the right thing: when you say "see the work orders of jobs on the schedule" — do you mean (a) tapping a job on the Job Board calendar should show its work order / line items right there, or (b) you want a combined view where the schedule shows each job with its work order inline? And where are you usually looking when you hit this — the Job Board, the Field Scout page, or the calendar?` },
]

let posted = 0, failed = 0, notFound = 0
async function post(item) {
  const { data: current } = await sb.from('feedback').select('id, reply_history').eq('id', item.id).maybeSingle()
  if (!current) { notFound++; console.log('  ', item.id.slice(0, 8), '— NOT FOUND'); return }
  console.log('  ', item.id.slice(0, 8))
  if (APPLY) {
    const prior = Array.isArray(current.reply_history) ? current.reply_history : []
    const { error } = await sb.from('feedback').update({
      reply_message: item.text,
      replied_at: new Date().toISOString(),
      reply_history: [...prior, { at: new Date().toISOString(), from: 'bryce@hhh.services', text: item.text }],
      status: 'in_progress',
    }).eq('id', item.id)
    if (error) { failed++; console.log('     ERR:', error.message) }
    else posted++
  }
}

console.log('=== Shipped ===')
for (const f of SHIPPED) await post(f)
console.log('\n=== Deferred/ack ===')
for (const f of DEFERRED) await post(f)

console.log('\n========================================')
console.log(APPLY ? `Posted ${posted}, failed ${failed}, not-found ${notFound}` : `Dry run — would post ${SHIPPED.length + DEFERRED.length}`)
