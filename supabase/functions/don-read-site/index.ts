// don-read-site — Don looks at the site.
//
// Site photos answer questions a plan set never does: what the cut face
// actually looks like, whether a lowboy can get in, where there is room to
// stockpile, and what the ground looked like before anybody touched it.
//
// Everything here is ADVISORY. A soil class guessed from a photograph seeds a
// field for a human to confirm; it never silently changes a price. Soil
// identification from an image is genuinely hard — moisture, lighting and a
// skim of topsoil over something else will all fool it — so the output says
// what it saw and how sure it is, and the estimator decides.
//
// Single pass: unlike handwriting, there is no transcription step worth
// separating out.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { callAnthropic } from "../_shared/anthropic.ts"
import { resolveCompanyId } from "../_shared/auth.ts"
import { SOIL_VOCAB } from "../_shared/digVocab.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { images, site } = await req.json()
    if (!images || !Array.isArray(images) || images.length === 0) {
      return json({ error: 'At least one site photo is required' }, 400)
    }
    if (images.length > 8) return json({ error: 'Maximum 8 photos at a time' }, 400)

    const companyId = await resolveCompanyId(
      req, Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    )

    const imageBlocks = images.flatMap((img: any, idx: number) => ([
      {
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 },
      },
      { type: 'text', text: `Photo ${idx + 1} of ${images.length}` },
    ]))

    const prompt = `You are Don, an excavation estimator, looking at photographs of a job site before bidding it.

${site?.address ? `The site is at ${site.address}.` : ''}
${site?.default_soil_class ? `The estimator has the site down as ${site.default_soil_class} — say if the photos disagree.` : ''}

Report what you can actually SEE. This is advisory: a human confirms everything before it touches a price.

SOIL — only where a cut face, a trench wall, a stockpile or bare ground is visible. Use these keys:
${SOIL_VOCAB}
Soil from a photograph is genuinely uncertain: moisture darkens everything, low sun flattens texture, and a few inches of topsoil hides whatever is under it. If you cannot see a cut or an exposed face, say so and give no soil at all rather than guessing from the surface.

ACCESS — the things that cost money on the day and never appear on a plan:
- gates, and roughly how wide
- overhead power lines over the work or the approach
- how a lowboy would get in, and where it would turn round
- room to stockpile, and room to stage
- slope of the approach, soft ground, existing pavement to protect
- neighbouring structures close to the dig
- anything suggesting a weight or width restriction on the way in

CONDITIONS — existing-conditions documentation, which is the cheapest claim
defence there is: standing water, erosion, rutting, previous damage, debris,
visible utility markings, survey stakes, existing structures.

Return ONLY valid JSON (no markdown fences):

{
  "soil": { "soil_class": "one key or null", "confidence": 0.0,
            "seen_in": "what you looked at, e.g. 'trench wall in photo 2'",
            "reasoning": "one short sentence" },
  "access": [ { "kind": "gate|overhead|approach|staging|slope|surface|proximity|restriction",
                "note": "what you can see", "severity": "info|caution|blocker" } ],
  "conditions": [ { "kind": "water|erosion|debris|utility_marks|survey|damage|structure|other",
                    "note": "what you can see" } ],
  "questions": [ "things a human should check on site that a photo cannot settle" ],
  "photo_quality": "good|usable|poor"
}

HARD RULES
1. NEVER output a price, a quantity, a volume or a dimension. You are not
   estimating here — you are describing what is in front of the camera.
2. Do not report anything you cannot see in the photos. No inference from the
   address, the region or the season.
3. If no soil is exposed anywhere, soil_class is null and confidence is 0.
4. confidence above 0.7 only for a clean, well-lit, clearly exposed face.`

    const ai = await callAnthropic(
      { feature: 'don-read-site', companyId, req },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 3072,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
      },
    )
    if (!ai.ok) return json({ error: ai.friendly, ai_unavailable: ai.unavailable === true }, 502)

    const raw = ai.data?.content?.map((c: any) => c.text || '').join('') || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return json({ error: 'Could not parse the reading', raw }, 422)

    let parsed: any
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return json({ error: 'Could not parse the reading', raw }, 422)
    }

    const ALLOWED_SOIL = new Set(SOIL_VOCAB.split(',').map((s) => s.trim()))
    const soil = parsed.soil || {}
    const soilClass = ALLOWED_SOIL.has(soil.soil_class) ? soil.soil_class : null

    return json({
      success: true,
      soil: {
        soil_class: soilClass,
        // No soil identified means no confidence in one, whatever the model
        // put in the field.
        confidence: soilClass ? Math.max(0, Math.min(1, Number(soil.confidence) || 0)) : 0,
        seen_in: typeof soil.seen_in === 'string' ? soil.seen_in.slice(0, 200) : null,
        reasoning: typeof soil.reasoning === 'string' ? soil.reasoning.slice(0, 300) : null,
      },
      access: Array.isArray(parsed.access) ? parsed.access.slice(0, 12) : [],
      conditions: Array.isArray(parsed.conditions) ? parsed.conditions.slice(0, 12) : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 8) : [],
      photo_quality: ['good', 'usable', 'poor'].includes(parsed.photo_quality) ? parsed.photo_quality : 'usable',
    })
  } catch (error) {
    console.error('[Don] read-site error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
