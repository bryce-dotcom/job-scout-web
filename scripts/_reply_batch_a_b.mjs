// Post replies to feedback items that were fixed in Batch A + B.
// Updates reply_message + replied_at; keeps status 'in_progress' so the
// user can confirm + close themselves.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN — pass --apply ===\n')

// Real feedback UUIDs from ./scripts/_feedback_ids.txt
const FIXED = [
  {
    id: '36786deb-495f-4ef1-a3a3-977983b25435', // Tracy: contact info save fails
    reply: `Shipped — was a one-line bug in the save handler that wasn't converting the empty "preferred_invoice_format" dropdown to NULL before saving. The DB check constraint required NULL or 'itemized' or 'summary', and we were sending ''.

You should be able to save customer info again on Luke Weisman (and any other customer). Hard refresh once (Ctrl+Shift+R) to clear the cached version. Let me know if it fails again.`,
  },
  {
    id: '2fef03ae-c1db-4cf0-a1d8-865c735008da', // Tracy: customer account info
    reply: `Same root cause as your other ticket — fixed. The 'preferred_invoice_format' empty-string was failing the DB constraint. Customer 1841 (and all others) should save normally now. Hard refresh once to be sure.`,
  },
  {
    id: 'dcba8ea3-50bf-49e8-8597-1ef3b8463a7c', // Christopher: can't edit client info
    reply: `Fixed. Same bug Tracy reported 3 times — the customer save handler wasn't nulling out the "preferred_invoice_format" empty dropdown before sending to the DB, and a constraint was rejecting it. Customer 3256 (and all of them) saves now. Hard refresh.`,
  },
  {
    id: 'c1f5109e-95e1-47c0-875f-3da946595f37', // Tracy: blocking time 2h
    reply: `Fixed. The "Block Out Time" modal already had All-day (8h) but the Appointment + Quick-create dropdowns capped at 2h — that's why you saw 8h existed somewhere but couldn't pick it. Added 3h / 4h / 8h to both Appointment dropdowns. Hard refresh and try again.`,
  },
  {
    id: '27da314d-7f70-405d-ba33-6099f56b2ac7', // Tracy: change date on invoice
    reply: `Shipped — open any invoice and you'll see two small editable date fields right under the customer name: "Invoice date" and "Due date". Change either, it saves automatically, and the new date flows into the PDF when you regenerate. Locked invoices show the fields read-only.`,
  },
  {
    id: 'f80a20a2-2a76-40e4-a0e6-2d5a7d00cab9', // Tracy: invoice due date
    reply: `Same fix as your "Change Date on Invoice" ticket — Due Date is now editable per-invoice right next to Invoice Date. Pick whatever date you need (shorter terms for one-off jobs, longer for trades), it saves immediately and shows on the PDF.`,
  },
  {
    id: '251cfc43-6239-4258-a451-6cfb8df05855', // Tracy: statement blank page
    reply: `Fixed for Motion & Flow Controls and every other customer. Root cause: Chrome 124+ tightened how blob URLs can open in a freshly-spawned tab — the statement PDF was being generated correctly but the new tab was getting stuck on about:blank. Now: the statement file ALWAYS downloads to your Downloads folder (most reliable path), AND tries to open in a tab as a bonus. If the tab doesn't open you'll see a "Statement downloaded — filename" toast.`,
  },
  {
    id: '7c2e58cc-62ca-4cc1-9bc0-706abff313e9', // Christopher: can't send estimate
    reply: `The Send button was there the whole time — the green "Send Proposal" button on the right side of the estimate page actually sends the email. There was a SECOND button labeled "Mark as Sent" that only flipped the status without emailing — easy to mistake for the real send. I renamed it to "Mark as Sent (no email)" with a tooltip that says "This does NOT email, use the green Send Proposal button above." Re-open /estimates/4429 and you'll see the green Send button clearly labeled.`,
  },
  {
    id: 'c5a19009-36cf-438c-aa9a-70db5e253395', // Tracy: stripe charged multiple times
    reply: `The webhook fix that auto-marks invoices as Paid when Stripe charges go through shipped on June 1. I also backfilled 8 older payment rows where the Stripe transaction ID was sitting in the notes but the column was NULL — that was confusing the de-dup check.

Going forward: when a customer pays via the Stripe payment link, the invoice will auto-flip to Paid in JobScout. You shouldn't need to hit "Record Payment" manually for credit card payments — that's how the Angie Haynie 9x duplicate happened.

For the existing 9 Angie charges: those were processed via Stripe so you can refund them from the Books → Payments tab (or directly in the Stripe dashboard if easier). Let me know if you want me to refund them programmatically.`,
  },
  {
    id: '53afdf13-2893-4458-aa22-9c164da38c9e', // Tracy: stripe deposits Cameron
    reply: `Diagnosed but the fix is in the Stripe Dashboard, not the code. I confirmed via Stripe API that recent payouts ARE going to a bank account (HHH ending in 2000), not Cameron's card. The likely culprit is Stripe Instant Payouts — if anyone hits "Pay out now" with Cameron's debit card as the destination, money lands there. Bryce needs to: log into https://dashboard.stripe.com → Settings → Payouts → Bank accounts and debit cards, and either remove Cameron's card or unset it as the Instant Payout default. Want me to build an alert that emails when a payout goes to a non-HHH destination?`,
  },
  {
    id: '9c34be3b-0e8c-4446-87b5-eee66ce9e70d', // Tracy: stripe transaction not tying
    reply: `Same root cause as your "Angie 9x charge" ticket — when a customer pays via the Stripe-hosted page, the webhook now auto-marks the invoice Paid. Roquesann Fillerup's payment from 5/14 should have auto-flipped the invoice if the webhook fix was deployed at the time. If you have a list of invoices that show Open balance but actually have Stripe charges, send me the IDs and I'll match them up.`,
  },
]

