// A client's way into one meeting.
//
// Bryce, 2026-10-23: "how can we share an outside link if we want to have a
// meeting with a client."
//
// This is deliberately NOT room-token with the lock taken off. room-token
// refuses anyone without a Supabase session, and that refusal is what keeps
// one company out of another's call — loosening it to let a guest in would
// weaken the thing it exists for. A guest arrives through a different door
// with its own rules, and the only thing that door opens is one FireSide.
//
// What a guest gets, and nothing more:
//   - a LiveKit token for co<company>__<slug>, built HERE from the invite
//     row, never from anything the browser sent
//   - roomJoin, publish and subscribe in that room
//   - roomAdmin, roomCreate and roomList all false
//   - two hours
//
// What a guest never gets: a Supabase session, a JobScout page, or the
// ability to name the room they land in.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'
import { roomId } from '../_shared/conferenceRooms.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TTL_SECONDS = 60 * 60 * 2

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const LIVEKIT_URL = (Deno.env.get('LIVEKIT_URL') || '').trim()
  const API_KEY = (Deno.env.get('LIVEKIT_API_KEY') || '').trim()
  const API_SECRET = (Deno.env.get('LIVEKIT_API_SECRET') || '').trim()

  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }

  const token = String(body?.token || '').trim()
  // A uuid or nothing. Checking the shape first means a malformed token is a
  // 400 here rather than a database round trip.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return json({ error: 'This link is not valid.' }, 400)
  }

  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) return json({ configured: false }, 200)

  // ---- resolve the invite, with the service role ---------------------------
  // The guest has no session, so RLS cannot help here; the token IS the
  // credential, and it only ever matches one row.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/room_invites?select=company_id,slug,label,expires_at,revoked_at,room_id&token=eq.${token}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  )
  const rows = res.ok ? await res.json() : []
  const invite = Array.isArray(rows) ? rows[0] : null
  if (!invite) return json({ error: 'This link is not valid.' }, 404)
  if (invite.revoked_at) return json({ error: 'This link has been turned off.' }, 403)
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: 'This link has expired. Ask for a new one.' }, 403)
  }

  // The room the GUEST joins is built from the invite row, so the browser
  // cannot ask for a different company's room by editing a request.
  const room = roomId(invite.company_id, invite.slug)
  if (!room) return json({ error: 'This link is not valid.' }, 400)

  // The name they typed, trimmed to something sane. It is a label on a tile,
  // not an identity, and the identity below is ours.
  const displayName = String(body?.displayName || '').trim().slice(0, 40) || 'Guest'
  const identity = `guest-${crypto.randomUUID().slice(0, 8)}`

  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const lkToken = await create(
      { alg: 'HS256', typ: 'JWT' },
      {
        iss: API_KEY,
        sub: identity,
        name: displayName,
        nbf: getNumericDate(-10),   // a little slack, for clock skew between us and LiveKit
        exp: getNumericDate(TTL_SECONDS),
        video: {
          room,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          // A guest can be in the meeting. A guest cannot run it, open
          // another one, or find out what else exists.
          roomCreate: false,
          roomAdmin: false,
          roomList: false,
        },
      },
      key,
    )

    return json({
      configured: true,
      token: lkToken,
      url: LIVEKIT_URL,
      room,
      identity,
      displayName,
      // For the page heading. Not the company name — a guest does not need
      // the tenant's identity to join a call they were invited to.
      label: invite.label || null,
    })
  } catch (err) {
    console.error('[guest-room-token]', (err as Error)?.message)
    return json({ error: 'Could not let you in.' }, 500)
  }
})
