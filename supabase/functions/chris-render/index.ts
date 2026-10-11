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
// Input  : { company_id, image_base64, coverage?, bulb? (BULB_COLORS key), address? }
// Output : { ok, image_base64, mime, label, coverage_note, checked, redrawn }
//          or { ok:false, error, needs_key?, wrong_view?, unfaithful? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { resolveBillableCompany } from '../_shared/auth.ts'
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

// Bulb colours, keyed the same as BULB_COLORS in src/lib/chrisLights.js.
// Unknown → warm white: a picture in the wrong colour is still their house.
const BULB_TEXT: Record<string, string> = {
  warm_white: 'warm white C9',
  cool_white: 'cool white C9 (crisp bluish-white)',
  multicolor: 'classic multicolour C9 (red, green, blue, orange and yellow repeating in that order)',
  red_green: 'C9 alternating red and green',
  red_white: 'C9 alternating red and white',
  blue: 'blue C9',
}

// A street view shows the front and maybe a corner — so Front, Half and Full
// look nearly alike in the picture. The difference is the feet and the price,
// and the customer is told that rather than left wondering.
const COVERAGE_NOTE: Record<string, string> = {
  front: 'Front only — what you see here is what gets lit.',
  half: 'Front view shown — both sides are lit too, and priced in the estimate.',
  full: 'Front view shown — the sides and back are lit too, and priced in the estimate.',
}

// Said as "winter evening", the model took it as licence to snow on the lawn
// and strip the leaves off the trees (Highland, 10-10). The customer has to
// recognise their own yard, so the season is pinned to the photo's own, and
// the one place bulbs may go is said as a hard rule rather than a style.
function prompt(coverage: string, bulb: string, retryNote = '') {
  return `Edit this photograph of a house to show the SAME scene at dusk with Christmas lights installed on the roofline.

THE SCENE DOES NOT CHANGE. Same season as the photo: if the trees have leaves, they keep every leaf; if the grass is green, it stays green; if there is no snow, there is no snow, frost or ice. Same roof shape, windows, door, driveway, trees, bushes, parked cars, kerb and pavement, all in the same place. Do not add people, decorations, inflatables, wreaths or garlands.

Change exactly two things:
1. Light only — dusk. Deep blue sky, the house in soft shadow, warm light in one or two windows. This is a lighting change, not a weather or season change.
2. Add a neat single run of ${bulb} bulbs, evenly spaced about 12 inches apart, ${COVERAGE_TEXT[coverage] || COVERAGE_TEXT.full}. The bulbs sit tight to the fascia in a straight, professional line on the real roof edges in the photo, with a gentle glow on the wall beneath.

HARD RULE: bulbs go ONLY on the roof edge of the house. None in trees, on branches, in bushes, on fences, railings, posts or the ground — even where a tree stands in front of the roof, the tree stays unlit and simply hides that part of the run.

Photographic, not illustrated: a photo taken of this house after the crew went home.${retryNote ? `\n\nA previous attempt got this wrong — do not repeat it: ${retryNote}` : ''}`
}

// The model does not always do what it is told, and a customer who sees snow
// on their summer lawn or lights in a tree they are not buying stops trusting
// the picture. So every render is compared with the photo it came from before
// anyone sees it, and redrawn once if it drifted.
const FAITHFUL_PROMPT = `The first image is a real photo of a house. The second is an edit meant to change ONLY the time of day to dusk and add Christmas lights along the roof edge.

Compare them and answer each strictly:
- season_changed: snow, frost or ice appears that is not in the first image, or trees lost or gained leaves, or green grass turned brown/white.
- lights_off_roof: any bulbs appear anywhere other than the roof edge of the house — in a tree, bush, on a fence, post or the ground.
- house_changed: the building's shape, windows, doors or garage are different, or a car, tree or other object was added, removed or moved.

Reply with JSON only: {"season_changed":false,"lights_off_roof":false,"house_changed":false,"note":"one short sentence on what is wrong, or empty"}`

