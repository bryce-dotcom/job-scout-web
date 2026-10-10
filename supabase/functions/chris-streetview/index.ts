// chris-streetview — the front of the house, without anyone driving there.
//
// Phases 2 and 3 work from a picture of the front: how many storeys, whether a
// ladder can be footed, and the dusk render the customer sees. Asking the rep
// to stand on the driveway first meant Chris could not quote from the office.
// Bryce: "get the image from the street view not an uploaded picture".
//
// Street View is the right picture because it IS their house from the street
// — the same thing a rep would photograph — and chris-render refuses anything
// that is not, so an aerial can never stand in for it.
//
// The camera is pointed, not left at whatever heading the panorama starts on:
// the metadata call (free) says where the car stood, and the heading is the
// bearing from there to the geocoded house. Without that the frame is half
// the time the neighbour's garage.
//
// The key stays on the server. A Maps key in the bundle is a key anybody can
// lift and bill to us.
//
// Secret: GOOGLE_MAPS_API_KEY (Street View Static API enabled on it).
// Input  : { lat, lng, address? }
// Output : { ok, image_base64, mime, heading, pano_date, distance_m }
//          or { ok:false, error, needs_key?, no_imagery? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { resolveCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const rad = (d: number) => d * Math.PI / 180

/** Compass bearing in degrees from (lat1,lng1) to (lat2,lng2). */
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number) {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(a))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const key = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!key) return json({ ok: false, needs_key: true, error: 'Street View is not set up yet — add a photo of the front instead.' })

    // Every picture is billed to us, and the anon key is public — so a real
    // signed-in employee (or our own service key) only.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    const caller = token === serviceKey ? null : await resolveCaller(req, supabaseUrl, serviceKey).catch(() => null)
    if (token !== serviceKey && !caller?.companyId) return json({ ok: false, error: 'Sign in to use Street View.' }, 401)

    const { lat, lng } = await req.json()
    const la = Number(lat), ln = Number(lng)
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return json({ ok: false, error: 'lat and lng are required' }, 400)

    // Metadata is free and says whether there is a panorama nearby at all.
    // source=outdoor keeps out indoor and user-uploaded spheres.
    const meta = await (await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${la},${ln}&radius=60&source=outdoor&key=${key}`,
    )).json().catch(() => ({}))

    if (meta.status === 'REQUEST_DENIED') {
      console.error('[chris-streetview] denied:', meta.error_message)
      return json({ ok: false, needs_key: true, error: 'Street View refused the key — check the Street View Static API is enabled on it.' })
    }
    if (meta.status !== 'OK' || !meta.pano_id) {
      return json({ ok: false, no_imagery: true, error: 'No Street View from the road here (private drive, new build or a cul-de-sac the car never went down). Add a photo of the front instead.' })
    }

    const pLat = Number(meta.location?.lat), pLng = Number(meta.location?.lng)
    const heading = Math.round(bearing(pLat, pLng, la, ln))
    const distance = Math.round(metres(pLat, pLng, la, ln))
    // Closer houses fill more of the sky: tilt up and widen a little so the
    // eave is in frame, which is the whole point of the picture.
    const pitch = distance < 25 ? 15 : 8
    const fov = distance < 25 ? 90 : 75

    const r = await fetch(
      `https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=${encodeURIComponent(meta.pano_id)}&heading=${heading}&pitch=${pitch}&fov=${fov}&return_error_code=true&key=${key}`,
    )
    if (!r.ok) {
      console.error('[chris-streetview] image', r.status)
      return json({ ok: false, error: `Street View did not return a picture (${r.status}).` })
    }
    const bytes = new Uint8Array(await r.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))

    return json({
      ok: true,
      image_base64: btoa(bin),
      mime: r.headers.get('content-type') || 'image/jpeg',
      heading,
      distance_m: distance,
      pano_date: meta.date || null,
    })
  } catch (error) {
    console.error('[chris-streetview] error:', error)
    return json({ ok: false, error: (error as Error)?.message || 'error' }, 500)
  }
})
