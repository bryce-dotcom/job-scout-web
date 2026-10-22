// What the rooms cost, per company.
//
// Rooms ship to every tenant off ONE JobScout LiveKit account — nobody signs
// up for anything, they click the fire and they are in. That is the whole
// reason it is built this way, and it is also the risk: one company leaving
// the CampFire open all day spends real money, and without this nothing
// would say which company it was.
//
// LiveKit bills participant-minutes, so that is what is recorded. The
// company comes from the room name, which is namespaced co<id>__<slug> by
// room-token from the caller's own JWT — the same namespacing that keeps two
// tenants off one call makes the bill attributable.
//
// It writes into compute_ledger, the same place AI usage goes, so one table
// answers "what did this tenant cost us this month".
//
// Public by necessity: LiveKit calls it. It is not unauthenticated — every
// request carries a JWT signed with our API secret, and a body hash inside
// that token, both of which are checked before anything is written.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { create, getNumericDate, verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'
import { parseRoomId } from '../_shared/conferenceRooms.ts'

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Our COGS per participant-minute. LiveKit's paid tier is $50 for 150,000
// minutes, so this is a little above that to cover the bandwidth that bills
// alongside it. An estimate on purpose, and trued up from an invoice rather
// than guessed at again.
const USD_PER_PARTICIPANT_MINUTE = 0.0004
const CREDIT_USD = 0.01   // matches _shared/compute.ts

Deno.serve(async (req) => {
  // A health probe that leaks nothing — booleans only, never a value.
  //
  // It exists because "a secret is present" and "a secret that works" are not
  // the same thing, and the difference cost us a round trip: the example
  // command was pasted verbatim, so all three names were set, to the literal
  // placeholders. Every presence check passed and the rooms still could not
  // connect. Shape is the cheapest thing that can tell those two apart
  // without anyone reading a secret out loud.
  if (req.method === 'GET') {
    const url = (Deno.env.get('LIVEKIT_URL') || '').trim()
    const key = (Deno.env.get('LIVEKIT_API_KEY') || '').trim()
    const secret = (Deno.env.get('LIVEKIT_API_SECRET') || '').trim()
    const placeholder = /your-project|yourproject|xxxx|example|changeme|\.\.\./i
    const looksReal = {
      url: !!url && /^wss:\/\/[a-z0-9.-]+$/i.test(url) && !placeholder.test(url),
      key: !!key && /^API[A-Za-z0-9]{8,}$/.test(key) && !placeholder.test(key),
      secret: !!secret && secret.length >= 24 && !placeholder.test(secret),
    }

    // Shape is still not proof. A key from one "Add New Key" and a secret
    // from another both look perfect and fail as "invalid API key", which is
    // indistinguishable from a typo from the outside. So ask LiveKit.
    //
    // We sign a throwaway roomList token and call the REST API with it. Only
    // the real pair produces a signature LiveKit accepts, so the answer is a
    // fact about the credentials rather than a guess about their shape — and
    // nothing but a boolean comes back out.
    let credentials: Record<string, unknown> = { tested: false }
    if (looksReal.url && looksReal.key && looksReal.secret) {
      try {
        const signKey = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        )
        const probeToken = await create(
          { alg: 'HS256', typ: 'JWT' },
          { iss: key, sub: 'health-probe', nbf: getNumericDate(0), exp: getNumericDate(60), video: { roomList: true } },
          signKey,
        )
        const host = url.replace(/^wss:/i, 'https:').replace(/\/+$/, '')
        const res = await fetch(`${host}/twirp/livekit.RoomService/ListRooms`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${probeToken}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
        credentials = { tested: true, valid: res.ok, status: res.status }
      } catch (err) {
        credentials = { tested: true, valid: false, error: (err as Error)?.message?.slice(0, 120) }
      }
    }

    return ok({ present: { url: !!url, key: !!key, secret: !!secret }, looksReal, credentials })
  }

  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  // Trimmed for the same reason the health branch above trims: a pasted
  // secret keeps its line break, and an untrimmed one here would reject
  // every genuine delivery as a bad signature.
  const API_SECRET = (Deno.env.get('LIVEKIT_API_SECRET') || '').trim()
  if (!API_SECRET) return ok({ error: 'not configured' }, 503)

  // ---- authenticate the sender -------------------------------------------
  // LiveKit signs each delivery with a JWT whose `sha256` claim is the hash
  // of the body. Checking the token alone would let anyone replay a body;
  // checking the hash ties the token to THIS payload.
  const raw = await req.text()
  const auth = req.headers.get('authorization') || ''
  let claims: any = null
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    )
    claims = await verify(auth.replace(/^Bearer\s+/i, ''), key)
  } catch {
    return ok({ error: 'bad signature' }, 401)
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const bodyHash = btoa(String.fromCharCode(...new Uint8Array(digest)))
  if (claims?.sha256 && claims.sha256 !== bodyHash) return ok({ error: 'body does not match signature' }, 401)

  let event: any
  try { event = JSON.parse(raw) } catch { return ok({ error: 'bad json' }, 400) }

  // Only the event that can tell us a duration. room_finished and
  // participant_joined cannot: one has no per-person figure and the other
  // has not happened yet.
  if (event?.event !== 'participant_left') return ok({ ignored: event?.event || 'unknown' })

  const roomName = event?.room?.name || ''
  const parsed = parseRoomId(roomName)
  if (!parsed) return ok({ ignored: 'room is not one of ours', room: roomName })

  const joinedAt = Number(event?.participant?.joined_at || 0)      // seconds
  const leftAt = Number(event?.createdAt || event?.created_at || 0) // seconds
  const seconds = joinedAt > 0 && leftAt > joinedAt ? leftAt - joinedAt : 0
  // Round up: a 20-second hello still occupies a connection, and rounding
  // down would quietly under-count every short call.
  const minutes = seconds > 0 ? Math.ceil(seconds / 60) : 0
  if (minutes <= 0) return ok({ ignored: 'no measurable time', room: roomName })

  const cost = Number((minutes * USD_PER_PARTICIPANT_MINUTE).toFixed(5))
  const credits = Math.max(1, Math.ceil(cost / CREDIT_USD))

  // One row per participant-session. LiveKit retries deliveries, so the sid
  // keys it: a retry must not bill the same minutes twice.
  const idem = `livekit:${event?.participant?.sid || `${roomName}:${joinedAt}`}`

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/compute_ledger`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify({
        company_id: parsed.companyId,
        type: 'shadow',
        feature_slug: 'conference_minutes',
        model: `livekit:${parsed.slug}`,
        cost_usd: cost,
        credits,
        idempotency_key: idem,
      }),
    })
    if (!res.ok) console.error('[livekit-webhook] ledger', res.status, (await res.text()).slice(0, 200))
  } catch (err) {
    console.error('[livekit-webhook]', (err as Error)?.message)
  }

  return ok({ recorded: true, company: parsed.companyId, room: parsed.slug, minutes })
})
