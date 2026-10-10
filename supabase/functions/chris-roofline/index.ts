// chris-roofline — Chris Christmas Lighting reads a roof from the air.
//
// The browser stitches a few Web Mercator tiles around the address onto a
// canvas and sends the picture here; Claude looks at it and proposes the runs
// you would actually hang lights on, each tagged with the face it sits on.
// Same shape as zach-yard-ai, which measures lawns from the same kind of tile
// for the same companies — a lawn crew with an empty December is the whole
// reason this exists.
//
// Two things it deliberately does NOT do.
//
// It does not trace the roof OUTLINE. Lights go along eaves and peaks, mostly
// the faces you can see from the street; the full perimeter of a roof polygon
// would overbill every job on the board. It proposes runs, and a person
// confirms them before a price exists.
//
// It does not convert to feet. The browser knows the exact ground resolution
// from the tile's zoom and latitude (lib/chrisLights feetPerPixel), so the
// pixels come back as pixels and the scale is applied where it is known for
// certain. An AI guessing at feet is an AI guessing at the price.
//
// Input  : { company_id, image_base64, lat, lng, zoom, address?, image_width? }
// Output : { runs: [{ face, points: [{x,y}], note }], storeys_guess, notes, confidence }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROMPT = `You are looking straight down at a house from the air. The pin is the address; the house at or nearest the centre of the image is the subject.

Propose the runs a Christmas light installer would hang along this roof.

What a run is: one continuous straight or dog-legged line along an eave, ridge, gable edge or porch line that a string of lights would follow. Give each run as a short list of points in IMAGE PIXEL coordinates, origin top-left.

Tag every run with the face it sits on:
  "front" - faces the street. The street is the road or driveway approach visible in the image.
  "side"  - either gable end
  "back"  - away from the street

Rules that matter:
- Trace what you would LIGHT, not the whole roof outline. Installers follow the lower eave lines and the prominent gables, not every ridge and not the back of a roof nobody sees.
- CHECK YOUR SCALE before answering. You are told how many feet one pixel covers. A detached house front is usually 30-80 ft; a run over about 120 ft is almost certainly a fence, a kerb line, a shared terrace or two houses traced as one. If a run comes out that long, you have traced the wrong thing — shorten it to the actual roof edge.
- Give each run an est_ft: your own estimate of its length in feet. It is cross-checked against the pixels, and a run whose two numbers disagree is thrown away rather than quoted.
- Do not include garages detached from the house, sheds, fences, trees or neighbouring buildings.
- If the street side is ambiguous, say so in notes and tag your best guess.
- Fewer, longer runs beat many short ones.

Also estimate storeys from roof complexity, shadow length and footprint ("1", "2" or "unsure"). This only flags that a lift may be needed; a person checks it.

Reply with JSON only:
{"runs":[{"face":"front","points":[{"x":120,"y":300},{"x":420,"y":300}],"est_ft":48,"note":"main eave"}],
 "storeys_guess":"1","confidence":"high|medium|low","notes":"one sentence about anything uncertain"}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { company_id, image_base64, lat, lng, zoom, address, image_width, feet_per_pixel } = await req.json();
    if (!company_id) return json({ error: 'company_id is required' }, 400);
    if (!image_base64) return json({ error: 'image_base64 is required' }, 400);

    const media = String(image_base64).startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    const clean = String(image_base64).replace(/^data:image\/\w+;base64,/, '');

    const context = [
      address ? `Address: ${address}` : null,
      Number.isFinite(Number(lat)) ? `Centre: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : null,
      Number.isFinite(Number(zoom)) ? `Tile zoom: ${zoom}` : null,
      Number.isFinite(Number(image_width)) ? `Image is ${image_width}px wide.` : null,
      // The scale is the thing that stops a fence line becoming a roof.
      Number.isFinite(Number(feet_per_pixel))
        ? `SCALE: one pixel is ${Number(feet_per_pixel).toFixed(3)} ft, so the whole image is about ${Math.round(Number(feet_per_pixel) * Number(image_width || 768))} ft across.`
        : null,
    ].filter(Boolean).join('\n');

    const ai = await callAnthropic(
      { feature: 'chris-roofline', companyId: company_id ?? null },
      {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: clean } },
            { type: 'text', text: `${context}\n\n${PROMPT}` },
          ],
        }],
      },
    );

    // A proposal is a convenience, never the price — so an outage degrades to
    // "trace it yourself" rather than blocking the quote. 200, not 502: the
    // page has a perfectly good manual path and should just use it.
    if (!ai.ok) {
      console.error('[chris-roofline] Claude error:', ai.raw || ai.friendly);
      return json({
        runs: [],
        ai_unavailable: ai.unavailable === true,
        notes: ai.friendly || 'Could not read the roof just now — trace the runs by hand.',
      });
    }

    const text = String(ai.data?.content?.[0]?.text || '').trim();
    let parsed: Record<string, unknown> = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
    } catch {
      console.error('[chris-roofline] unparseable reply:', text.slice(0, 300));
      return json({ runs: [], notes: 'The roof reader returned something unreadable — trace the runs by hand.' });
    }

    // Keep only runs that are actually drawable. A one-point "run" is noise,
    // and a face we do not recognise becomes a side so it is never free.
    const FACES = ['front', 'side', 'back'];
    const runs = (Array.isArray(parsed.runs) ? parsed.runs : [])
      .map((r: Record<string, unknown>) => ({
        face: FACES.includes(String(r?.face)) ? String(r.face) : 'side',
        note: typeof r?.note === 'string' ? r.note.slice(0, 80) : null,
        est_ft: Number.isFinite(Number(r?.est_ft)) ? Number(r.est_ft) : null,
        points: (Array.isArray(r?.points) ? r.points : [])
          .map((p: Record<string, unknown>) => ({ x: Number(p?.x), y: Number(p?.y) }))
          .filter((p: { x: number; y: number }) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      }))
      .filter((r: { points: unknown[] }) => r.points.length >= 2);

    return json({
      runs,
      storeys_guess: ['1', '2', 'unsure'].includes(String(parsed.storeys_guess)) ? String(parsed.storeys_guess) : 'unsure',
      confidence: ['high', 'medium', 'low'].includes(String(parsed.confidence)) ? String(parsed.confidence) : 'low',
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 300) : null,
    });

  } catch (error) {
    console.error('[chris-roofline] error:', error);
    return json({ error: (error as Error)?.message || 'error' }, 500);
  }
});
