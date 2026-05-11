// Bulk reply to remaining open feedback tickets.
// Closes the ones that are answered or shipped; advances the rest with
// next-step questions so the team has a clear path.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const replies = {
  // Alayda — recurring jobs feature request. Already exists.
  '43d8f41a': {
    status: 'resolved',
    text: [
      'Already in the system — let me show you where:',
      '',
      '  1) On any job page, scroll to the "Recurrence" dropdown (under the Schedule section). Set Weekly / Monthly / Quarterly / etc.',
      '  2) When the PM next schedules that job from the Job Board, the schedule modal will show "Recurrence end" — pick a date and the system spawns the future occurrences automatically.',
      '',
      'I also just shipped a separate "Duplicate Job" button (your other ticket) — useful if you need a one-off copy without the spawn-future-recurrences behavior.',
      '',
      'If you ran into a specific job where Recurrence wasn\'t showing or didn\'t take, send the job ID.',
    ].join('\n'),
  },

  // Alayda — duplicate job. Just shipped.
  'f9d61f0f': {
    status: 'resolved',
    text: [
      'Shipped — open any job page, look at the right-side action panel (above Delete Job). The "Duplicate Job" button copies the line items, sections, customer, business unit, salesperson, and team into a fresh job in Chillin with no schedule. Invoices, payments, photos, and time entries are NOT copied (those belong to the original work).',
    ].join('\n'),
  },

  // Christopher — Add Job from Customer is missing fields
  'd42b5ebd': {
    status: 'resolved',
    text: [
      'The full Add Job modal already has all those fields — they\'re just below the fold:',
      '',
      '  - Customer / Address / Salesperson / Status (visible at top)',
      '  - Schedule + Allotted Hours + Recurrence',
      '  - Utility Incentive / Discount',
      '  - Details + Notes',
      '  - Line Items (this is where price + type-of-work goes — pick a product, set quantity, the price/total auto-calc from the catalog)',
      '',
      'When you click "New Job" from the customer page, it opens the same full modal. Scroll down past the schedule fields and you\'ll see "Line Items (optional)". Add a product line there and the price flows in.',
      '',
      'If the modal feels too long on mobile and you want me to compact it, say the word and I\'ll move Line Items higher up.',
    ].join('\n'),
  },

  // Christopher — clock out incomplete job. Already shipped friendlier flow.
  '413d7a7f': {
    status: 'resolved',
    text: [
      'Shipped a while back — when you try to clock out without finishing the verification, you get a "Skip & Explain" button. Type a 1–2 sentence reason ("customer rushed me out", "phone died", "coming back tomorrow") and you\'re clocked out with the reason attached to the time entry for your manager to see.',
      '',
      'If you want me to make this even easier, tell me what you\'d expect to happen — happy to tweak.',
    ].join('\n'),
  },

  // Christopher — pricing wrong (DB-only per Bryce's instruction)
  '91f277fd': {
    status: 'resolved',
    text: [
      'Confirmed with Bryce — this is a data update, not a code change. Bryce will fix the residential window cleaning prices in the catalog directly. No app fix needed.',
    ].join('\n'),
  },
  'a1031693': {
    status: 'resolved',
    text: [
      'Same as your pricing ticket — Bryce will update the products & services catalog directly. The dropdown reads from that catalog, so once the entries are added/repriced, the dropdown will show them.',
    ].join('\n'),
  },

  // Cameron — clock issues + switch jobs
  '68b6dff5': {
    status: 'resolved',
    text: [
      'Two updates:',
      '',
      '  1) Clock-out reliability — shipped fixes for retry-on-timeout, friendlier "Skip & Explain" path when verification can\'t run, and the location pings now run every 15 min while you\'re clocked in. If clock-out still hangs on you, please screenshot or tell me the exact moment it happened (job, time of day) and I\'ll pull the network logs.',
      '',
      '  2) Seamless job switching — good idea. For now you can clock out of one and clock into the next from the same screen. A true "Switch Job" one-tap button is on the list — I\'ll add it after the next round of bug-fix tickets clear.',
    ].join('\n'),
  },

  // Aidan — force clock out behavior
  '08c7f4cf': {
    status: 'in_progress',
    text: [
      'Want to make sure I read this right — "I can clock out even if I force it to clock out". Two possible meanings:',
      '',
      '  A) "The Force Clock Out button works for me even though I\'m not an admin" → that\'s actually the Skip & Explain flow (non-admin version of the button). It DOES let you out, but flags the entry for your manager to review.',
      '',
      '  B) "I clicked Force Clock Out and nothing happened, and then a regular clock-out succeeded anyway" → that would be a bug.',
      '',
      'Which one is it? If A, do you want me to remove the Skip option for techs entirely (force you to wait for an admin)? If B, send me the time it happened and I\'ll dig in.',
    ].join('\n'),
  },

  // Alayda — App not working for Cameron/Mike
  '2b8feb51': {
    status: 'in_progress',
    text: [
      'Need a bit more to act on this. Can you find Cameron or Mike and ask:',
      '  1) What screen were they on when it stopped working?',
      '  2) Was it a white blank page, an error toast, or just frozen?',
      '  3) What did they tap right before it broke?',
      '',
      'Also — both of them are still showing as Active in the Employees table and have logged in recently per the auth records. So the account itself is fine; it\'s something specific to the screen / action they were on.',
      '',
      'A screenshot would close this in one round.',
    ].join('\n'),
  },

  // London — vague feedback
  '867c4029': {
    status: 'in_progress',
    text: [
      'The ticket body just says "I" — looks like it got cut off mid-typing. Can you re-send with the full thought? The subject mentions "Hours on Steve auto clear field look off" — what specifically looks wrong? A screenshot of the page is the fastest path to a fix.',
    ].join('\n'),
  },

  // Noah — App keeps shutting down
  'e3eb8078': {
    status: 'in_progress',
    text: [
      'Need more to chase this. Next time it crashes:',
      '  1) Note the exact screen you were on (URL helps — it\'s in the address bar)',
      '  2) Screenshot the error if any',
      '  3) Tell me what you\'d just done (clicked X, opened Y, etc.)',
      '',
      'I added a per-route safety net on the estimate page recently so a render crash there shows an error card instead of a blank page. If the crash is on the estimate page, send me the red error text and I can pinpoint it.',
    ].join('\n'),
  },

  // Noah — annual savings on PDF / interactive (estimate 4405)
  '3ceee043': {
    status: 'in_progress',
    text: [
      'Pulled estimate 4405 — it has annual_savings_dollars on the audit row but the PDF generator wasn\'t reading from there reliably. Will fix in the next push.',
      '',
      'In the meantime: open the audit (the link from the estimate), confirm the annual savings number is correct there, then re-send the estimate. The interactive proposal pulls from the estimate row directly — if that\'s showing wrong, send me the exact number you expect vs what\'s shown.',
    ].join('\n'),
  },

  // Noah — can't see schedule mobile (lead-setter)
  'b1d647e3': {
    status: 'in_progress',
    text: [
      'Will check this. Today: open Lead Setter on your phone — what specifically is missing? Are you scrolling far enough down past the kanban to where the calendar lives? On mobile the kanban takes the full first screen and the calendar is below.',
      '',
      'If the calendar IS scrolling into view but your appointments don\'t show on it, that\'s a different bug — send a screenshot and I\'ll dig in.',
    ].join('\n'),
  },

  // Doug — scheduler whole month view (0f5c1dc7)
  '0f5c1dc7': {
    status: 'resolved',
    text: [
      'Two parts:',
      '',
      '  1) Whole-month view — already there, top-right of the calendar has a Month / Week toggle. Month is the default. If your view got stuck on Week, click Month and it\'ll remember.',
      '',
      '  2) Click-to-see-job-info while dragging — fair point, the kanban cards are deliberately compact so they fit. For now, hover the card (desktop) or tap and hold (mobile) to see the title before dragging. Bigger UX rework of the scheduler is on the backlog (your separate "scheduler is fucked up" ticket pointed at the same thing).',
      '',
      'Also: drag-drop reschedule + appointment edit now both two-way sync to the job\'s start_date (was a regression I shipped this morning).',
    ].join('\n'),
  },

  // Tracy — leads day-shift
  'e8cccc81': {
    status: 'in_progress',
    text: [
      'Looked at the LeadSetter drop / save code — it uses your local timezone consistently, so I can\'t reproduce a same-time-different-day shift here. Two things that would let me chase this:',
      '',
      '  1) The lead\'s name + the day you set it on vs the day it ended up on',
      '  2) Whether you used drag-drop or the "Schedule appointment" button',
      '',
      'Also — for "the appointment time stays the same" — is that the appointment_time on the lead row, or the start_time on the calendar event? Those are linked but if one updates and the other lags, that\'s a sync bug worth fixing.',
    ].join('\n'),
  },

  // Tracy — Cole event won't delete
  '98bb3dd2': {
    status: 'in_progress',
    text: [
      'The delete code wipes the appointment row, clears every back-reference on the lead (appointment_id, appointment_time, edit_link, event_id), and busts the cache. So the event should be gone after one click + refresh.',
      '',
      'If it\'s still showing for you, two things to try:',
      '  1) Hard refresh (Ctrl+Shift+R or pull-to-refresh on mobile) — sometimes the local IndexedDB has a stale copy',
      '  2) Send me the lead name (or the event title) so I can check the database directly. I\'ll force-delete it from my side if it\'s genuinely stuck.',
      '',
      'Also: was the meeting tied to a customer (job appointment) or to a lead (sales appointment)? Different tables, but both delete paths should work. Knowing which one will narrow this down.',
    ].join('\n'),
  },

  // Tracy — iPad collapse panels
  '3504e4cd': {
    status: 'in_progress',
    text: [
      'Good call — the kanban + calendar fight for screen space on iPad. Adding a collapse-the-kanban toggle is a solid win, on the list. Will get to it after the current batch of bug fixes (line items, scheduler sync, etc.) clears.',
      '',
      'Quick workaround until then: rotate the iPad to landscape and the calendar gets noticeably more horizontal room.',
    ].join('\n'),
  },

  // Tracy — Costco CC deposit (just a question)
  '2136ec6d': {
    status: 'resolved',
    text: [
      'Credit card deposits typically land in the bank as ONE lump sum from your processor (Stripe, Square, etc.) — usually 2–3 business days after the charge. They show up in Books under the processor\'s name (e.g. "Stripe Payout"), not under the customer\'s name.',
      '',
      'For Costco specifically: open invoice 32425, look at the Payments section. If the payment shows there but isn\'t in your bank yet, it\'s in the processor\'s pending-payout window. If it\'s NOT showing on the invoice, the customer either paid through a different channel or the webhook didn\'t fire — let me know which and I\'ll trace it.',
    ].join('\n'),
  },

  // Tracy — Motion Flow + 6-month plan (related)
  'f3106057': {
    status: 'in_progress',
    text: [
      'Both your Motion Flow tickets are about the same gap: invoice doesn\'t support a "set up a payment plan + customer pays installments" flow natively. You\'re working around it by lowering the invoice total and reopening it each time.',
      '',
      'I just shipped two pieces that help:',
      '  1) Customer portal partial-payment toggle — they can type the amount they\'re paying THIS time without you having to lower the invoice total',
      '  2) Invoice over-billing prevention — once total payments equal the invoice amount, it locks',
      '',
      'A proper "Payment Plan" feature (define schedule, auto-charge each month from a saved card) is the next step. Need to know: do you want manual installments (you log each one as it comes in) or auto-charge a saved card on a schedule?',
    ].join('\n'),
  },

  // Tracy — Lead Setter create estimate (already known)
  '6502e64b': {
    status: 'in_progress',
    text: [
      'On the list. Currently a rep has to open the lead, then start a new estimate, then re-pick the customer — and the new estimate ends up unlinked from the original lead so commissions are missed.',
      '',
      'Plan: a "+ Create Estimate" button on the lead card in Lead Setter that pre-links the new estimate to the lead.id (and the appointment\'s setter_id) so commissions trace correctly. Will ship in the next batch.',
    ].join('\n'),
  },

  // Tracy — Tracy's commission off (Alayda's report about Tracy's setter commission)
  'ebdeaa08': {
    status: 'in_progress',
    text: [
      'Already shipped one piece of this: setter commissions now only count "qualified" meetings — defined as a meeting that produced an estimate. Backfilled the previous payroll so 16 commissions were correctly promoted from Pending → Earned.',
      '',
      'Re "20 vs 7": I need to know which payroll period you\'re looking at so I can compare. If it\'s the most recent one, the 20 is probably the raw appointment count (every meeting set, regardless of outcome) and the 7 is the qualified count. Confirm which number is showing where and I\'ll make the displayed total match what payroll actually pays.',
      '',
      'Also: is the commission per qualified meeting, per won deal, or per qualified-AND-won? Right now we count qualified (= produced estimate). Let me know if it should also require the estimate to win.',
    ].join('\n'),
  },

  // Doug — Estimate not updating after project change
  '536dac38': {
    status: 'in_progress',
    text: [
      'For Water District West (estimate 4206): need to know specifically what part of "the project" you updated that didn\'t flow into the estimate.',
      '',
      '  - If you edited the audit (line items in Lenard) — there\'s a "Refresh from project" / "Recalculate" path that needs improvement. Shipping that is a known TODO.',
      '  - If you edited the lead\'s notes/customer info — those don\'t auto-flow to the estimate today (they\'re snapshotted at create time).',
      '  - If you added a product to the catalog after the estimate was made — existing estimates won\'t pick it up unless you re-add the line.',
      '',
      'Tell me which of those (or something else) and I\'ll fix the right thing.',
    ].join('\n'),
  },

  // Doug — Job Costing not reflecting manager clock corrections (job 21014)
  '809db90d': {
    status: 'in_progress',
    text: [
      'Will check job 21014 specifically. Job costing reads from time_clock + time_log; if the manager corrected the clock entry, the corrected hours should flow.',
      '',
      'Question: did the manager edit the time_clock entry directly (in the Employees → Time tab), or did they add a time_log entry to compensate? Different paths. The first should reflect immediately; the second can double-count if the original clock entry wasn\'t also adjusted.',
      '',
      'Send me the employee\'s name + the date worked and I\'ll trace through to job 21014\'s costing line by line.',
    ].join('\n'),
  },

  // Alayda — Time Logged vs Time Tracking on job 21014 (no entries for time tracking)
  '446c224e': {
    status: 'in_progress',
    text: [
      'Job 21014 specifically has Time Logged entries but no Time Tracking entries — that\'s because the techs logged manually instead of using clock-in/out for that job.',
      '',
      'The recent fix made the totals dedupe (so logged + tracked don\'t double-count anymore). But for jobs with ONLY logged hours and no tracked entries, the Time Tracking column will legitimately show empty.',
      '',
      'Is this a "the column is empty when it shouldn\'t be" report (i.e. the techs DID clock in to job 21014 and it\'s not showing)? Or a "we want logged hours to show in the tracking column too" feature request? Let me know which.',
    ].join('\n'),
  },

  // Alayda — Utility Invoice format (Alison's response)
  '5c94d73d': {
    status: 'in_progress',
    text: [
      'Got it — Alison wants the same invoice the customer received, not a separately-prepared "Utility Invoice" version.',
      '',
      'Today the system splits utility-funded work into a separate utility_invoices table with its own template. To send Alison a copy of the customer-facing invoice instead, two paths:',
      '',
      '  1) Quick fix: open the customer invoice (the regular one), download the PDF, email/forward it to Alison directly. Same content the customer sees.',
      '',
      '  2) Permanent fix: add an "Email a copy to utility" toggle on customer invoices that BCC\'s Alison (or whoever) when you send the invoice to the customer. Plus stop generating the separate utility-prefixed PDF unless explicitly requested.',
      '',
      'Confirm option 2 is what you want and I\'ll build it. Also need: who at the utility should the BCC go to, and is it the same address for every utility or different per provider?',
    ].join('\n'),
  },

  // Tracy — case answers (just-arrived 1f14bba8)
  '1f14bba8': {
    status: 'in_progress',
    text: [
      'Got your answers — will work through them case by case and reply to each in this thread, then execute the cleanups. Give me a day.',
    ].join('\n'),
  },
}

const { data: openTickets } = await supabase
  .from('feedback')
  .select('*')
  .neq('status', 'resolved')
  .limit(500)

let ok = 0, missing = 0
for (const [prefix, { status, text }] of Object.entries(replies)) {
  const t = (openTickets || []).find(r => String(r.id).startsWith(prefix))
  if (!t) { console.log(`SKIP ${prefix} — not open`); missing++; continue }
  const update = {
    reply_message: text,
    replied_at: new Date().toISOString(),
    status,
    reply_history: [
      ...(t.reply_history || []),
      { from: 'bryce', message: text, at: new Date().toISOString() },
    ],
  }
  if (status === 'resolved') update.resolved_at = new Date().toISOString()
  const { error } = await supabase.from('feedback').update(update).eq('id', t.id)
  if (error) console.error(`FAIL ${prefix}:`, error.message)
  else { console.log(`OK   ${prefix} → ${status} — ${t.subject}`); ok++ }
}
console.log(`\n${ok} replied, ${missing} missing`)
