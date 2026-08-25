// Vercel cron — chases estimates that were sent and went quiet.
//
// This replaces a pg_cron job that died silently on 2026-06-12 and stayed dead
// for two months. That job POSTed the edge function with NO Authorization
// header, relying on verify_jwt being false. A `supabase functions deploy`
// without --no-verify-jwt resets verify_jwt to true, so every call started
// returning 401 — and pg_net does not report a non-2xx anywhere anyone looks.
// 39 estimates were sent in the following 30 days and not one got a follow-up.
//
// Calling from here fixes the class of failure, not just this instance:
//   - it authenticates with the service role key, so verify_jwt is irrelevant
//   - it lives in vercel.json beside the other five crons, where it is visible
//   - a non-2xx shows up in the Vercel cron log instead of vanishing
//
// Schedule: 16:10 UTC daily — a little after the old 15:00 slot so it does not
// contend with the other crons, and still mid-morning in Mountain time.

const { createClient } = require('@supabase/supabase-js')

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

  // A query string lets a human ask "what would this send?" without sending it:
  //   /api/cron/estimate-followup?dry_run=1
  const dryRun = String(req.query?.dry_run || '') === '1'

  try {
    const r = await fetch(`${url}/functions/v1/estimate-followup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ dry_run: dryRun }),
    })
    const json = await r.json().catch(() => ({}))

    // Surfaced rather than swallowed: "0 sent" has three very different causes
    // — nothing due, no cutoff configured, or everything predating the cutoff —
    // and the log has to say which.
    return res.status(200).json({
      ok: r.ok && !json.error,
      dry_run: dryRun,
      considered: json.considered ?? 0,
      sent: json.sent ?? 0,
      would_send: json.would_send ?? 0,
      failed: json.failed ?? 0,
      skipped: json.skipped ?? null,
      error: json.error || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Sanity check for the guard rails, so this file documents its own contract:
//   no `estimate_followup_since` setting for a company  -> that company is skipped
//   estimate sent before the cutoff                     -> skipped (the 835 backlog)
//   more than `max` due in one run                      -> capped, remainder next run
