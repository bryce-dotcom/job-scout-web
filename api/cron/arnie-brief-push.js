// Vercel cron — sends the morning brief to everyone whose hour it is.
//
// Runs hourly. The edge function decides who is due from each person's own
// timezone and chosen hour, so one schedule serves every zone; this file just
// makes the call, WITH the service role key. Not pg_cron: the migration
// 20260821120000_retire_estimate_followup_pgcron.sql records how a pg_cron job
// with no auth header failed silently for two months, and why the crons live
// here, where a non-2xx shows up in the Vercel log.
//
// A few minutes past the hour so a person who set "6" gets it at 6:05, not a
// second before six by the server's clock.

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
    const r = await fetch(`${url}/functions/v1/arnie-brief-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      body: '{}',
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(502).json({ error: `arnie-brief-push ${r.status}`, body })
    const failed = (body.results || []).filter((x) => x.error)
    console.log(`arnie-brief-push: checked ${body.checked}, due ${body.due}, sent ${(body.results || []).filter((x) => x.sent).length}, failed ${failed.length}`)
    if (failed.length) console.error('arnie-brief-push failures:', JSON.stringify(failed))
    return res.status(200).json(body)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
