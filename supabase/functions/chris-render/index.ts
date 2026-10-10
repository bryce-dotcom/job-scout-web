// chris-render — their own house, at dusk, with the lights on.
//
// The close. A customer who sees their actual porch lit buys; a customer
// reading "180 ft of warm white" is doing arithmetic. Antonino asked for
// exactly this: "show them their house and what would look like with lights".
//
// It EDITS the photo rather than painting a house from a description.
// gemini-2.5-flash-image takes an input image, so the render is their roof,
// their trees, their driveway — changed only by the light. A generated
// lookalike would be a picture of somebody else's house with their address
// on it, which is a worse lie the better it looks.
//
// Every render is labelled as a mock-up in the reply, and the page prints that
// label next to it. It is a sales picture, not a promise about the work.
//
// Secret: GEMINI_API_KEY (Google AI Studio), the same one marketing-image uses.
// Input  : { company_id, image_base64, coverage?, bulb?, address? }
// Output : { ok, image_base64, mime, label }   or   { ok:false, error, needs_key?, wrong_view? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { resolveCaller } from '../_shared/auth.ts'
import { checkCap, capMessage, recordMediaUsage, MEDIA_PRICES } from '../_shared/mediaMeter.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MODEL = 'gemini-2.5-flash-image'

/** What the customer is being shown, said plainly, every time. */
export const RENDER_LABEL = 'AI mock-up — an impression of the finished job, not a photograph of it'

const COVERAGE_TEXT: Record<string, string> = {
  front: 'along the street-facing eaves and the front gable only — the sides and back stay dark',
  half: 'along the front eaves, the front gable and both side eaves — the back stays dark',
  full: 'along every eave and gable line, all the way round',
}

function prompt(coverage: string, bulb: string) {
  return `Edit this photograph of a house so it shows the same house on a winter evening with Christmas lights installed.

Keep everything that is actually there: the same roof shape, the same windows, the same door, the same driveway, the same trees and the same parked cars. Do not add, remove or move any part of the building. Do not add people, reindeer, inflatables, snow that is not already there, or a wreath. This is a quote for a lighting install, not a greeting card.

Change exactly two things:
1. Time of day — dusk. Deep blue sky, the house in soft shadow, warm light in one or two windows.
2. Add a neat single run of ${bulb} bulbs, evenly spaced about 12 inches apart, following the roofline ${COVERAGE_TEXT[coverage] || COVERAGE_TEXT.full}. The bulbs sit tight to the fascia in a straight, professional line that follows the real roof edges in the photo. A gentle glow on the surface beneath each run. No lights on trees, bushes, fences or the ground unless they are already lit in the photo.

Photographic, not illustrated. The result should look like a photo taken of this house after the crew went home.`
}

// The edit only stays honest when it starts from a street-level photo of the
// front. Handed an aerial, the model does not edit it — it paints a whole new
// house from the ground, cars and trees included, and the result looks like
// the customer's home and is not. That happened on 10168 N 6580 W, Highland
// (2026-10-09). So the picture is looked at before anything is drawn, and
// anything that is not the front of a house from the ground is refused.
const VIEW_MODEL = 'gemini-3.8-flash'

const VIEW_PROMPT = `Look at this image and say where it was taken from.

"ground": the front or side WALL of a house is visible — its windows, door or garage door — with the roofline above it. Taken from the street, driveway or yard, or from a little above (a raised angle, a ladder, a low drone) still counts, as long as you can see the face of the house.
"overhead": looking straight down at the roof, so the walls, windows and doors cannot be seen — satellite or aerial imagery, a top-down drone shot, or a map.
"other": anything else — no house, a screenshot, a drawing, an interior, a close-up of one detail.

Reply with JSON only: {"view":"ground"}`

const VIEW_REFUSAL: Record<string, string> = {
  overhead: 'That picture looks down on the house from above. Chris needs a photo of the front taken from the street — from overhead it would have to invent a house that is not theirs.',
  other: 'That does not look like a photo of the front of a house. Take one from the street or driveway with the roofline in view.',
  unchecked: 'Could not check the photo just now, so nothing was drawn. Try again in a moment.',
}

/** 'ground' | 'overhead' | 'other' | 'unchecked'. Anything unreadable is 'unchecked' — refused, never waved through. */
async function viewOf(key: string, mime: string, data: string): Promise<{ view: string, detail?: string }> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VIEW_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: mime, data } }, { text: VIEW_PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { const detail = String(j?.error?.message || r.status); console.error('[chris-render] view check error:', detail); return { view: 'unchecked', detail } }
    const text = String(j.candidates?.[0]?.content?.parts?.[0]?.text || '')
    const view = String(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}').view || '')
    return ['ground', 'overhead', 'other'].includes(view) ? { view } : { view: 'unchecked', detail: 'unreadable reply: ' + text.slice(0, 120) }
  } catch (e) {
    console.error('[chris-render] view check failed:', e)
    return { view: 'unchecked', detail: (e as Error)?.message }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ ok: false, needs_key: true, error: 'No GEMINI_API_KEY set, so Chris cannot draw the house yet.' }, 200)

    const { company_id, image_base64, coverage = 'full', bulb = 'warm white C9', address } = await req.json()
    if (!image_base64) return json({ ok: false, error: 'image_base64 is required' }, 400)

    const caller = await resolveCaller(req).catch(() => null)
    const companyId = Number(company_id ?? caller?.companyId ?? 0)
    if (!companyId) return json({ ok: false, error: 'company_id is required' }, 400)

    const clean = String(image_base64).replace(/^data:image\/\w+;base64,/, '')
    const mime = clean.startsWith('/9j/') ? 'image/jpeg' : 'image/png'

    // Before the cap: a refused photo should not use up a picture.
    const { view, detail } = await viewOf(key, mime, clean)
    if (view !== 'ground') {
      return json({ ok: false, wrong_view: view, error: VIEW_REFUSAL[view] || VIEW_REFUSAL.unchecked, detail: detail || null }, 200)
    }

    // Pictures cost money, so they go through the same cap every other
    // generated image goes through rather than inventing a second meter.
    const meterEnv = {
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    }
    const cap = await checkCap(meterEnv, companyId, 'picture', 1)
    if (!cap.allowed) {
      return json({ ok: false, capped: true, error: capMessage(cap, 'picture') }, 200)
    }

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{
          parts: [
            // The photo first: this is an EDIT of their house, not a painting
            // of a house like theirs.
            { inlineData: { mimeType: mime, data: clean } },
            { text: prompt(String(coverage), String(bulb).slice(0, 60)) },
          ],
        }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    })

    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = j?.error?.message || `Gemini ${r.status}`
      console.error('[chris-render] gemini error:', msg)
      return json({ ok: false, error: msg, needs_key: r.status === 400 || r.status === 403 }, 200)
    }

    const part = (j.candidates?.[0]?.content?.parts || []).find((p: Record<string, unknown>) => p.inlineData)
    if (!part) {
      const why = j.candidates?.[0]?.finishReason
      return json({ ok: false, error: why ? `No picture came back (${why}).` : 'No picture came back.' }, 200)
    }

    await recordMediaUsage(meterEnv, { companyId, kind: 'picture', model: MODEL, units: 1, costUsd: MEDIA_PRICES.picture }).catch(() => {})

    return json({
      ok: true,
      image_base64: part.inlineData.data,
      mime: part.inlineData.mimeType || 'image/png',
      label: RENDER_LABEL,
      address: address || null,
    })

  } catch (error) {
    console.error('[chris-render] error:', error)
    return json({ ok: false, error: (error as Error)?.message || 'error' }, 500)
  }
})
