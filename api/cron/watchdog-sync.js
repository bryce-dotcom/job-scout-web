// Vercel cron — pull fleet telemetry into Postgres on a schedule.
//
// Why this exists: watchdog-sync has been deployed and working, but nothing
// ever called it. Every position, trip and hour reading in the database came
// from a hand-run curl. Left that way the fleet map, the hour meters and
// anything built on them quietly freeze at whatever the last manual run
// captured, while still rendering as live data — the worst failure shape,
// because nothing looks broken.
//
// It also loses history that cannot be recovered. Watchdog returns only the
// most recent ~30 ignition events per device; anything not captured before it
// rolls off is gone for good. On a busy machine that window can be a single
// day. The sync is what turns a rolling 30-event peephole into a permanent
// hour meter, so the schedule is not a convenience — it is the data.
//
// Every 15 minutes: frequent enough that the events window can't roll past us
// on a machine cycling its ignition all day, and cheap because platform mode
// pulls once for every tenant at a time (one /devices call plus one per linked
// device), not once per company.

const CRON_TIMEOUT_MS = 60_000

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
  if (!url || !key) {
    return res.status(500).json({ error: 'VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' })
  }

  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CRON_TIMEOUT_MS)

  try {
    const upstream = await fetch(`${url}/functions/v1/watchdog-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cron: true }),
      signal: controller.signal,
    })

    const text = await upstream.text()
    let body = null
    try { body = JSON.parse(text) } catch { /* keep the raw text below */ }

    // A sync that ran but failed still returns 200 from the function, with
    // ok:false in the payload. Surface that as a non-2xx here so it shows up
    // in Vercel's cron log as a failure rather than a green tick — a silent
    // "ran fine, synced nothing" is what let the data go stale in the first
    // place.
    const ok = upstream.ok && body?.ok !== false
    return res.status(ok ? 200 : 502).json({
      ok,
      ms: Date.now() - started,
      upstreamStatus: upstream.status,
      result: body ?? text.slice(0, 500),
    })
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return res.status(aborted ? 504 : 500).json({
      ok: false,
      ms: Date.now() - started,
      error: aborted ? `timed out after ${CRON_TIMEOUT_MS}ms` : (err?.message || String(err)),
    })
  } finally {
    clearTimeout(timer)
  }
}
