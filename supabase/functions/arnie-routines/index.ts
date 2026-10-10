// arnie-routines — runs the standing work whose hour it is.
//
// Called hourly by a Vercel cron (api/cron/arnie-routines.js) with the service
// role key, never by a person. Each routine is due at its own local hour, once
// per local day, so this walks every enabled row and runs the ones whose time
// has come where THEY are.
//
// A cron rather than pg_cron, for the reason migration 20260821120000 records:
// a pg_cron job with no auth header failed silently for two months and 835
// estimates went unchased. Here a non-2xx is visible.

import { dueRoutines, runRoutine } from '../_shared/arnieRoutines.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arnie-internal',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const INTERNAL = Deno.env.get('ARNIE_INTERNAL_KEY') || undefined

  // Only our own scheduler may run other people's routines.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const presented = (req.headers.get('x-arnie-internal') || '').trim()
  const ours = (token && token === SERVICE_KEY) || (INTERNAL && presented === INTERNAL)
  if (!ours) return json({ error: 'not for callers' }, 403)

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const dryRun = body.dry_run === true
  const only = Number(body.routine_id) || null
  const r = { url: SUPABASE_URL, key: SERVICE_KEY, internalKey: INTERNAL }

  try {
    let due = await dueRoutines(r)
    // A single named routine runs whatever the clock says — that is how a
    // person tests one without waiting until tomorrow morning.
    if (only) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/arnie_routines?select=*&id=eq.${only}&limit=1`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      })
      const row = res.ok ? (await res.json().catch(() => []))?.[0] : null
      due = row ? [row] : []
    }

    if (dryRun) {
      return json({ ok: true, dry_run: true, due: due.map((d) => ({ id: d.id, name: d.name, employee_id: d.employee_id, hour_local: d.hour_local, timezone: d.timezone })) })
    }

    const results: Record<string, unknown>[] = []
    for (const routine of due) {
      // One routine failing is not the others' problem.
      try {
        const out = await runRoutine(r, routine)
        results.push({ id: routine.id, name: routine.name, ok: out.ok, error: out.error })
      } catch (e) {
        results.push({ id: routine.id, name: routine.name, ok: false, error: (e as Error)?.message })
      }
    }
    return json({ ok: true, ran: results.length, results })
  } catch (e) {
    return json({ error: (e as Error)?.message || 'routines failed' }, 500)
  }
})
