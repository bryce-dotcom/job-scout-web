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
import {
  appNames, approvalExpiry, decideWithRules, hasExpired, TIER_RANK, type Grant, type Rule,
} from '../_shared/computerGrants.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// How long without a poll before a session is not really there. The app says
// "Arnie is not on your computer right now" rather than queueing into a void.
const STALE_SECONDS = 90

// Ten minutes, the ceiling Grok uses, for the reason their docs give: a
// demonstration longer than this is two skills that have not been separated
// yet. It is also how long somebody can forget they left the recorder on.
const TEACH_MAX_SECONDS = 600

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

  // NEVER A REAL COMPUTER ON THE PUBLIC DEMO.
  //
  // The demo's password is printed on the login page so anyone can explore
  // it. A computer paired to it could be driven by anyone who opens the
  // demo. On 2026-10-14 London's Mac did exactly that — his browser was
  // signed in to the demo when the agent asked him to press Connect. So
  // pairing and starting a session are refused for it outright, and the
  // agent, told `repair`, throws the demo sign-in away and pairs afresh.
  if (String(caller.email || '').toLowerCase() === 'demo@jobscout.app' && ['hello', 'pair_claim'].includes(action)) {
    return json({ error: 'This browser is signed in to the JobScout demo, which cannot have a computer. Sign in as yourself, then press Connect.', repair: true }, 403)
  }

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
    await rest(`arnie_computer_grants?select=app,host,tier,duration,expires_at,revoked_at,consumed_at,consumed_by&employee_id=eq.${me}&revoked_at=is.null`)

  // The company's rules and this person's own, in one list. The decision
  // module settles conflicts (ask-first wins), so there is nothing to merge
  // here — and nothing that could accidentally drop a company rule.
  const myRules = async (): Promise<Rule[]> =>
    await rest(`arnie_computer_rules?select=kind,employee_id,app,host,action_kind,note&company_id=eq.${company}&or=(employee_id.is.null,employee_id.eq.${me})`)

  const mySession = async (id: unknown) => {
    const n = Number(id)
    if (!Number.isFinite(n) || n <= 0) return null
    // employee_id in the filter is the whole point: a session id from another
    // person simply does not resolve.
    const rows = await rest(`arnie_computer_sessions?select=id,status,employee_id,company_id&id=eq.${n}&employee_id=eq.${me}&limit=1`)
    return rows?.[0] || null
  }

  /** Anything that ran out of time stops being answerable. */
  const expireStale = async (sessionId: number) => {
    const now = new Date().toISOString()
    await rest(
      `arnie_computer_actions?session_id=eq.${sessionId}&decision=eq.needs_approval&expires_at=lt.${now}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'expired', completed_at: now, reason: 'Nobody answered in time, so it did not run.' }),
      },
    ).catch(() => { /* nothing stale */ })
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
          // A hash of the agent's own sources. The version is for people;
          // this is what tells a stale copy from a current one.
          agent_build: String(body.agent_build || '').slice(0, 40) || null,
          // What this machine can actually do, in its own words. Without it a
          // Mac that cannot watch a screen looks identical to one that can,
          // and the only place the difference was ever stated was a terminal
          // window the person closed. Shape-checked rather than trusted: it
          // arrives from a program running on somebody's computer.
          capabilities: body.capabilities && typeof body.capabilities === 'object'
            ? {
              perform: (body.capabilities as Record<string, unknown>).perform === true,
              record: (body.capabilities as Record<string, unknown>).record === true,
              notes: Array.isArray((body.capabilities as Record<string, unknown>).notes)
                ? ((body.capabilities as Record<string, unknown>).notes as unknown[])
                  .filter((n) => typeof n === 'string').slice(0, 6).map((n) => String(n).slice(0, 300))
                : [],
              // Which of the Mac's switches are on, as macOS told the agent:
              // true, false, or null for "could not tell". Nothing else kept.
              permissions: (() => {
                const p = (body.capabilities as Record<string, unknown>).permissions as Record<string, unknown> | undefined
                if (!p || typeof p !== 'object') return {}
                const tri = (v: unknown) => (v === true ? true : v === false ? false : null)
                return { screen: tri(p.screen), accessibility: tri(p.accessibility) }
              })(),
              // Can this computer's launcher pick up new builds by itself?
              self_update: (body.capabilities as Record<string, unknown>).self_update === true,
            }
            : null,
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
      // Sweep anything nobody answered in time, before handing out work. The
      // agent polls every few seconds, so this is the cheapest reliable place
      // to do it — no cron, and an expiry can never be missed while the agent
      // that would have run the action is alive.
      await expireStale(session.id)
      const queued = await rest(`arnie_computer_actions?select=id,kind,app,host,target&session_id=eq.${session.id}&decision=eq.queued&order=id&limit=1`)

      // A 'type' carries its text from the side table — handed over ONCE, and
      // deleted as it goes. Anything never collected is swept after an hour.
      // Never allowed to break the poll: a failure here costs one empty
      // 'type', a failure of the poll costs the whole agent.
      const next = queued?.[0]
      if (next?.kind === 'type') {
        try {
          const [held] = await rest(`arnie_computer_pending_text?select=value&action_id=eq.${next.id}&employee_id=eq.${me}&limit=1`) || []
          if (held) {
            next.target = { ...(next.target || {}), value: held.value }
            await rest(`arnie_computer_pending_text?action_id=eq.${next.id}`, { method: 'DELETE' })
          }
        } catch (e) { console.warn('[arnie-computer] pending text unavailable:', String(e).slice(0, 200)) }
      }
      await rest(`arnie_computer_pending_text?employee_id=eq.${me}&created_at=lt.${new Date(Date.now() - 3600_000).toISOString()}`, { method: 'DELETE' }).catch(() => {})

      // Is this person teaching right now? The agent is the only thing that
      // can watch a screen, so it has to be told — and told to STOP, because
      // a recording with no ceiling is a recording somebody forgot about.
      const [rec] = await rest(`arnie_skills?select=id,name,outcome,recording_started_at&employee_id=eq.${me}&status=eq.recording&limit=1`)
      let recording = null
      if (rec) {
        const started = rec.recording_started_at ? new Date(rec.recording_started_at).getTime() : Date.now()
        const left = Math.round((started + TEACH_MAX_SECONDS * 1000 - Date.now()) / 1000)
        if (left <= 0) {
          // Out of time. Move it to a draft so the person still gets whatever
          // they demonstrated rather than losing it.
          await rest(`arnie_skills?id=eq.${rec.id}&status=eq.recording`, {
            method: 'PATCH', body: JSON.stringify({ status: 'draft', updated_at: new Date().toISOString() }),
          })
        } else {
          recording = { skill_id: rec.id, name: rec.name, outcome: rec.outcome, seconds_left: left }
          if (!rec.recording_started_at) {
            await rest(`arnie_skills?id=eq.${rec.id}`, { method: 'PATCH', body: JSON.stringify({ recording_started_at: new Date().toISOString() }) })
          }
        }
      }

      // The handoff pauses the recorder: nothing is captured while Arnie is
      // waiting on somebody to sign in, so a password cannot reach a
      // screenshot. The agent enforces it; this is the signal.
      const [handoff] = await rest(`arnie_computer_actions?select=id&session_id=eq.${session.id}&decision=eq.awaiting_human&completed_at=is.null&limit=1`)

      return json({ ok: true, action: queued?.[0] || null, recording, hold_recorder: !!handoff })
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
    //
    // ONE path, used by 'queue' and by accepting an offer. Accepting used to
    // be the obvious place to write a second, shorter version of this — and a
    // second copy of a permission decision is this project's oldest failure
    // mode, because the two copies disagreeing is indistinguishable from a
    // bypass. So accepting grants, then comes back through here.
    const placeAction = async (
      sessionId: number,
      want: { kind: string; app: string | null; host: string | null; target: Record<string, unknown> | null },
      opts: { background: boolean; routineId: number | null; valueLength?: number; value?: string },
    ) => {
      const [gs, rs] = await Promise.all([myGrants(), myRules()])
      const verdict = decideWithRules(want, gs, rs)
      const background = opts.background

      // Refused and awaiting-human are RECORDED, not dropped. A refusal is a
      // row for the same reason an action is: an admin asking "what has Arnie
      // been trying to do on Cole's machine" deserves a real answer.
      const row = {
        company_id: company,
        employee_id: me,
        session_id: sessionId,
        routine_id: opts.routineId,
        kind: want.kind,
        app: want.app,
        host: want.host,
        // Never persist a value for a typing action. The decision above
        // already refused a credential field, but a plain note typed into a
        // plain box is still the person's text and has no business in an audit
        // table — length is all the log needs.
        target: want.target
          ? { ...want.target, value: undefined, text_length: opts.valueLength }
          : null,
        decision: verdict.ok ? 'queued'
          : 'refuse' in verdict ? 'refused'
          : 'needsHuman' in verdict ? 'awaiting_human'
          : 'needsGrant' in verdict ? 'needs_grant'
          : 'needs_approval',
        reason: verdict.ok ? null
          : 'refuse' in verdict ? verdict.refuse
          : 'needsHuman' in verdict ? verdict.needsHuman
          : 'needsGrant' in verdict ? verdict.needsGrant.why
          : verdict.needsApproval,
        // The tier the offer is asking for — the narrowest that can do this
        // kind. Stored so that accepting is one tap and cannot widen into
        // something the action never needed.
        wants_tier: !verdict.ok && 'needsGrant' in verdict ? verdict.needsGrant.tier : null,
        // A refusal is finished the moment it is written. An approval is not:
        // it is waiting for a person, and if it came from standing work it
        // stops being answerable after about ten minutes. needsHuman never
        // expires because it is not a question — Arnie will never do that one.
        expires_at: !verdict.ok && ('needsApproval' in verdict || 'needsGrant' in verdict)
          ? approvalExpiry({ background }) : null,
        completed_at: !verdict.ok && 'refuse' in verdict ? new Date().toISOString() : null,
      }
      const made = await rest('arnie_computer_actions', { method: 'POST', body: JSON.stringify(row) })

      // The text itself, kept apart from the log until the agent collects it.
      // Without this, every 'type' reached the agent empty and "succeeded".
      // Not for a refusal (it will never run) nor a handoff (theirs to type).
      const madeId = made?.[0]?.id
      if (want.kind === 'type' && typeof opts.value === 'string' && opts.value && madeId
        && ['queued', 'needs_grant', 'needs_approval'].includes(row.decision)) {
        await rest('arnie_computer_pending_text', {
          method: 'POST',
          body: JSON.stringify({ action_id: madeId, company_id: company, employee_id: me, value: opts.value.slice(0, 5000) }),
        }).catch((e) => console.warn('[arnie-computer] could not hold the text:', String(e).slice(0, 200)))
      }

      // A one-shot grant is spent the moment it is used for real — and it
      // records WHICH action spent it. Without that the agent, checking the
      // leash again a second later on its own machine, saw a consumed grant
      // and refused the very action it had just been allowed to do.
      if (verdict.ok && verdict.tier && want.app && made?.[0]?.id) {
        await rest(`arnie_computer_grants?employee_id=eq.${me}&app=eq.${encodeURIComponent(want.app)}&duration=eq.once&consumed_at=is.null&revoked_at=is.null`, {
          method: 'PATCH',
          body: JSON.stringify({ consumed_at: new Date().toISOString(), consumed_by: made[0].id }),
        }).catch(() => { /* nothing to spend */ })
      }

      return {
        ok: verdict.ok,
        action_id: made?.[0]?.id as number | undefined,
        decision: row.decision,
        reason: row.reason,
        wants: !verdict.ok && 'needsGrant' in verdict ? verdict.needsGrant : null,
      }
    }

    /** The session to act on, or a reply explaining why there isn't one. */
    const liveSession = async (id: unknown) => {
      const session = await mySession(id)
      if (!session) return { error: json({ error: 'No session of yours by that id.' }, 404) }
      if (session.status !== 'live') return { error: json({ error: 'Arnie is not on that computer right now.' }, 409) }
      const fresh = await rest(`arnie_computer_sessions?select=last_seen_at&id=eq.${session.id}&limit=1`)
      const seen = new Date(fresh?.[0]?.last_seen_at || 0).getTime()
      if (Date.now() - seen > STALE_SECONDS * 1000) {
        return { error: json({ error: 'Arnie is not on that computer right now — the agent has not checked in.' }, 409) }
      }
      return { session }
    }

    if (action === 'queue') {
      const got = await liveSession(body.session_id)
      if (got.error) return got.error

      const want = {
        kind: String(body.kind || ''),
        app: body.app ? String(body.app) : null,
        host: body.host ? String(body.host) : null,
        target: (body.target ?? null) as Record<string, unknown> | null,
      }
      const placed = await placeAction(got.session!.id, want, {
        background: Number(body.routine_id) > 0 || body.background === true,
        routineId: Number(body.routine_id) || null,
        valueLength: typeof body.value === 'string' ? body.value.length : undefined,
        value: typeof body.value === 'string' ? body.value : undefined,
      })
      return json(placed.ok
        ? { ok: true, action_id: placed.action_id, decision: 'queued' }
        : { ok: false, action_id: placed.action_id, decision: placed.decision, reason: placed.reason, wants: placed.wants })
    }

    // ── what does it look like? ─────────────────────────────────────────
    //
    // The one route that lets Arnie SEE. He queues a screenshot, the agent
    // takes it and uploads it, and this hands back a short-lived signed URL
    // for the brain to look at — which is the whole difference between a hand
    // and a hand with eyes.
    //
    // The picture is never public and never guessable: a private bucket, a
    // URL that dies in two minutes, and only for an action belonging to the
    // person asking. It is a photograph of somebody's working screen, with
    // whatever customer happened to be on it.
    if (action === 'shot') {
      const id = Number(body.action_id)
      if (!Number.isFinite(id)) return json({ error: 'action_id is required' }, 400)
      const [row] = await rest(
        `arnie_computer_actions?select=id,decision,shot_after,reason,completed_at&id=eq.${id}&employee_id=eq.${me}&limit=1`,
      )
      if (!row) return json({ error: 'No action of yours by that id.' }, 404)
      // Still with the agent: say so rather than returning a blank, so the
      // caller knows to wait instead of concluding there is nothing to see.
      if (!row.completed_at) return json({ ok: true, status: 'working' })
      if (!row.shot_after) {
        return json({ ok: true, status: 'nothing', decision: row.decision, reason: row.reason })
      }

      const signed = await fetch(
        `${SUPABASE_URL}/storage/v1/object/sign/arnie-recordings/${row.shot_after}`,
        { method: 'POST', headers: H, body: JSON.stringify({ expiresIn: 120 }) },
      )
      if (!signed.ok) return json({ error: 'That picture could not be opened.' }, 500)
      const { signedURL } = await signed.json()
      return json({ ok: true, status: 'ready', url: `${SUPABASE_URL}/storage/v1${signedURL}`, decision: row.decision })
    }

    // ── a person accepts an offer ───────────────────────────────────────
    //
    // "Arnie offers, you accept." The permission and the thing it is for
    // arrive together, which is the only moment either of them means
    // anything: "allow Chrome on rockymountainpower.net" answered in a
    // settings form is a question nobody can weigh.
    //
    // It writes the grant and then goes back through placeAction, so the leash
    // decides again with the new grant in hand. Accepting does not mark the
    // action allowed — it cannot: a tier might still not cover the kind, or a
    // rule might still say ask first. The offer row is closed and a fresh row
    // carries the verdict, which keeps the log readable as what happened
    // rather than what was intended.
    if (action === 'accept_offer') {
      const id = Number(body.action_id)
      if (!Number.isFinite(id)) return json({ error: 'action_id is required' }, 400)
      const duration = body.duration === 'always' ? 'always' : 'once'

      const [offer] = await rest(
        `arnie_computer_actions?select=id,session_id,kind,app,host,target,decision,wants_tier,expires_at` +
        `&id=eq.${id}&employee_id=eq.${me}&limit=1`,
      )
      if (!offer) return json({ error: 'No offer of yours by that id.' }, 404)
      if (offer.decision !== 'needs_grant') return json({ error: 'That one is not waiting on a permission.' }, 409)
      if (hasExpired(offer)) {
        await rest(`arnie_computer_actions?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ decision: 'expired', completed_at: new Date().toISOString() }),
        })
        return json({ error: 'That offer timed out. Ask him again and he will offer afresh.' }, 410)
      }

      const got = await liveSession(offer.session_id)
      if (got.error) return got.error

      const app = String(offer.app || '').toLowerCase()
      const host = String(offer.host || '*').toLowerCase() || '*'
      const tier = String(offer.wants_tier || 'watch')
      if (!app) return json({ error: 'That offer names no program.' }, 409)
      if (!['watch', 'click', 'full'].includes(tier)) return json({ error: 'That offer asks for an unknown tier.' }, 409)

      const nowIso = new Date().toISOString()
      // Retire anything NARROWER on the same program and site first.
      //
      // Without this the Allow button can appear to do nothing, and that is
      // not hypothetical: an offer is now raised when a level is too narrow
      // as well as when nothing is granted, and the narrowest grant in force
      // wins. Allowing "click" while an old "watch" sat beside it would leave
      // watch in charge and refuse the very action just approved.
      const existing: Grant[] = await rest(
        `arnie_computer_grants?select=id,tier&employee_id=eq.${me}&app=eq.${encodeURIComponent(app)}&host=eq.${encodeURIComponent(host)}&revoked_at=is.null`,
      ) || []
      for (const old of existing) {
        if (TIER_RANK[old.tier] >= TIER_RANK[tier as Grant['tier']]) continue
        await rest(`arnie_computer_grants?id=eq.${(old as Grant & { id: number }).id}`, {
          method: 'PATCH', body: JSON.stringify({ revoked_at: nowIso, updated_at: nowIso }),
        })
      }

      await rest('arnie_computer_grants', {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({
          company_id: company, employee_id: me, app, host, tier, duration,
          granted_at: nowIso, expires_at: null,
          revoked_at: null, consumed_at: null, updated_at: nowIso,
        }),
      })

      // The text asked for with the offer travels to the action it becomes.
      const [held] = offer.kind === 'type'
        ? await rest(`arnie_computer_pending_text?select=value&action_id=eq.${id}&employee_id=eq.${me}&limit=1`).catch(() => []) || []
        : []
      const placed = await placeAction(got.session!.id, {
        kind: offer.kind, app: offer.app, host: offer.host, target: offer.target,
      }, { background: false, routineId: null, value: held?.value, valueLength: held?.value?.length })
      if (held) await rest(`arnie_computer_pending_text?action_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})

      await rest(`arnie_computer_actions?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision: 'allowed',
          reason: `You allowed ${app}${host && host !== '*' ? ` on ${host}` : ''} — ${tier}${duration === 'once' ? ', once' : ''}.`,
          result: { accepted_as: placed.action_id, granted: { app, host, tier, duration } },
          completed_at: new Date().toISOString(),
        }),
      })

      return json({
        ok: placed.ok,
        granted: { app, host, tier, duration },
        action_id: placed.action_id,
        decision: placed.decision,
        reason: placed.reason,
      })
    }

    // ── the person presses Connect ──────────────────────────────────────
    // The act of consent that pairs a computer. It lives HERE, on the
    // authenticated rail, rather than on the public pairing function: that
    // one is reachable without a session, and resolveCaller only decodes a
    // JWT rather than verifying it, so a claim route out there would take a
    // forged token naming anybody.
    if (action === 'pair_claim') {
      const code = String(body.code || '')
      const refresh = String(body.refresh_token || '')
      if (!code || !refresh) return json({ error: 'code and refresh_token are required' }, 400)

      const rows = await rest(`arnie_pairings?select=code,expires_at,claimed_at&code=eq.${encodeURIComponent(code)}&limit=1`)
      const row = rows?.[0]
      if (!row) return json({ error: 'Nothing is waiting on that code — start the agent again.' }, 404)
      if (new Date(row.expires_at) <= new Date()) return json({ error: 'That request timed out. Start the agent again.' }, 410)
      if (row.claimed_at) return json({ error: 'That computer is already connected.' }, 409)

      // claimed_at in the filter as well as the check: two taps on a slow
      // phone must not both attach a token.
      const done = await rest(`arnie_pairings?code=eq.${encodeURIComponent(code)}&claimed_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({
          refresh_token: refresh,
          company_id: company,
          employee_id: me,
          claimed_at: new Date().toISOString(),
        }),
      })
      if (!done?.length) return json({ error: 'That computer is already connected.' }, 409)
      return json({ ok: true })
    }

    // ── the recorder reports what it saw ────────────────────────────────
    // One row per observation, never an append to a jsonb column: a ten-minute
    // demonstration is hundreds of events arriving one at a time from a laptop,
    // and read-modify-write loses every one that arrives alongside another.
    if (action === 'observe') {
      const skillId = Number(body.skill_id)
      if (!Number.isFinite(skillId)) return json({ error: 'skill_id is required' }, 400)
      // Only into a recording of your own, and only while it IS recording.
      const [skill] = await rest(`arnie_skills?select=id,status&id=eq.${skillId}&employee_id=eq.${me}&limit=1`)
      if (!skill) return json({ error: 'No recording of yours by that id.' }, 404)
      if (skill.status !== 'recording') return json({ error: 'That recording has stopped.' }, 409)

      const list = Array.isArray(body.observations) ? body.observations : [body]
      const rows = list.slice(0, 200).map((o: Record<string, unknown>) => ({
        company_id: company,
        skill_id: skillId,
        seq: Number(o.seq) || 0,
        at: typeof o.at === 'string' ? o.at : new Date().toISOString(),
        app: o.app ? String(o.app).slice(0, 80) : null,
        window_title: o.window_title ? String(o.window_title).slice(0, 300) : null,
        kind: String(o.kind || 'click'),
        x: Number.isFinite(Number(o.x)) ? Math.round(Number(o.x)) : null,
        y: Number.isFinite(Number(o.y)) ? Math.round(Number(o.y)) : null,
        // Length only. What somebody typed during a demonstration is their
        // own and a customer's, and it has no business in a step list.
        text_length: Number.isFinite(Number(o.text_length)) ? Number(o.text_length) : null,
        key_name: o.key_name ? String(o.key_name).slice(0, 24) : null,
        shot_path: o.shot_path ? String(o.shot_path).slice(0, 300) : null,
      }))
      // Duplicates are expected: the agent retries a batch it is not sure
      // landed. The unique index on (skill_id, seq) makes that harmless.
      await fetch(`${SUPABASE_URL}/rest/v1/arnie_skill_observations?on_conflict=skill_id,seq`, {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
      return json({ ok: true, taken: rows.length })
    }

    // ── the recording stops ─────────────────────────────────────────────
    if (action === 'teach_stop') {
      const skillId = Number(body.skill_id)
      const [skill] = await rest(`arnie_skills?select=id,status&id=eq.${skillId}&employee_id=eq.${me}&limit=1`)
      if (!skill) return json({ error: 'No recording of yours by that id.' }, 404)
      await rest(`arnie_skills?id=eq.${skillId}&status=eq.recording`, {
        method: 'PATCH', body: JSON.stringify({ status: 'draft', updated_at: new Date().toISOString() }),
      })
      const seen = await rest(`arnie_skill_observations?select=id&skill_id=eq.${skillId}`)
      return json({ ok: true, observations: seen.length })
    }

    // ── a person answers an ask-first ───────────────────────────────────
    // Only 'needs_approval' is answerable. An 'awaiting_human' row — a
    // password box, a Submit button — is NOT a question and this route will
    // not take it, which is what stops "Approve" ever becoming a button that
    // types a credential.
    if (action === 'approve' || action === 'deny') {
      const id = Number(body.action_id)
      if (!Number.isFinite(id)) return json({ error: 'action_id is required' }, 400)
      const rows = await rest(`arnie_computer_actions?select=id,decision,expires_at,employee_id&id=eq.${id}&employee_id=eq.${me}&limit=1`)
      const row = rows?.[0]
      if (!row) return json({ error: 'No action of yours by that id.' }, 404)
      // Saying NO is the same act whether he was asking for an approval or
      // for a permission, so it is one route. Saying YES is not: an offer
      // needs a grant written, which is accept_offer's whole job.
      const answerable = action === 'deny'
        ? ['needs_approval', 'needs_grant']
        : ['needs_approval']
      if (!answerable.includes(row.decision)) {
        return json({ error: row.decision === 'awaiting_human'
          ? 'That one is yours to do — Arnie will not do it however it is approved.'
          : row.decision === 'needs_grant'
            ? 'That one is waiting on a permission, not an approval — allow the program and it runs.'
            : `That action is ${row.decision}, not waiting on you.` }, 409)
      }
      if (hasExpired(row)) {
        await expireStale(Number(body.session_id) || 0)
        return json({ error: 'That one ran out of time. Ask again and it will be re-drafted.' }, 409)
      }
      const now = new Date().toISOString()
      await rest(`arnie_computer_actions?id=eq.${id}&decision=eq.${row.decision}`, {
        method: 'PATCH',
        body: JSON.stringify(action === 'approve'
          // Approved goes back in the queue for the agent to pick up, and
          // stops expiring — a person has now said yes to it.
          ? { decision: 'queued', expires_at: null, reason: null }
          : { decision: 'refused', reason: 'You said no to this one.', completed_at: now }),
      })
      return json({ ok: true, decision: action === 'approve' ? 'queued' : 'refused' })
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

    // Change the level on a program already allowed.
    //
    // Separate from 'grant' because it REPLACES rather than adds, and that is
    // the whole point. Adding is what the Allow box does, and a second grant
    // on the same program does not widen it — the narrowest in force wins, by
    // design, so a stale 'watch' cannot be re-widened by accident. Which left
    // only one way to change a level: revoke, then allow again, in that order,
    // and getting it the wrong way round looked like the app ignoring you.
    // Bryce hit exactly that on his own Chrome.
    if (action === 'set_tier') {
      const apps = appNames(String(body.app || ''))
      const host = String(body.host || '*').trim().toLowerCase() || '*'
      const tier = String(body.tier || '')
      if (!apps.length) return json({ error: 'Which program?' }, 400)
      if (!['watch', 'click', 'full'].includes(tier)) return json({ error: 'tier must be watch, click or full' }, 400)
      const now = new Date().toISOString()
      for (const app of apps) {
        // Scoped to the same host as well, so a permission for one site is not
        // retired by a change made to another.
        await rest(
          `arnie_computer_grants?employee_id=eq.${me}&app=eq.${encodeURIComponent(app)}&host=eq.${encodeURIComponent(host)}&revoked_at=is.null`,
          { method: 'PATCH', body: JSON.stringify({ revoked_at: now, updated_at: now }) },
        )
      }
      const made = await rest('arnie_computer_grants', {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(apps.map((app) => ({
          company_id: company, employee_id: me, app, host, tier, duration: 'always',
          granted_at: now, expires_at: null, revoked_at: null, consumed_at: null, updated_at: now,
        }))),
      })
      return json({ ok: true, grants: made || [] })
    }

    if (action === 'grant') {
      // One name or several. "chrome, google suite, exel, windows" used to
      // become a single grant called all of that, which matched no program
      // ever — permission that looked granted and did nothing.
      const apps = appNames(String(body.app || ''))
      const host = String(body.host || '*').trim().toLowerCase() || '*'
      const tier = String(body.tier || 'watch')
      const duration = body.duration === 'once' ? 'once' : 'always'
      if (!apps.length) return json({ error: 'Which program?' }, 400)
      if (!['watch', 'click', 'full'].includes(tier)) return json({ error: 'tier must be watch, click or full' }, 400)
      // Granting is the person's own act, for their own machine. There is no
      // route by which one employee grants another — see the header.
      const made = await rest('arnie_computer_grants', {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(apps.map((app) => ({
          company_id: company, employee_id: me, app, host, tier, duration,
          granted_at: new Date().toISOString(),
          expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
          revoked_at: null, consumed_at: null, updated_at: new Date().toISOString(),
        }))),
      })
      // A narrower grant on the same program WINS (grantFor takes the lowest
      // tier, so a stale 'watch' cannot be widened by accident). Said out loud
      // here, because otherwise allowing Chrome at 'full' appears to do
      // nothing and there is no way to tell why.
      const narrower = (await myGrants()).filter((g: Any) =>
        apps.includes(String(g.app).toLowerCase()) &&
        TIER_RANK[String(g.tier) as keyof typeof TIER_RANK] < TIER_RANK[tier as keyof typeof TIER_RANK])
      return json({
        ok: true,
        grants: made || [],
        grant: made?.[0] || null,
        ...(narrower.length
          ? { narrower: narrower.map((g: Any) => ({ app: g.app, tier: g.tier })) }
          : {}),
      })
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
