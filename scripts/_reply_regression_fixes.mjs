// Reply to the regression-report tickets with what we found and shipped.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const replies = {
  // Doug — scheduler + recurring + estimate→job lost lines
  '46855832': {
    status: 'resolved',
    text: [
      'Diagnosed and fixed all three things in this ticket.',
      '',
      'A) "Recurring jobs lost their line item details"',
      '   - Found the cause: the original "donor" job in the recurring set had ALSO lost its lines, so every spawned recurrence inherited zero. Recovered 3 of your Commercial Window Cleaning sites (Store Front jobs 21038, 21039, 21040) by copying lines from the matching donor sibling.',
      '   - Some other recurring sets (e.g. Residential Window Cleaning) had siblings with different totals — those are genuinely different scopes, not a data loss, so I left them alone. If you find specific ones that are wrong, send the job IDs and I\'ll handle them.',
      '',
      'B) "Win an estimate → make it a job → line items don\'t come over"',
      '   - Real bug. The auto-convert that fires when you approve an estimate was reading the line-item list from a stale React snapshot — so for some estimates it would create the job with the dollar total but zero lines.',
      '   - Backfilled bitter creek testing (3 lines), Pacific Steel (4 lines), and Pacific Steel #2 (2 lines).',
      '   - Code fix shipped: convert-to-job now reads the quote + lines fresh from the database and surfaces a loud error if the line-items insert ever fails (instead of silently dropping them).',
      '',
      'C) "Scheduler is fucked up" — see your other ticket reply.',
      '',
      'Open the affected jobs and confirm they look right now.',
    ].join('\n'),
  },

  // Doug — calendar↔job sync
  '9d2fc03e': {
    status: 'resolved',
    text: [
      'Real bug, shipped two-way sync.',
      '',
      'What was wrong:',
      '   - Drag-drop a job on the calendar → it updated the appointment row but NOT the job\'s start_date',
      '   - Edit start date inside the job page → it updated the job but NOT the linked appointment',
      '   - Result: calendar and job page showed different dates after either action',
      '',
      'What\'s fixed:',
      '   - Calendar drag-drop now pushes the new start/end onto the job',
      '   - Calendar appointment edit modal now pushes onto the job',
      '   - Job-page Save now pushes the new start/end onto the appointment',
      '',
      'Try moving a job both ways and confirm. If you see one specific case where it still drifts, send a screenshot.',
    ].join('\n'),
  },

  // Alayda — Deseret Book / line items missing on jobs
  'cca23e71': {
    status: 'resolved',
    text: [
      'Same root cause as Doug\'s line-item ticket — fixed.',
      '',
      'The auto-convert that runs when you approve an estimate was reading line items from a stale React snapshot, so some jobs got the dollar total but no lines. Code fix shipped (convert now refetches from the DB) and back-filled the 3 known broken jobs (Pacific Steel x2, bitter creek testing) with 9 lines.',
      '',
      'For Deseret Book specifically — those are old archived jobs from before this regression existed (no quote_id on file). They were created via the legacy job flow without lines, not lost by us. If there\'s a specific recent Deseret Book job you expected to have lines, send the job ID and I\'ll look.',
      '',
      'Notes/summary now also carry over reliably — same fix.',
    ].join('\n'),
  },
}

const { data: openTickets } = await supabase
  .from('feedback')
  .select('*')
  .neq('status', 'resolved')
  .limit(500)

for (const [prefix, { status, text }] of Object.entries(replies)) {
  const t = (openTickets || []).find(r => String(r.id).startsWith(prefix))
  if (!t) { console.log(`SKIP ${prefix} — not open`); continue }
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
  else console.log(`OK   ${prefix} → ${status} — ${t.subject}`)
}
