// Vercel cron — bid deadline reminders, hourly (SAL_SCOUT_PLAN.md §5.8).
//
// A submission that is approved (or bounced, or still a draft) and not yet
// sent or confirmed gets a notification 24 h and 4 h before the bid is due,
// once each (bid_submissions.reminders records which fired). A bounced
// email submission gets the 4 h reminder even if the 24 h one went, because
// the deadline has not moved and the bid is not in.
//
// Auth: Vercel's cron header, or a CRON_SECRET bearer for a manual run.

const { createClient } = require('@supabase/supabase-js')

const REMINDER_HOURS = [24, 4]
const NEEDS = ['draft', 'approved', 'bounced']

function remindersDue(dueAt, sent, now) {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime()) || due <= now) return []
  const hoursLeft = (due - now) / 3600e3
  return REMINDER_HOURS.filter((h) => hoursLeft <= h && !(sent || []).includes(h))
}

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) return res.status(401).json({ error: 'unauthorized' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const now = new Date()
  const horizon = new Date(now.getTime() + 25 * 3600e3).toISOString()

  // Live submissions with an opportunity due inside 25 h.
  const { data: subs, error } = await sb
    .from('bid_submissions')
    .select('id, company_id, quote_id, opportunity_id, status, method, reminders, opportunity:bid_opportunities!opportunity_id(id, title, buyer, solicitation_number, due_at, due_tz, status)')
    .in('status', NEEDS)
    .not('opportunity_id', 'is', null)
  if (error) return res.status(500).json({ error: error.message })

  let raised = 0
  const details = []
  for (const s of subs || []) {
    const opp = s.opportunity
    if (!opp || !opp.due_at || opp.due_at > horizon) continue
    if (['won', 'lost', 'no_award', 'dismissed', 'expired'].includes(opp.status)) continue
    const due = remindersDue(opp.due_at, s.reminders || [], now)
    if (!due.length) continue
    const h = Math.min(...due)
    const when = new Date(opp.due_at).toLocaleString('en-US', { timeZone: opp.due_tz || 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const what = s.status === 'bounced' ? 'the bid email BOUNCED and it is not in' : s.status === 'approved' ? `approved but not ${s.method === 'email' ? 'sent' : 'submitted'}` : 'not yet approved'
    const { error: nErr } = await sb.from('company_notifications').insert({
      company_id: s.company_id, type: 'bid_due_soon',
      title: `Sal: ${h} h to the deadline — ${opp.title}`,
      message: `${opp.solicitation_number ? `${opp.solicitation_number} · ` : ''}due ${when}${opp.due_tz ? ` (${opp.due_tz})` : ''} — ${what}.`,
      metadata: { submission_id: s.id, quote_id: s.quote_id, opportunity_id: opp.id, route: `/estimates/${s.quote_id}`, source: 'sal', hours: h },
      created_by: null,
    })
    if (nErr) { details.push({ id: s.id, error: nErr.message }); continue }
    await sb.from('bid_submissions').update({ reminders: [...(s.reminders || []), ...due], updated_at: now.toISOString() }).eq('id', s.id)
    raised++
    details.push({ id: s.id, hours: due })
  }
  return res.status(200).json({ ok: true, checked: (subs || []).length, raised, details })
}
