// Close 3 tickets whose fixes already shipped earlier in the session.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const replies = {
  '9c9eaaf9': [
    'Shipped — Documents card now has a dedicated "Camera" button on mobile that opens the iPhone camera straight away (one tap, no Photo Library detour).',
    '',
    'The Generate / Submittal / Upload buttons are also bigger now (44px tap targets) so they\'re easier to hit one-handed. Pull a job up on your phone and try it — let me know if anything still feels clunky.',
  ].join('\n'),
  '597612a8': [
    'Fixed — payroll was double-counting any time that appeared in BOTH the punched clock and a Job Time Log for the same day.',
    '',
    'Now the calculator dedupes per employee per day: if a Job Time Log overlaps with a clock punch, only the clock punch counts toward total hours. The Job Time Logs still surface as job-level detail (so we know where the time went) but they no longer inflate the payroll total.',
    '',
    'Worth re-running the last pay period and comparing — should match what you\'d expect now.',
  ].join('\n'),
  'd1f63d76': [
    'Same root cause as your "Payroll capturing incorrect hours" ticket — the time-tracking module was summing both punched clock entries AND Job Time Logs even when they overlapped. Fixed in the same change: the totals now dedupe per employee per day, so the time-tracking number will match the time-logged number for any day where both exist.',
    '',
    'Open job 21013 again — the two should reconcile now.',
  ].join('\n'),
}

const { data: openTickets, error: findErr } = await supabase
  .from('feedback')
  .select('*')
  .neq('status', 'resolved')
  .limit(500)
if (findErr) { console.error(findErr); process.exit(1) }

for (const [prefix, reply] of Object.entries(replies)) {
  const t = openTickets.find(r => String(r.id).startsWith(prefix))
  if (!t) { console.log(`SKIP ${prefix} — not found`); continue }
  const { error: updErr } = await supabase
    .from('feedback')
    .update({
      status: 'resolved',
      reply_message: reply,
      replied_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      reply_history: [
        ...(t.reply_history || []),
        { from: 'bryce', message: reply, at: new Date().toISOString() },
      ],
    })
    .eq('id', t.id)
  if (updErr) console.error(`FAIL ${prefix}:`, updErr)
  else console.log(`OK   ${prefix} — ${t.subject}`)
}
