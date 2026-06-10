// Replies to Batch C feedback items: shipped fixes + need-info skips.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN ===\n')

const ITEMS = [
  // Fixed
  { id: '13ab9ead-e35e-45f1-b944-616a7c485c26', kind: 'fixed', text:
`Fixed for the Formal/legal proposal. The Email-layout PDF already showed annual savings — the formal one was missing the line. Added "Estimated Annual Energy Savings $X/yr" + Payback Period right under Contract Total in the Fees & Payment Terms box. Only shows when the audit has savings data, so non-energy proposals don't get a "$0/yr" line. Regenerate /estimates/4201's PDF — savings should be there now.` },

  { id: '7fdc6918-9536-41fb-b9c9-5e190a6ba487', kind: 'fixed', text:
`Fixed. The Line Items header on the estimate page was forcing buttons off-screen on narrow viewports. Added flexWrap so the Add Product + Custom Line buttons drop to a second row on iPhone-width screens instead of getting cut off the right edge. Try /estimates/4407 on your phone and you should see both buttons now. Hard refresh to clear the cached page.` },

  { id: '1e2f10fc-3899-4bf3-b350-2722df4f3fee', kind: 'fixed', text:
`Fixed. The verification result was unblocking your clock-out gate but you still had to click Clock Out again — that's what felt like a loop. Now: when verification passes AND you were already trying to clock out, it auto-clocks you out before navigating to the report. You'll see "Verified + clocked out at 4:32 PM" toast. You still end up on the report page (so you can see the score) — that part wasn't broken, the missing piece was the auto-clock-out.` },

  // Need info — couldn't safely fix from current data
  { id: '7bbfcab8-fb0e-40c7-b5a7-9ca3814ce3b0', kind: 'info', text:
`I checked job 23309 and the data shows start_date = 1pm UTC, which converts to 7am Mountain time — so what you saw IS what's stored. The code is timezone-correct in both directions. Could you walk me through specifically: (a) what time did you originally set when you created the job, (b) which page did you set it on (Jobs board "+ Add Job" form, JobDetail edit, etc.), (c) when you re-opened it, what time showed up? I want to fix it but need to see the exact steps that produce the wrong time.` },

  { id: '994d1ec9-14e5-432f-b546-3fbe27deda5e', kind: 'info', text:
`I looked at lead 3688 → quote 4419. The quote has the total ($23,325.52) but zero line items and no audit attached. So when you generate the proposal, there's nothing to list because nothing was saved into quote_lines. Could you tell me: (a) how did you "build the project" — through Lenard, through the estimate page Add Product picker, or by typing a flat total directly? (b) did you see line items in the editor right before you saved? Once I know the path you took I can figure out where the lines got dropped.` },

  { id: 'e8cccc81-ed55-48fb-8232-7be285b0c949', kind: 'info', text:
`Tracy — I traced the drag/drop and click-to-create code in LeadSetter and it looks timezone-correct: if you drag a lead to Tuesday 2pm, it saves as Tuesday 2pm local and displays as Tuesday 2pm. I couldn't reproduce the day shift from the code alone. Could you tell me: (a) a specific lead you scheduled where the day shifted, (b) what day/time you originally set, (c) what day/time it showed up as afterward? Even better — keep a tab of LeadSetter open and watch for the next time it happens, then send me the lead name + before/after.

For the "can't pick same time as another rep" — that part I think I can fix without specifics. Currently if you click a cell that already has an appointment, you can't easily add a second one in the same slot. Want me to make it so clicking the cell ALWAYS opens the new-appointment modal (instead of only opening it when the cell is empty)?` },
]

let posted = 0, failed = 0, notFound = 0
for (const item of ITEMS) {
  const { data: current } = await sb.from('feedback').select('id, reply_history').eq('id', item.id).maybeSingle()
  if (!current) { notFound++; console.log('  ', item.id.slice(0, 8), '— NOT FOUND'); continue }
  console.log('  ', item.id.slice(0, 8), item.kind === 'fixed' ? '[fixed]' : '[need info]')
  if (APPLY) {
    const prior = Array.isArray(current.reply_history) ? current.reply_history : []
    const newHistory = [...prior, { at: new Date().toISOString(), from: 'bryce@hhh.services', text: item.text }]
    const { error } = await sb.from('feedback').update({
      reply_message: item.text,
      replied_at: new Date().toISOString(),
      reply_history: newHistory,
      status: 'in_progress',
    }).eq('id', item.id)
    if (error) { failed++; console.log('     ERR:', error.message) }
    else posted++
  }
}

console.log('\n========================================')
console.log(APPLY ? `Posted ${posted}, failed ${failed}, not-found ${notFound}` : `Dry run — would post ${ITEMS.length}`)