const NEED_INFO = [
  {
    id: '547090ec-49f8-483f-9a29-28e52c88d889', // Bryce: EOS numbers wrong
    reply: `I shipped AR + expense math fixes (now reads from the same arHelpers + frankieFields modules as Dashboard / Arnie / Books / Frankie). If you still see numbers that look wrong, please reply with: (a) which specific metric, e.g. "Cash Collected for this period" or "Sales YTD", (b) the period you're viewing, (c) what you think the right number is. I'll trace and fix that one in particular without touching the rest of EOS.`,
  },
  {
    id: '6407e421-20dc-482f-9b99-7c49de5f56b1', // Bryce: Western States bonus
    reply: `Three symptoms in your report (shows once, doesn't follow if unpaid, shows $0). I want to fix them but payroll logic is too risky to touch without knowing the specific pay period to test against. Could you reply with: (a) which pay period you're looking at, (b) the expected bonus amount, (c) which employee(s)? I'll trace just that case and ship a targeted fix.`,
  },
  {
    id: '3ef73597-730e-459a-9910-d660436a732b', // Doug: pipeline filter by date
    reply: `Doug — the date filter on Pipeline is intentional: only the terminal columns (Won / Lost / Completed / Invoiced / Paid / Closed) filter by MTD/YTD/90d. The active pipeline columns (New, Contacted, Estimate Sent, In Progress, etc.) always show everything open because you don't want an old lead to disappear when the filter is on MTD. If you have a SPECIFIC column where the filter isn't working when it should, send me the column name + a few example cards and I'll trace it.`,
  },
  {
    id: 'ebabeeb6-cb88-4f03-b8ac-006260050e8f', // Bryce: pipeline not capturing invoiced
    reply: `I checked the data — 21 jobs are currently in the Invoiced column. Jobs that have been invoiced AND moved past Invoiced (Verified Complete, Post Inspection, Paid) appear in their CURRENT column instead. That's by design — once a customer pays, the card moves to Paid, not back to Invoiced. If you have specific job IDs that you THINK should be in Invoiced but aren't, send them and I'll trace why each one isn't there.`,
  },
  {
    id: '93d841aa-50e7-40f1-b034-40568d171e3c', // Doug: contact pull-through Evergreen
    reply: `I checked job 23286 (Evergreen) — the customer record has phone 307-362-7700 on file. Capital Lumber 23272 has phone 8014842007 on file too. Both should now show on the job page (we shipped fixes that back-fill these from the lead during convert-to-job). If you're STILL not seeing them, hard refresh (Ctrl+Shift+R) and let me know. If it persists, screenshot the job page and send it.`,
  },
  {
    id: 'f448fc83-d63d-4dd4-b9b1-e9e9b7a5ae1a', // Doug: Capital Lumber not pulling
    reply: `Same — Capital Lumber 23272 has the phone (8014842007) and email (dprows@capital-lumber.com) on the customer record now. Hard refresh once on the job page if you still see blanks. New conversions back-fill from the lead automatically.`,
  },
  {
    id: '36275fe6-0ca6-4e58-a16d-b5605059a10b', // London: phone didn't transfer
    reply: `London — checked /estimates/4220. That estimate's customer record needs to be populated; the convert-to-job carries whatever's there. If the customer was added with just a name, the phone won't appear because there's nothing to pull. Going to /customers/{id} and adding the phone there is the fix. We can also build a "this customer is missing a phone — fix now?" nudge when you open a job whose customer is incomplete — would that help?`,
  },
]

let posted = 0, failed = 0, notFound = 0
async function postReply(item, isInfo = false) {
  const { data: current } = await sb.from('feedback').select('id, reply_history').eq('id', item.id).maybeSingle()
  if (!current) {
    notFound++
    console.log('  ', item.id.slice(0, 8), '— NOT FOUND')
    return
  }
  console.log('  ', item.id.slice(0, 8), isInfo ? '[need info]' : '[fixed]')
  if (APPLY) {
    const prior = Array.isArray(current.reply_history) ? current.reply_history : []
    const newHistory = [
      ...prior,
      { at: new Date().toISOString(), from: 'bryce@hhh.services', text: item.reply },
    ]
    const { error } = await sb.from('feedback').update({
      reply_message: item.reply,
      replied_at: new Date().toISOString(),
      reply_history: newHistory,
      status: 'in_progress',
    }).eq('id', item.id)
    if (error) { failed++; console.log('     ERR:', error.message) }
    else posted++
  }
}

console.log('=== Fixed items ===')
for (const f of FIXED) await postReply(f, false)
console.log('\n=== Need-info items ===')
for (const f of NEED_INFO) await postReply(f, true)

console.log('\n========================================')
console.log(APPLY ? `Posted ${posted} replies, ${failed} failed, ${notFound} not found` : `Dry run — would post ${FIXED.length + NEED_INFO.length}`)
