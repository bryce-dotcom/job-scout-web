// A ticket into one room, for one person, for a short while.
//
// The browser asks for a slug ("the-ridge"). It does NOT get to say which
// company's Ridge. The room id is assembled here from the caller's own JWT
// (resolveCaller → companyId), because that namespacing is the only thing
// standing between two tenants on one media server: a bare "base-camp" would
// put every company in the product into a single call.
//
// The LiveKit secret never reaches the browser. This mints a short-lived
// access token instead, which is the whole reason this function exists.
//
// Without LIVEKIT_API_KEY / LIVEKIT_API_SECRET set, it answers 200 with
// { configured: false } rather than an error — the lobby is then still
// usable and says plainly that video is not connected yet, instead of
// looking broken.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'
import { resolveCaller } from '../_shared/auth.ts'
import { roomId } from '../_shared/conferenceRooms.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// A call that runs long is better than one that drops mid-sentence, but a
// ticket that lives forever is a ticket that leaks. Six hours covers any
// meeting; LiveKit refreshes the session itself while someone stays joined.
const TTL_SECONDS = 6 * 60 * 60

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || ''
    const API_KEY = Deno.env.get('LIVEKIT_API_KEY') || ''
    const API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || ''

    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY, { verify: true })
    if (!caller || !caller.companyId) return json({ error: 'Sign in to join a room.' }, 401)

    const body = await req.json().catch(() => ({}))
    const slug = String(body?.slug || '').toLowerCase()
    const room = roomId(caller.companyId, slug)
    if (!room) return json({ error: 'Unknown room.' }, 400)

    // Not configured yet: say so, do not pretend.
    if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
      return json({ configured: false, room, reason: 'Video is not connected yet.' })
    }

    // The display name people see on the tile. Taken from the employee
    // record the JWT resolved to, never from the request body — otherwise
    // anyone could join wearing somebody else's name.
    const identity = `emp-${caller.employeeId ?? caller.email}`
    const displayName = String(body?.displayName || '').slice(0, 60) || caller.email || 'Someone'

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const token = await create(
      { alg: 'HS256', typ: 'JWT' },
      {
        iss: API_KEY,
        sub: identity,
        name: displayName,
        nbf: getNumericDate(0),
        exp: getNumericDate(TTL_SECONDS),
        video: {
          room,
          roomJoin: true,
          // Everyone in the company is an equal participant: they can speak,
          // share a screen and hear each other. Nobody can administer the
          // room or open a different one with this ticket.
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          roomCreate: false,
          roomAdmin: false,
          roomList: false,
        },
      },
      key,
    )

    return json({ configured: true, token, url: LIVEKIT_URL, room, identity, displayName })
  } catch (err) {
    console.error('[room-token]', (err as Error)?.message)
    return json({ error: 'Could not issue a room ticket.' }, 500)
  }
})
