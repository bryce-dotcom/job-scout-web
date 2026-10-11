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
// Input  : { company_id, image_base64, lat, lng, zoom, address?, image_width?, feet_per_pixel?, target_x?, target_y? }
// Output : { runs: [{ face, points: [{x,y}], note }], storeys_guess, notes, confidence }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { resolveBillableCompany } from "../_shared/auth.ts";

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
- Trace the eave lines a string of lights would follow, on EVERY face — front, both sides AND the back. The customer chooses later how much of the house to light (front only, half, or all the way round) and that choice simply includes or leaves out whole runs by their tag, so a face you skip can never be quoted. Follow the lower eave lines and the prominent gables, not every interior ridge or valley.
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
    const { company_id, image_base64, lat, lng, zoom, address, image_width, feet_per_pixel, target_x, target_y } = await req.json();
    const who = await resolveBillableCompany(req, company_id, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    if ('error' in who) return json({ error: who.error }, who.status);
    const companyId = who.companyId;
    if (!image_base64) return json({ error: 'image_base64 is required' }, 400);

    const media = String(image_base64).startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    const clean = String(image_base64).replace(/^data:image\/\w+;base64,/, '');

    const tx = Number(target_x), ty = Number(target_y);
    const hasTarget = Number.isFinite(tx) && Number.isFinite(ty);
    const ftpp = Number(feet_per_pixel);

    const context = [
      address ? `Address: ${address}` : null,
      Number.isFinite(Number(lat)) ? `Centre: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : null,
      Number.isFinite(Number(zoom)) ? `Tile zoom: ${zoom}` : null,
      Number.isFinite(Number(image_width)) ? `Image is ${image_width}px wide.` : null,
      // WHICH house. The picture is a few hundred feet across and holds the
      // neighbours too; without this the first live run (Highland, 10-11)
      // traced the street and the gap between two houses.
      hasTarget
        ? `THE HOUSE TO TRACE is the one building under pixel (${Math.round(tx)}, ${Math.round(ty)}), marked with a yellow ring. Trace ONLY that building's roof edges. Every other house, the street, kerbs, driveways, fences and yards are not part of the job — no point of any run may sit on them.`
        : null,
      // The scale is the thing that stops a fence line becoming a roof.
      Number.isFinite(Number(feet_per_pixel))
        ? `SCALE: one pixel is ${Number(feet_per_pixel).toFixed(3)} ft, so the whole image is about ${Math.round(Number(feet_per_pixel) * Number(image_width || 768))} ft across.`
        : null,
    ].filter(Boolean).join('\n');

    const ai = await callAnthropic(
      { feature: 'chris-roofline', companyId },
      {
        // Pixel-accurate tracing is the hard part of this job; the older
        // Sonnet put lines in the road. Adaptive thinking is on by default.
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'high' },
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

    // With thinking on, the first block is a thinking block — read the text one.
    const text = String((ai.data?.content || []).find((b: { type?: string }) => b?.type === 'text')?.text || '').trim();
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
      .filter((r: { points: unknown[] }) => r.points.length >= 2)
      // A run that never comes near the marked house is on somebody else's
      // roof or in the road. 'Near' = some point within ~70 ft of the pin,
      // which covers the far corner of a large house but not the neighbour.
      .filter((r: { points: { x: number; y: number }[] }) => {
        if (!hasTarget || !(ftpp > 0)) return true;
        const nearest = Math.min(...r.points.map((p) => Math.hypot(p.x - tx, p.y - ty))) * ftpp;
        return nearest <= 70;
      });

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
