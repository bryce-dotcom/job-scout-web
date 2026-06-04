require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const replies = [
  // ── Tracy: Pipeline auto-Invoicing (two complaints, same root) ──
  {
    id: 'f458aa12-e9a3-43ac-ab7d-d682d350bd91',
    status: 'resolved',
    reply: `Fixed — pipeline cards no longer jump to Invoiced the moment the invoice is created.

The bug: createCustomerInvoice was setting lead.status = 'Invoiced' as soon as the invoice was generated, so the lead card moved to Invoiced before you ever clicked Send.

The fix: the lead status now updates inside the actual Send flow (when the email goes out), not on Create. Doug can mark a job Completed, you generate the invoice (card stays in Completed), then click Send — and only then does the card move to Invoiced. JOB-MP2ZU0VY-style cases should behave correctly going forward.`
  },
  {
    id: '4b705c25-df1f-4dd1-89f9-3cf2220bff30',
    status: 'resolved',
    reply: `Same fix as the other "Pipeline" feedback — see that thread for details. Net effect: when Doug moves a job to Completed on the Job Board, it stays in your Completed column until you actually Send the invoice. No more auto-jump to Invoiced on Create.`
  },
  // ── Tracy: Pipeline only-shows-me ──
  {
    id: '9671745f-fe79-486c-8e37-23ec371c3e33',
    status: 'resolved',
    reply: `Improved — the Owner filter on the pipeline now lights up green when it's NOT on "All Owners," and a "↺ Show All" button appears right next to it so you can reset in one click.

So if you ever see only your own deals again, look at the Owner dropdown: green = filtered to a person, white = showing everyone. The default on every page load is "All Owners" — but if you accidentally select your name, the green tag and reset button will make it obvious.

Let me know if you'd also like the filter to remember "All Owners" between sessions (right now it's the default but resets on reload).`
  },
  // ── Tracy: Move payment ──
  {
    id: 'b338a95b-cd62-45c0-b419-e2a9d3b1860d',
    status: 'resolved',
    reply: `Fixed — you can now move a payment from one invoice to another without deleting it.

On any payment row on the invoice page, there's a new "↔ Move" button. Click it, pick the destination invoice (other open invoices for the same customer), and hit Move Payment. The amount, date, method, check #, Stripe reference, and any other metadata all stay intact — just the invoice link changes. Both invoices' Paid totals + payment_status recalculate automatically.

For the Fieldstone Canyon → Fieldstone Willow case: open Fieldstone Canyon, find the payment row, click Move, pick the Willow invoice, done.`
  },
  // ── Tracy: Invoice summary negative balance ──
  {
    id: 'eedff532-718e-4caa-a027-e216c81e1af1',
    status: 'resolved',
    reply: `Fixed — the Invoice Summary header will no longer show a negative Balance Due.

The PDF was already correct (clamped to $0 if balance went negative). The on-screen header was showing the raw negative number. Now if an invoice is overpaid, the header shows "Overpaid by $X" in purple instead — so you can still SEE the overpayment, but it's labeled correctly instead of looking like a wrong Balance Due.

If Balance Due hits zero exactly, you'll see "$0.00" in green. Positive balance = amber. Overpaid = purple with the "Overpaid by" label.`
  },
  // ── Tracy: Lead not found ──
  {
    id: 'd73130d8-e63d-4eb5-b57b-af9e10e6ce8e',
    status: 'resolved',
    reply: `Fixed — temp leads (those with URLs like /leads/temp_xxx) will now resolve.

The bug: the lead-detail page was looking up by numeric ID. Temp leads have string IDs, so the lookup errored out and you saw a blank page. Now if the URL has a non-numeric ID, the page falls back to looking up by unique_temp + lead_id, so your temp leads come back correctly.

If you have a saved URL for a specific temp lead that still doesn't load, paste it in a reply and I'll check whether that one was actually deleted vs. just unreachable.`
  },
  // ── Bryce: Bonus module ──
  {
    id: '64eac077-6f93-4dae-997f-1a9260d9dd7c',
    status: 'resolved',
    reply: `Fixed — Bonus module wasn't showing on /jobs/21014 because the status check only allowed In Progress / Complete / Completed. Job 21014 was at "Verified Complete" (post-Victor terminal state). Now the bonus card shows for In Progress, Complete, Completed, Verified, AND Verified Complete — exactly when crews need to see their bonus split.

Reload /jobs/21014 and the Bonus Hours card should be back.`
  },
  // ── Bryce: Utility invoice 66 numbers ──
  {
    id: 'b1c2d39d-c31b-4dea-8e13-2f5408b56f6f',
    status: 'resolved',
    reply: `Fixed both the bug and the bad data.

The bug: createUtilityInvoice initialized project_cost = 0 and only filled it from a lighting audit. Jobs without an audit (or audits without est_project_cost) landed with $0 in both project_cost AND net_cost. Now if there's a linked customer invoice, the utility invoice pulls projectCost from that invoice's amount (plus any paid deposit on a parent invoice), then computes net_cost = projectCost - incentive.

The data fix: utility invoice 71 on JOB-MNQHM69Z (175 W Warehouse / Kimball Investment) had project_cost=$0 and net_cost=$0. Patched to:
  project_cost: $252,052.28 ($217,052.28 customer invoice + $35,000 deposit)
  net_cost: $89,263.14 ($252,052.28 - $162,789.14 incentive)

Open utility invoice 71 and the numbers should now show correctly.`
  },
  // ── Bryce: Lightbulb error (probably already fixed) ──
  {
    id: 'e86068d8-bec4-46e7-baf2-80840abc492b',
    status: 'resolved',
    reply: `Spot-checked the Products page code: the Lightbulb icon IS being imported correctly and used on the page. The error you saw on May 18 looks like it was fixed by an interim commit since then.

Try Add Product again now. If you still see "lightbulb is not defined," reply with the EXACT error text from the browser console (right-click → Inspect → Console tab) and I'll trace it.`
  },
  // ── Bryce: EOS numbers (need specifics) ──
  {
    id: '547090ec-49f8-483f-9a29-28e52c88d889',
    status: 'in_progress',
    reply: `Need more info to fix this safely — EOS has 30+ different metric formulas, and I'd risk breaking working ones by guessing.

Could you reply with:
1. Which specific metric is wrong? (e.g. "Cash Collected MTD", "Job Revenue YTD", "Total Man Hours")
2. What number does it show vs. what should it be?
3. The date range you have selected when you see the wrong number

A screenshot of the EOS scorecard with the wrong row circled would be perfect. Once I know exactly which formula to fix, it's a quick change.`
  },
]

;(async () => {
  for (const r of replies) {
    const update = {
      status: r.status,
      reply_message: r.reply,
      replied_at: new Date().toISOString(),
    }
    if (r.status === 'resolved') update.resolved_at = new Date().toISOString()
    const { error } = await s.from('feedback').update(update).eq('id', r.id)
    if (error) console.log('ERR', r.id, error.message)
    else console.log('Replied', r.id, '→', r.status)
  }
})()
