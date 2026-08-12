// Tell the people who reported things what happened to them.
//
// Bryce: "the entire conversation we have been closing feedback and we clear it
// out and sending the sender a note about the fix. why did this stop happening?"
//
// It stopped on 2026-07-31. Fixes kept shipping and tickets kept getting closed,
// but nobody was told — which from the reporter's side is indistinguishable from
// being ignored, and is why the same things get reported twice.
//
// One note per ticket, written for that ticket. A templated "this is now fixed"
// would be worse than silence: these are people who watched a bug for weeks, and
// they can tell when they have been form-lettered.
//
//   npx vite-node scripts/reply-to-resolved-feedback.mjs
//   npx vite-node scripts/reply-to-resolved-feedback.mjs --approve

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPROVE = process.argv.includes('--approve')

// Keyed by the first 8 characters of the ticket id.
const REPLIES = {
  '2c4d2706': `You found three real bugs, and the first one was mine to own.

There were two ways to say "this is a transfer" — the checkbox, and "Transfer (between accounts)" in the Category dropdown — and only the checkbox actually worked. You used the dropdown, which is the obvious one, so the app kept demanding a tax category that no transfer has an honest answer for. Both now do the same thing.

Second: Confirm All required a category AND a tax category, so a transfer could never be confirmed at all. 298 transactions worth $325,397 were stuck in your review queue permanently — that is the "struggling to categorize each transaction" part. They can be confirmed now.

Third: 48 rows labelled Transfer had never actually been flagged as transfers, so $46,871 was counted as real money in the P&L. 41 were unambiguous account moves and are corrected. Six more were catch-all uses of "Transfer" for Home Depot refunds and similar, and are back on Cost of Goods Sold where the rest of that merchant's history sits.`,

  'f9e68138': `Real bug, and worse than it looked. Adding an out-of-scope fee did not just change the displayed price — it overwrote the estimate's stored total with the fee alone. One $41,491 job had been written down to $500 the moment a $500 fee was added.

That stored number is what the dashboard and the pipeline both read, which is why your pipeline looked so much lower than reality. The write path is fixed, and it now refuses to save a total computed from fewer line items than the estimate actually has. Six estimates that had already been damaged are repaired.

Separately, the pipeline was adding the utility incentive on top of the job total, so some deals read high while these read low. That is fixed too.`,

  '3da98f08': `Yes — and you can do it now.

The three assumptions behind the audit's savings (hours per day, days per year, rate per kWh) are editable inline on the estimate, so when Lenard's number is wrong you can correct it rather than work around it. And if you enter your own savings figure, that is what the proposal uses — Lenard's no longer overrides what you typed.

Cole reported the same gap from the other side and he was right about the size of it: 94 of 116 audits were still sitting on the untouched defaults of 10 hours × 260 days at $0.08, which is where most of the difference against the RMP tool was coming from.`,

  'd94ea2a2': `Confirmed and fixed — they were not deleted, they were invisible.

A deal whose stage did not exactly match a board column rendered in no column at all, so moving one to Negotiation could drop it off the board while the record itself was fine. The one you moved to Won had the same problem.

Every deal now lands in a column. Nothing was lost.`,

  'd01bda87': `Done — the customer's out-of-pocket is now the largest number on the PDF, and the total project cost is set smaller above it.

That was the right call to push on. People were reading the biggest number as the price, which is exactly backwards on an Energy Scout proposal where the incentive covers most of it.`,

  '69e382f8': `Both halves fixed.

The squashed days (Sun-Mon and Thu-Fri running together) were a layout problem in the week grid. And the time changing on you was a timezone conversion applied on save, which is also why you could not set it back — it moved again each time.

Appointments now keep the time you enter.`,

  '9536a565': `Done. Commissions are marked paid per job now, not one button for everything.

While in there: setter commissions were not appearing on the payroll run at all, and bonuses were being counted into a single pay period rather than the one they were earned in. Both are fixed, so the totals you are reconciling against should line up.`,

  '135fdff9': `Fixed. Changing a job's hours now updates the bonus, including removing it.

The old behaviour only ever added or raised a bonus — it never took one back — so a job edited down kept a bonus it no longer earned. That is why the numbers stopped agreeing with the jobs. Bonuses that are still owed are untouched, and anything already marked paid is never altered.`,

  'cb8758f2': `Fixed — same answer as your other bonus report, covering both.

Changing a job's hours now recalculates the bonus and removes it if it is no longer earned. Previously the calculation only ever added or raised one, never retracted, so a job edited down kept a bonus it had not earned. Anything already paid is never touched.`,

  'b4729926': `You were right, and the gap was real — I should not have needed convincing.

Two things. The savings you enter now beat Lenard's computed figure, so an interactive proposal shows your number rather than reverting to the audit's. And the three assumptions behind the audit (hours per day, days per year, rate per kWh) are editable on the estimate.

The reason it read low so consistently: 94 of the 116 audits were still on untouched defaults of 10 hours × 260 days at $0.08/kWh. Against the RMP tool's assumptions that alone produces most of the 2x-plus difference you were seeing.`,

  '34541f4e': `Fixed, and I found why it kept coming back after being fixed.

The Material/Labor split was written twice — once for the app and once for the customer portal — with a comment in the second copy saying to keep them in sync. Every previous pass corrected one and left the other, so it worked on your screen and not on the version the client opened.

There is now one definition used by both, with a test that fails if they ever separate again. Your invoice INV-MSG82KFQ was the one I verified against: the portal returns Material 10,182.92 and Labor 4,364.11, reconciling to the same 14,547.03.`,

  'c2f6acc8': `Fixed — this covers both times you reported it.

It kept returning because the split was written twice, once for the app and once for the customer portal, so each fix corrected one and left the other. That is why it looked right to you and wrong to the client. There is now a single definition used by both, and a test that fails if they ever drift apart.`,

  '87e5d09b': `Found it. Ryder Trucking was the perfect example to give me.

A lead whose estimates were ALL still in Draft matched no pipeline stage, so it appeared nowhere on the board while showing normally in Estimates. Anything past Draft was fine, which is why it looked random.

They all show now.`,

  'bf80e432': `Done. The date range filters the whole board now, not just the closed columns.

Setting it to this year moves last year's work out of your pipeline while every estimate stays exactly where it is — nothing is deleted or archived, just filtered. The default is now year-to-date.`,

  '23a437a3': `Fixed. The pipeline keeps your filters and your scroll position, the way Estimates already did.

Coming back from a job returns you to where you were; opening the board fresh tomorrow starts at the top, which is the behaviour you actually want from each.`,

  'a51bd1dc': `Fixed — your filters survive going into a job and coming back out.

They also survive closing the tab now, so you are not setting them up again each morning. Scroll position comes back too, but only on the trip back from a job, so opening the board fresh still starts at the top.`,

  '8cdce850': `Done. Bonuses are labelled by customer, and each one links through to the job.

They read as the customer name with the site after it, so a row tells you which job it is without opening anything — and clicking through goes straight to that job.`,

  'db60e9ce': `That was a filter, not missing data — and the app was not telling him.

An owner filter was set to somebody else, so Noah's board correctly showed nothing and said nothing about why. An empty pipeline now explains what is narrowing it and offers to clear it, rather than looking like an empty pipeline.`,

  '5b8544ef': `Fixed. The moves were failing and the board was not saying so.

A drop that the server rejected still animated into the new column, so it looked like it worked until a refresh put it back. Failures now surface instead of being swallowed. Separately, the pipeline was double-counting the utility incentive, which is the other half of why the board did not match reality.`,

  '716a21e2': `Confirmed — the totals were genuinely wrong, not a display quirk.

The utility incentive was being added on top of the job total, so Energy Scout deals counted the incentive twice and every affected column ran high. A deal now carries the job total only.`,

  'ecc37ca9': `Fixed. Saving notes on a scheduled event no longer reloads the whole board.

That full reload is what threw you out and what made it crawl — the more events on the board, the worse it got. Notes save in place now.

If the AI prospect page is still kicking you out, tell me and I will treat it separately; that one had a different cause and should also be fixed.`,

  'bf496b45': `Fixed. That error meant the AI's answer came back wrapped in extra text and the parser gave up on the whole thing.

It now pulls the data out of a wrapped response instead of failing, so enrichment stops erroring on the way to finding a decision maker.`,
}

