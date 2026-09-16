// Vercel cron — Arnie's nudges between morning briefs.
//
// Runs hourly, a bit later than the brief so the two never land together.
// The edge function decides who gets what from each person's own zone and
// quiet hours; this file makes the call WITH the service role key, for the
// same reason api/cron/arnie-brief-push.js does (a pg_cron job with no auth
// header failed silently for two months).

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })

  try {
    const r = await fetch(`${url}/functions/v1/arnie-nudge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      body: '{}',
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(502).json({ error: `arnie-nudge ${r.status}`, body })
    const failed = (body.results || []).filter((x) => x.error)
    console.log(`arnie-nudge: checked ${body.checked}, considered ${body.considered}, sent ${body.sent}, failed ${failed.length}`)
    if (failed.length) console.error('arnie-nudge failures:', JSON.stringify(failed))
    return res.status(200).json(body)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
