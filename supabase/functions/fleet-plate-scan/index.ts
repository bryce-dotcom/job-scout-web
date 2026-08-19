// Read an equipment data plate from a photograph.
//
// The lifecycle maths needs make, model, year and a meter reading per machine,
// and for anything road-legal the VIN supplies all of it for free. Off-road
// iron has no VIN — a skid steer, an excavator, a generator carries a stamped
// or riveted plate instead, and there is no registry to look it up in.
//
// So: photograph the plate. Every one of these facts is already printed on the
// machine; the job is transcription, not data entry, and nobody is typing it
// for forty units.
//
// Data plates are a genuinely hard read and the prompt is written around why.
// They are stamped metal photographed in daylight at an angle: glare across
// half the plate, dirt and paint overspray in the engraving, and decades of
// vibration wearing characters shallow. Serial numbers are the worst of it,
// because they are the field where a single wrong character makes the record
// useless and there is no checksum to catch it — unlike a VIN, which fails
// loudly on a bad character. So the model is told to return null rather than
// guess, and to report per-field confidence.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import { resolveCompanyId } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Must match fleet.asset_class exactly — the value keys the residual curves
// and the shared valuation cache, so a free-text guess is worse than nothing.
const CLASSES = [
  'skid_steer', 'excavator', 'mini_excavator', 'backhoe', 'track_loader',
  'wheel_loader', 'dozer', 'telehandler', 'boom_lift', 'scissor_lift',
  'dump_truck', 'box_truck', 'pickup', 'service_truck', 'van',
  'trailer', 'compactor', 'generator', 'attachment', 'other',
]

const SYSTEM = `You read data plates on construction and fleet equipment.

These are photographed in the field: stamped metal at an angle, glare over
part of the plate, dirt and overspray in the engraving, characters worn
shallow by vibration. Read what is legible and refuse the rest.

Serial numbers matter most and are the easiest to get wrong. Unlike a VIN
there is no check digit, so a single mistaken character produces a record
that looks right and matches nothing. Where a character is ambiguous — 0/O,
1/I, 5/S, 8/B, 2/Z — return null for the whole serial rather than a best
guess. A missing serial is an inconvenience; a wrong one is a wrong machine.

Do not infer. If the plate shows a model but no year, the year is null. Model
year and manufacture date are frequently absent from equipment plates and
that is normal.

asset_class must be exactly one of:
${CLASSES.join(', ')}
Choose from what the plate and any visible machine indicate. If it is unclear,
use null rather than "other" — "other" is a deliberate choice a person makes,
not a shrug.

Return ONLY this JSON, no prose and no markdown fence:
{
  "make": string|null,
  "model": string|null,
  "model_year": number|null,
  "serial": string|null,
  "asset_class": string|null,
  "meter": number|null,          // hours or miles if an hour meter is in shot
  "meter_basis": "hours"|"miles"|null,
  "confidence": {                // 0-1 per field, honest about legibility
    "make": number, "model": number, "serial": number
  },
  "unreadable": string[],        // fields you could see but could not read
  "notes": string|null           // e.g. "glare across the serial line"
}`

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const companyId = await resolveCompanyId(req, SUPABASE_URL, SERVICE_KEY)
    if (!companyId) return json({ error: 'Sign in to scan a plate.' }, 401)

    const { image } = await req.json().catch(() => ({}))
    if (!image?.base64) return json({ error: 'No image supplied.' }, 400)

    const ai = await callAnthropic({ feature: 'fleet-plate-scan', companyId, req }, {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType || 'image/jpeg', data: image.base64 } },
          { type: 'text', text: 'Read this equipment data plate.' },
        ],
      }],
    })

    if (!ai.ok) {
      return json({ ok: false, unavailable: ai.unavailable, error: ai.friendly || 'Could not read the plate' }, 200)
    }

    const text = (ai.data?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ ok: false, error: 'Nothing readable on that photo.' }, 200)

    let p: any
    try { p = JSON.parse(match[0]) } catch { return json({ ok: false, error: 'Could not parse the plate.' }, 200) }

    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const num = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

    const year = num(p.model_year)
    // A plate year outside living memory is a misread, not a discovery.
    const plausibleYear = year && year > 1950 && year <= new Date().getFullYear() + 1 ? year : null

    // Drop a class the model invented. It keys the residual curves and the
    // shared valuation cache, so an unrecognised value would silently value
    // the machine against the wrong market.
    const cls = str(p.asset_class)
    const assetClass = cls && CLASSES.includes(cls) ? cls : null

    return json({
      ok: true,
      make: str(p.make),
      model: str(p.model),
      modelYear: plausibleYear,
      // Serials are returned uppercase without separators, matching how they
      // are stamped and how anyone will search for one later.
      serial: str(p.serial)?.toUpperCase().replace(/\s+/g, '') ?? null,
      assetClass,
      meter: num(p.meter),
      meterBasis: p.meter_basis === 'miles' ? 'miles' : p.meter_basis === 'hours' ? 'hours' : null,
      confidence: p.confidence ?? null,
      unreadable: Array.isArray(p.unreadable) ? p.unreadable : [],
      notes: str(p.notes),
    })
  } catch (err) {
    console.error('[fleet-plate-scan]', err)
    return json({ error: (err as Error).message || 'internal error' }, 500)
  }
})
