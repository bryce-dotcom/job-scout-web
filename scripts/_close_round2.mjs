// Round 2 of feedback cleanup replies.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const replies = {
  // Alayda — Field Scout was showing unassigned + cross-company jobs.
  // Tightened in commit 3fec14a "FieldScout: tighten today's-jobs filter post-HCP migration".
  'dcc7233e': {
    status: 'resolved',
    text: [
      'Fixed — Field Scout\'s "Today\'s Jobs" list is now strict:',
      '',
      '  • Jobs only show up if you are personally assigned to them (job lead, salesperson, PM, or named on the assigned team).',
      '  • The blanket "unassigned jobs visible to everyone" behavior is gone.',
      '  • Every query is also pinned to your company_id, so you should never see HHH jobs mixed with another company\'s.',
      '',
      'The one exception: a job you are actively clocked into stays visible even if it isn\'t on your schedule, so you can clock out cleanly.',
      '',
      'If you still see anything unexpected, send me the job ID and I\'ll check it.',
    ].join('\n'),
  },

  // Tracy — blank estimate page. Wrapped EstimateDetail in its own ErrorBoundary
  // so the next time it happens we'll see the actual error instead of a blank screen.
  '7ec14011': {
    status: 'in_progress',
    text: [
      'I shipped a safety net for this: estimates now have their own error boundary, so instead of a blank page you\'ll get an error card with the actual error message and a Reload button.',
      '',
      'Next time it happens, please screenshot the error card (or just paste the red text it shows) and reply here — that\'ll tell me exactly what\'s breaking on that customer\'s estimate. I haven\'t been able to reproduce a blank page on my side without that detail.',
    ].join('\n'),
  },

  // Noah — "customer could only open estimate once". The portal token has
  // an access_count and is not single-use; we now also surface the actual
  // count on the estimate page so the rep can verify.
  '0f2aaf28': {
    status: 'resolved',
    text: [
      'Checked into this — the customer portal link is NOT single-use. Every estimate gets a portal token tied to the customer; opening it bumps an access_count but does not invalidate the link. Tokens stay live until the estimate is approved/declined or you manually revoke them.',
      '',
      'I added the live access count + "last viewed" timestamp to the estimate detail page so you can see exactly how many times the customer has actually opened the link. If a customer tells you "I can only open it once", check that count first — usually they\'re hitting an old preview email or a cached PDF link, not the portal.',
      '',
      'If you find a specific customer where the portal really did stop working after one view, send me the estimate ID and the customer\'s exact steps and I\'ll dig in.',
    ].join('\n'),
  },
}

const { data: openTickets, error: findErr } = await supabase
  .from('feedback')
  .select('*')
  .neq('status', 'resolved')
  .limit(500)
if (findErr) { console.error(findErr); process.exit(1) }

for (const [prefix, { status, text }] of Object.entries(replies)) {
  const t = openTickets.find(r => String(r.id).startsWith(prefix))
  if (!t) { console.log(`SKIP ${prefix} — not found / already resolved`); continue }
  const update = {
    reply_message: text,
    replied_at: new Date().toISOString(),
    reply_history: [
      ...(t.reply_history || []),
      { from: 'bryce', message: text, at: new Date().toISOString() },
    ],
    status,
  }
  if (status === 'resolved') update.resolved_at = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('feedback')
    .update(update)
    .eq('id', t.id)
  if (updErr) console.error(`FAIL ${prefix}:`, updErr)
  else console.log(`OK   ${prefix} → ${status} — ${t.subject}`)
}
