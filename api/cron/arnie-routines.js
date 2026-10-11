// Vercel cron — the standing work Arnie does on a schedule.
//
// Runs hourly, at :20, so it never lands on top of the morning brief (:05) or
// the nudges (:35). The edge function works out whose hour it is from each
// routine's own timezone and runs those; this file makes the call WITH the
// service role key, for the same reason the other two do (a pg_cron job with
// no auth header failed silently for two months and 835 estimates went
// unchased).
//
// x-arnie-internal rides along because the project carries two valid service
// credentials — the legacy JWT this env holds and the sb_secret_ Supabase
// injects into functions — and an equality check between them does not match.

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
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key }
    if (process.env.ARNIE_INTERNAL_KEY) headers['x-arnie-internal'] = process.env.ARNIE_INTERNAL_KEY
    const r = await fetch(`${url}/functions/v1/arnie-routines`, { method: 'POST', headers, body: '{}' })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(502).json({ error: `arnie-routines ${r.status}`, body })
    const failed = (body.results || []).filter((x) => !x.ok)
    console.log(`arnie-routines: ran ${body.ran}, failed ${failed.length}`)
    if (failed.length) console.error('arnie-routines failures:', JSON.stringify(failed))
    return res.status(200).json(body)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
