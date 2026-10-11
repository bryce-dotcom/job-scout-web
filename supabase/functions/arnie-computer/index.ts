// arnie-computer — the rail between Arnie and the agent on a person's machine.
//
// Phase 0 of "Arnie On Your Computer" (ARNIE_ON_YOUR_COMPUTER_PLAN.md). Arnie
// already had the brain, the eyes, the approval rails and somewhere to keep a
// learned workflow. This is the part that was missing: hands.
//
// SHAPE. The agent connects OUTWARD and polls. There is no inbound connection
// to the machine, nothing listening on it, and no port to open — which is the
// answer to every IT conversation this feature will ever have, so it is the
// design and not an optimisation.
//
//   hello   the agent announces a machine and gets a session
//   next    the agent asks for the next action, if any
//   report  the agent says what happened
//   queue   Arnie (or a person) asks for an action to be done
//   stop    the kill switch: this session does nothing more, ever
//   grants  what this person has allowed, and granting/revoking it
//
// IDENTITY. Every route is the EMPLOYEE's own session token — resolveCaller,
// the same identity rule as the rest of Arnie — never the service key and
// never a company_id from the body. An agent runs as one person on one machine
// and can only ever reach that person's own sessions and grants. That is what
// makes "per user" structural: there is no route here that could act for
// somebody else even if it wanted to.
//
// THE LEASH. Every queued action is decided by _shared/computerGrants.ts and
// written to arnie_computer_actions BEFORE the agent sees it — refusals
// included, because "Arnie tried to type into a password box" is exactly the
// line an admin needs to be able to find. The agent runs the SAME module
// locally; this copy is the audit and the second opinion, not the only check.

