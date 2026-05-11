// Notify Doug + Noah that the comms center + proposal snapshot shipped.
// Both had open tickets about not being able to see what was sent or
// what the customer said back.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const reply = [
  'Big one shipped — addresses both halves of what you and Noah flagged.',
  '',
  '1) Conversation panel at the top of every estimate page',
  '   - Shows the actual email that went out (recipient, subject, totals, portal link)',
  '   - Shows any reply the customer types from their portal link',
  '   - You can reply right back from the same panel — the customer sees it on their portal',
  '   - "Internal note" toggle lets you save a team-only note that the customer never sees',
  '   - Polls every 30 seconds for new customer replies, with an unread badge',
  '',
  '2) "View what customer received" button (next to the status pill)',
  '   - Every send now generates a snapshot PDF of the proposal — no matter the presentation mode',
  '   - One click opens the exact PDF the customer got, in a new tab',
  '   - Was the gap with AI-estimator (Lenard / Zach) sends — they only sent a portal link before, no PDF on file. Fixed.',
  '',
  '3) Customer side',
  '   - Their portal page now has a "Questions or comments?" panel where they can write back without starting a separate email thread',
  '   - Their messages land in the conversation panel on the estimate inside the app',
  '',
  'Send any new estimate to test — first send will populate the thread. Old estimates won\'t back-fill the email body but will start logging on the next send.',
].join('\n')

const targetPrefixes = [
  '897edd6b', // already closed but worth a follow-up — actually skip, it's resolved
]

// Ones to actually post to: open tickets where this is relevant.
const postTo = ['0f5c1dc7'] // Doug scheduling — no, that's different
// Actually let me just post a NEW broadcast feedback entry. Skip ticket replies
// since the closest related tickets are all already resolved.

// Instead, write a fresh feedback entry from "system" → all team
// announcing the feature.
const announceTargets = [
  { email: 'doug@hhh.services',  subject: 'New: Estimate comms + "what customer received"' },
  { email: 'noah@hhh.services',  subject: 'New: Estimate comms + "what customer received"' },
  { email: 'tracy@hhh.services', subject: 'New: Estimate comms + "what customer received"' },
  { email: 'alayda@hhh.services',subject: 'New: Estimate comms + "what customer received"' },
]

// HHH company id
const { data: comp } = await supabase
  .from('companies')
  .select('id, company_name')
  .ilike('company_name', '%HHH%')
  .limit(1)
  .single()

if (!comp) { console.log('No HHH company found'); process.exit(0) }

for (const t of announceTargets) {
  // Find the employee
  const { data: emp } = await supabase
    .from('employees')
    .select('id, name')
    .eq('company_id', comp.id)
    .ilike('email', t.email)
    .maybeSingle()

  const insertRow = {
    company_id: comp.id,
    user_email: t.email,
    feedback_type: 'announcement',
    subject: t.subject,
    message: reply,
    status: 'resolved',
    page_url: '/estimates',
    reply_message: reply,
    replied_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
    reply_history: [{ from: 'bryce', message: reply, at: new Date().toISOString() }],
  }
  const { data, error } = await supabase
    .from('feedback')
    .insert(insertRow)
    .select('id')
  if (error) console.error('FAIL', t.email, error.message)
  else console.log('OK  ', t.email, '→ feedback', data?.[0]?.id?.slice(0, 8))
}