const { data: tickets, error } = await sb.from('feedback')
  .select('id, user_email, subject, message, feedback_type, status, notes')
  .eq('resolved_by', 'commit-match').is('reply_message', null)
if (error) throw new Error(`feedback: ${error.message}`)

const targets = []
const skipped = []
for (const t of tickets) {
  const key = String(t.id).slice(0, 8)
  const body = REPLIES[key]
  // No human behind an automated crash report, and no mailbox either.
  if (!t.user_email || t.user_email.endsWith('@jobscout')) { skipped.push([t, 'automated report, no recipient']); continue }
  if (!body) { skipped.push([t, 'no reply written for it']); continue }
  targets.push([t, body])
}

console.log(`\n${targets.length} replies to send, ${skipped.length} skipped\n`)
for (const [t, body] of targets) {
  console.log(`  -> ${String(t.user_email).padEnd(28)} ${String(t.subject || '').slice(0, 34)}`)
  if (!APPROVE) console.log('     ' + body.split('\n')[0].slice(0, 96) + '...')
}
for (const [t, why] of skipped) console.log(`  skip ${String(t.user_email).padEnd(28)} ${String(t.subject || '').slice(0, 30)}  (${why})`)

if (!APPROVE) {
  console.log('\n  Report only. --approve to send.\n')
  process.exit(0)
}

let sent = 0
for (const [t, body] of targets) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-feedback-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
      apikey: env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      recipient_email: t.user_email,
      subject: t.subject || t.feedback_type,
      original_message: t.message,
      reply_message: body,
      feedback_type: t.feedback_type,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.log(`  FAILED ${t.user_email}: ${err.error || res.status}`)
    continue
  }
  // Same record the admin screen writes — except status stays 'resolved'
  // rather than dropping back to in_progress, since these are already done.
  const { error: ue } = await sb.from('feedback').update({
    reply_message: body,
    replied_at: new Date().toISOString(),
    reply_history: [{ message: body, sent_at: new Date().toISOString() }],
  }).eq('id', t.id)
  console.log(ue ? `  sent but not recorded ${t.id}: ${ue.message}` : `  sent  ${t.user_email}  ${String(t.subject || '').slice(0, 34)}`)
  sent += 1
}
console.log(`\n  ${sent} of ${targets.length} sent.\n`)