/** null = faithful; a sentence = what drifted; 'unchecked' = the check itself could not run. */
async function drift(key: string, mime: string, original: string, outMime: string, out: string): Promise<string | null> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VIEW_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: mime, data: original } },
          { inlineData: { mimeType: outMime, data: out } },
          { text: FAITHFUL_PROMPT },
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { console.error('[chris-render] faithful check error:', j?.error?.message || r.status); return 'unchecked' }
    const text = String(j.candidates?.[0]?.content?.parts?.[0]?.text || '')
    const v = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
    const wrong: string[] = []
    if (v.season_changed === true) wrong.push('the season changed (snow, frost or bare trees that are not in the photo)')
    if (v.lights_off_roof === true) wrong.push('bulbs were put somewhere other than the roof edge')
    if (v.house_changed === true) wrong.push('the house or yard was changed')
    if (!wrong.length) return null
    return wrong.join('; ') + (v.note ? ` — ${String(v.note).slice(0, 160)}` : '')
  } catch (e) {
    console.error('[chris-render] faithful check failed:', e)
    return 'unchecked'
  }
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

    const { company_id, image_base64, coverage = 'full', bulb = 'warm_white', address } = await req.json()
    const bulbText = BULB_TEXT[String(bulb)] || BULB_TEXT.warm_white
    if (!image_base64) return json({ ok: false, error: 'image_base64 is required' }, 400)

    // Pictures are billed to a company — so the company comes from who is
    // signed in, never from the body alone (see resolveBillableCompany).
    const who = await resolveBillableCompany(req, company_id, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')
    if ('error' in who) return json({ ok: false, error: who.error }, who.status)
    const companyId = who.companyId

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

    const draw = async (retryNote = '') => {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{
            parts: [
              // The photo first: this is an EDIT of their house, not a painting
              // of a house like theirs.
              { inlineData: { mimeType: mime, data: clean } },
              { text: prompt(String(coverage), bulbText, retryNote) },
            ],
          }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const msg = j?.error?.message || `Gemini ${r.status}`
        console.error('[chris-render] gemini error:', msg)
        return { error: msg, needs_key: r.status === 400 || r.status === 403 }
      }
      const part = (j.candidates?.[0]?.content?.parts || []).find((p: Record<string, unknown>) => p.inlineData)
      if (!part) {
        const why = j.candidates?.[0]?.finishReason
        return { error: why ? `No picture came back (${why}).` : 'No picture came back.' }
      }
      // Every picture drawn is a picture paid for, including a redraw.
      await recordMediaUsage(meterEnv, { companyId, kind: 'picture', model: MODEL, units: 1, costUsd: MEDIA_PRICES.picture }).catch(() => {})
      return { data: String(part.inlineData.data), mime: String(part.inlineData.mimeType || 'image/png') }
    }

    // Draw, compare with their photo, and redraw ONCE telling the model what
    // it got wrong. Two misses are refused rather than shown: a picture of the
    // customer's yard in the wrong season is worse than no picture.
    let shot = await draw()
    if (!shot.data) return json({ ok: false, error: shot.error, needs_key: shot.needs_key }, 200)
    let wrong = await drift(key, mime, clean, shot.mime!, shot.data)
    let redrawn = false
    if (wrong && wrong !== 'unchecked') {
      console.warn('[chris-render] redrawing:', wrong)
      shot = await draw(wrong)
      if (!shot.data) return json({ ok: false, error: shot.error, needs_key: shot.needs_key }, 200)
      redrawn = true
      wrong = await drift(key, mime, clean, shot.mime!, shot.data)
      if (wrong && wrong !== 'unchecked') {
        return json({ ok: false, unfaithful: true, error: `Chris drew it twice and both changed the house (${wrong.split(' — ')[0]}). Try again, or try a different photo.` }, 200)
      }
    }

    return json({
      ok: true,
      image_base64: shot.data,
      mime: shot.mime,
      label: RENDER_LABEL,
      coverage_note: COVERAGE_NOTE[String(coverage)] || COVERAGE_NOTE.full,
      // 'unchecked' = the comparison could not run; the picture is still an
      // edit of their own street-level photo, so it is shown, but said so.
      checked: wrong === 'unchecked' ? false : true,
      redrawn,
      address: address || null,
    })

  } catch (error) {
    console.error('[chris-render] error:', error)
    return json({ ok: false, error: (error as Error)?.message || 'error' }, 500)
  }
})