import { resolveCaller } from '../_shared/auth.ts'
import { decideAction, type Grant } from '../_shared/computerGrants.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// How long without a poll before a session is not really there. The app says
// "Arnie is not on your computer right now" rather than queueing into a void.
const STALE_SECONDS = 90

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // The person's own token, always. No service-key path and no as_employee_id:
  // nothing should ever be able to drive somebody else's computer, including us.
  const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
  if (!caller?.companyId || !caller.employeeId) {
    return json({ error: 'Sign in to use this.' }, 401)
  }
  const me = caller.employeeId
  const company = caller.companyId

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action || '')

  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { ...H, ...(init.method && init.method !== 'GET' ? { Prefer: 'return=representation' } : {}) },
    })
    const text = await res.text()
    const parsed = text ? JSON.parse(text) : []
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`)
    return parsed
  }

  // Grants are read as the employee EVERY time an action is decided, never
  // cached on the session. Revoking has to take effect on the next action, not
  // on the next reconnect — otherwise "I took that back" is a lie.
  const myGrants = async (): Promise<Grant[]> =>
    await rest(`arnie_computer_grants?select=app,host,tier,duration,expires_at,revoked_at,consumed_at&employee_id=eq.${me}&revoked_at=is.null`)

  const mySession = async (id: unknown) => {
    const n = Number(id)
    if (!Number.isFinite(n) || n <= 0) return null
    // employee_id in the filter is the whole point: a session id from another
    // person simply does not resolve.
    const rows = await rest(`arnie_computer_sessions?select=id,status,employee_id,company_id&id=eq.${n}&employee_id=eq.${me}&limit=1`)
    return rows?.[0] || null
  }

  try {
    // ── the agent announces itself ───────────────────────────────────────
    if (action === 'hello') {
      const rows = await rest('arnie_computer_sessions', {
        method: 'POST',
        body: JSON.stringify({
          company_id: company,
          employee_id: me,
          device_label: String(body.device_label || '').slice(0, 120) || null,
          platform: String(body.platform || '').slice(0, 60) || null,
          agent_version: String(body.agent_version || '').slice(0, 40) || null,
        }),
      })
      return json({ ok: true, session_id: rows?.[0]?.id, grants: await myGrants(), poll_seconds: 3 })
    }

    // ── the agent asks for work ──────────────────────────────────────────
    if (action === 'next') {
      const session = await mySession(body.session_id)
      if (!session) return json({ error: 'No session of yours by that id.' }, 404)
      // A stopped session is dead and stays dead. The person stopped it; only
      // they can start another, from the machine.
      if (session.status !== 'live') return json({ ok: true, stopped: true, action: null })

      await rest(`arnie_computer_sessions?id=eq.${session.id}`, {
        method: 'PATCH', body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      })
      const queued = await rest(`arnie_computer_actions?select=id,kind,app,host,target&session_id=eq.${session.id}&decision=eq.queued&order=id&limit=1`)
      return json({ ok: true, action: queued?.[0] || null })
    }

    // ── the agent says what happened ─────────────────────────────────────
    if (action === 'report') {
      const session = await mySession(body.session_id)
      if (!session) return json({ error: 'No session of yours by that id.' }, 404)
      const id = Number(body.action_id)
      if (!Number.isFinite(id)) return json({ error: 'action_id is required' }, 400)
      // Scoped to this session as well as this id, so a report cannot stamp
      // somebody else's action row.
      const rows = await rest(`arnie_computer_actions?id=eq.${id}&session_id=eq.${session.id}&decision=eq.queued`, {
        method: 'PATCH',
        body: JSON.stringify({
          // The agent may only ever report one of these two. It cannot promote
          // its own action to 'allowed' if the server refused it — the server
          // already wrote that refusal and never queued it.
          decision: body.ok === true ? 'allowed' : 'failed',
          reason: body.ok === true ? null : String(body.error || '').slice(0, 500) || null,
          result: body.result ?? null,
          shot_before: typeof body.shot_before === 'string' ? body.shot_before : null,
          shot_after: typeof body.shot_after === 'string' ? body.shot_after : null,
          completed_at: new Date().toISOString(),
        }),
      })
      if (!rows?.length) return json({ error: 'That action is not queued on this session.' }, 409)
      return json({ ok: true })
    }

    // ── somebody asks for an action ──────────────────────────────────────
    if (action === 'queue') {
      const session = await mySession(body.session_id)
      if (!session) return json({ error: 'No session of yours by that id.' }, 404)
      if (session.status !== 'live') return json({ error: 'Arnie is not on that computer right now.' }, 409)

      const fresh = await rest(`arnie_computer_sessions?select=last_seen_at&id=eq.${session.id}&limit=1`)
      const seen = new Date(fresh?.[0]?.last_seen_at || 0).getTime()
      if (Date.now() - seen > STALE_SECONDS * 1000) {
        return json({ error: 'Arnie is not on that computer right now — the agent has not checked in.' }, 409)
      }

      const want = {
        kind: String(body.kind || ''),
        app: body.app ? String(body.app) : null,
        host: body.host ? String(body.host) : null,
        target: (body.target ?? null) as Record<string, unknown> | null,
      }
      const verdict = decideAction(want, await myGrants())

      // Refused and awaiting-human are RECORDED, not dropped. A refusal is a
      // row for the same reason an action is: an admin asking "what has Arnie
      // been trying to do on Cole's machine" deserves a real answer.
      const row = {
        company_id: company,
        employee_id: me,
        session_id: session.id,
        routine_id: Number(body.routine_id) || null,
        kind: want.kind,
        app: want.app,
        host: want.host,
        // Never persist a value for a typing action. The decision above
        // already refused a credential field, but a plain note typed into a
        // plain box is still the person's text and has no business in an audit
        // table — length is all the log needs.
        target: want.target
          ? { ...want.target, value: undefined, text_length: typeof body.value === 'string' ? body.value.length : undefined }
          : null,
        decision: verdict.ok ? 'queued' : ('refuse' in verdict ? 'refused' : 'awaiting_human'),
        reason: verdict.ok ? null : ('refuse' in verdict ? verdict.refuse : verdict.needsHuman),
        completed_at: verdict.ok ? null : new Date().toISOString(),
      }
      const made = await rest('arnie_computer_actions', { method: 'POST', body: JSON.stringify(row) })

      if (!verdict.ok) {
        return json({
          ok: false,
          action_id: made?.[0]?.id,
          decision: row.decision,
          reason: row.reason,
        })
      }

      // A one-shot grant is spent the moment it is used for real.
      if (verdict.tier && want.app) {
        await rest(`arnie_computer_grants?employee_id=eq.${me}&app=eq.${encodeURIComponent(want.app)}&duration=eq.once&consumed_at=is.null&revoked_at=is.null`, {
          method: 'PATCH', body: JSON.stringify({ consumed_at: new Date().toISOString() }),
        }).catch(() => { /* nothing to spend */ })
      }
      return json({ ok: true, action_id: made?.[0]?.id, decision: 'queued' })
    }

    // ── the kill switch ─────────────────────────────────────────────────
    if (action === 'stop') {
      const session = await mySession(body.session_id)
      if (!session) return json({ error: 'No session of yours by that id.' }, 404)
      await rest(`arnie_computer_sessions?id=eq.${session.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'stopped', ended_at: new Date().toISOString() }),
      })
      // Anything still waiting is refused, not left to run when the agent next
      // polls. "Stop" has to mean stopped, including the queue.
      await rest(`arnie_computer_actions?session_id=eq.${session.id}&decision=eq.queued`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'refused', reason: 'You stopped Arnie on this computer.', completed_at: new Date().toISOString() }),
      })
      return json({ ok: true, stopped: true })
    }

    // ── what am I allowed to touch ───────────────────────────────────────
    if (action === 'grants') return json({ ok: true, grants: await myGrants() })

    if (action === 'grant') {
      const app = String(body.app || '').trim().toLowerCase()
      const host = String(body.host || '*').trim().toLowerCase() || '*'
      const tier = String(body.tier || 'watch')
      const duration = body.duration === 'once' ? 'once' : 'always'
      if (!app) return json({ error: 'Which program?' }, 400)
      if (!['watch', 'click', 'full'].includes(tier)) return json({ error: 'tier must be watch, click or full' }, 400)
      // Granting is the person's own act, for their own machine. There is no
      // route by which one employee grants another — see the header.
      const made = await rest('arnie_computer_grants', {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({
          company_id: company, employee_id: me, app, host, tier, duration,
          granted_at: new Date().toISOString(),
          expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
          revoked_at: null, consumed_at: null, updated_at: new Date().toISOString(),
        }),
      })
      return json({ ok: true, grant: made?.[0] || null })
    }

    if (action === 'revoke') {
      const app = String(body.app || '').trim().toLowerCase()
      if (!app) return json({ error: 'Which program?' }, 400)
      const host = body.host === undefined ? null : String(body.host || '*').trim().toLowerCase()
      const q = `arnie_computer_grants?employee_id=eq.${me}&app=eq.${encodeURIComponent(app)}&revoked_at=is.null` +
        (host === null ? '' : `&host=eq.${encodeURIComponent(host)}`)
      const gone = await rest(q, { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }) })
      return json({ ok: true, revoked: gone?.length || 0 })
    }

    return json({ error: `unknown action: ${action || '(none)'}` }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 400) }, 500)
  }
})
