// Reply to Doug's product picker ticket and close it.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const ticketIdPrefix = '897edd6b'

// PostgREST won't ilike a uuid column directly — list and prefix-match in JS.
const { data: allOpen, error: findErr } = await supabase
  .from('feedback')
  .select('*')
  .neq('status', 'resolved')
  .order('created_at', { ascending: false })
  .limit(200)

const tickets = (allOpen || []).filter(r => String(r.id).startsWith(ticketIdPrefix))

if (findErr) { console.error(findErr); process.exit(1) }
console.log('Matched:', tickets)

if (!tickets?.length) { console.log('No ticket'); process.exit(0) }
const ticket = tickets[0]

const reply = [
  'Fixed and shipped — thanks for flagging both issues.',
  '',
  '1) "Can\'t see what I\'m typing": iOS Safari was auto-zooming the search box on focus and the text was disappearing behind the keyboard. Bumped the font to 16px on mobile (iOS only zooms below 16) and forced the text color so it always renders dark on the light background. You should now see every character as you type.',
  '',
  '2) "Descriptions are not enough": product rows now show up to two lines of description on mobile (was one truncated line) and added a "SKU · Category" line below it so you can tell similar products apart at a glance.',
  '',
  'Pull the latest and give it a try on your phone — let me know if it still feels off.',
].join('\n')

const { data: updated, error: updErr } = await supabase
  .from('feedback')
  .update({
    status: 'resolved',
    reply_message: reply,
    replied_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
    reply_history: [
      ...(ticket.reply_history || []),
      { from: 'bryce', message: reply, at: new Date().toISOString() },
    ],
  })
  .eq('id', ticket.id)
  .select()

if (updErr) { console.error(updErr); process.exit(1) }
console.log('Updated:', updated)
