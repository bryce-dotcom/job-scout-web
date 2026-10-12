// arnie-pair — connecting a computer without anybody copying anything.
//
// The agent's only way in used to be: reveal a token in Settings, copy it,
// open a terminal, paste it into a command. Nobody outside the room that
// built it would ever do that, which made everything in the Computer tab
// unreachable. "It needs to be easy as hell or people won't use it."
//
// Now: run the agent, a browser opens, you press Connect. That is the whole
// flow, and the thing that authorises it is the session you are ALREADY
// signed in to — not a string you typed.
//
// THIS FUNCTION IS PUBLIC, which the rest of Arnie's rails deliberately are
// not, because the agent has no account yet and cannot sign in to ask. So the
// two public routes are built to be safe without a caller identity:
//
//   start — hands out a code. Creates nothing but an empty, expiring row;
//           learns nothing; tells you nothing. The most an attacker gets by
//           calling it is a row that expires in two minutes.
//   poll  — returns a token ONLY to the process that started that pairing,
//           proved by a second secret the agent never puts in the URL. So
//           knowing the code — which does travel in a URL — is not enough.
//
//   claim — is NOT public. It runs as the signed-in person in the browser and
//           is the only route that attaches a token to a code.
//
// A token sits at rest here for at most two minutes, is read exactly once,
// and is deleted in the same request that returns it. No policy grants
// `authenticated` anything on the table, so it cannot be read through the API
// at all — only through here, holding the service role.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Long enough that guessing is hopeless, short enough to sit in a URL. */
const CODE_BYTES = 24
const SECRET_BYTES = 32

const randomToken = (bytes: number) => {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { ...H, ...(init.method && init.method !== 'GET' ? { Prefer: 'return=representation' } : {}) },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : []
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action || '')

  try {
    // ── the agent asks to be let in ──────────────────────────────────────
    if (action === 'start') {
      // Sweeping here means there is no cron to forget, and a new pairing is
      // exactly the moment when sweeping costs nothing.
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/arnie_sweep_pairings`, { method: 'POST', headers: H }).catch(() => {})

      const code = randomToken(CODE_BYTES)
      const pollSecret = randomToken(SECRET_BYTES)
      await rest('arnie_pairings', {
        method: 'POST',
        body: JSON.stringify({
          code,
          poll_secret: pollSecret,
          device_label: String(body.device_label || '').slice(0, 120) || null,
          platform: String(body.platform || '').slice(0, 40) || null,
          agent_version: String(body.agent_version || '').slice(0, 40) || null,
        }),
      })
      return json({ ok: true, code, poll_secret: pollSecret, expires_in: 120 })
    }

    // ── the agent waits ──────────────────────────────────────────────────
    if (action === 'poll') {
      const code = String(body.code || '')
      const secret = String(body.poll_secret || '')
      if (!code || !secret) return json({ error: 'code and poll_secret are required' }, 400)

      const rows = await rest(`arnie_pairings?select=code,poll_secret,refresh_token,expires_at&code=eq.${encodeURIComponent(code)}&limit=1`)
      const row = rows?.[0]
      // A code that never existed and one that expired are the same answer,
      // on purpose: nothing here confirms whether a code is real.
      if (!row || new Date(row.expires_at) <= new Date()) return json({ ok: true, status: 'expired' })
      if (row.poll_secret !== secret) return json({ ok: true, status: 'expired' })
      if (!row.refresh_token) return json({ ok: true, status: 'waiting' })

      // Read once. The delete is not deferred and not conditional: by the time
      // this returns, the token exists only in the agent's memory.
      await rest(`arnie_pairings?code=eq.${encodeURIComponent(code)}`, { method: 'DELETE' })
      return json({ ok: true, status: 'connected', refresh_token: row.refresh_token })
    }

    // CLAIM DELIBERATELY DOES NOT LIVE HERE.
    //
    // This function is public, and resolveCaller only DECODES a JWT — it does
    // not verify the signature, because every other rail sits behind the
    // gateway's verify_jwt and lets the gateway do that. Put the claim route
    // on a public function and anyone could forge a token naming any email
    // and pair their own agent to somebody else's account.
    //
    // So claiming is an action on arnie-computer, which is authenticated. The
    // split is not tidiness: it is the difference between "the browser proves
    // who you are" and "the browser says who you are".

    // ── what is asking? ──────────────────────────────────────────────────
    // So the Connect page can name the computer rather than asking somebody
    // to trust a code. Deliberately returns no secret and no token.
    if (action === 'describe') {
      const code = String(body.code || '')
      const rows = await rest(`arnie_pairings?select=device_label,platform,agent_version,expires_at,claimed_at&code=eq.${encodeURIComponent(code)}&limit=1`)
      const row = rows?.[0]
      if (!row || new Date(row.expires_at) <= new Date()) return json({ ok: true, found: false })
      return json({
        ok: true,
        found: true,
        claimed: !!row.claimed_at,
        device_label: row.device_label,
        platform: row.platform,
        agent_version: row.agent_version,
      })
    }

    return json({ error: `unknown action: ${action || '(none)'}` }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500)
  }
})
