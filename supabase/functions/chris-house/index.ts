// chris-house — how hard is this roofline to reach?
//
// Phase 1 priced the feet off an aerial. The feet are not the job: the same
// 180 ft is a morning off a step ladder or a day with a lift. Bryce: "look to
// see if its a two story or if a lift will be needed".
//
// A plan view cannot answer that. This reads a picture of the FRONT of the
// house — one the rep took on the driveway, or a Street View frame where the
// tenant has a Google key. Antonino's own words were "take a picture or use
// maps", and the picture is the half that works for everybody today: free,
// current, and pointed at the thing you actually care about.
//
// It reports what it SEES and how sure it is. The rule that turns that into
// money is src/lib/chrisAccess, which treats an unsure read as "ask", never
// as a cheap guess or an expensive one.
//
// Input  : { company_id, image_base64, address? }
// Output : { storeys, pitch, obstructions[], notes, confidence }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROMPT = `This is a photo of the front of a house. A Christmas light installer needs to know how hard the roofline is to reach.

Report only what the picture actually shows.

storeys: "1", "2", "3+" or "unsure". Count habitable floors at the front elevation. A dormer in the roof of a bungalow is still one storey. A walk-out basement visible at the front is not a storey for ladder purposes unless the front eave sits above it.

pitch: "shallow", "normal", "steep" or "unsure". Steep means you would not walk it.

obstructions: things that stop a ladder being FOOTED under the eave. Real examples: a conservatory or flat roof below the run, a bay window, a steep bank or retaining wall, a pond, a deck roof, dense mature planting against the wall. An empty flowerbed is not an obstruction. Return [] when the ground under the eaves is clear — that is the common case and an invented obstruction puts a lift on a quote that does not need one.

confidence: "high" when the front elevation is clearly visible and square on; "medium" when partly obscured or at an angle; "low" when you are mostly inferring.

Say "unsure" freely. A wrong confident answer here prices a lift onto a bungalow or sends a crew with ladders to a three-storey.

Reply with JSON only:
{"storeys":"1","pitch":"normal","obstructions":[],"confidence":"high","notes":"one short sentence on anything the installer should know"}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { company_id, image_base64, address } = await req.json();
    if (!company_id) return json({ error: 'company_id is required' }, 400);
    if (!image_base64) return json({ error: 'image_base64 is required' }, 400);

    const clean = String(image_base64).replace(/^data:image\/\w+;base64,/, '');
    const media = clean.startsWith('/9j/') ? 'image/jpeg' : 'image/png';

    const ai = await callAnthropic(
      { feature: 'chris-house', companyId: company_id ?? null },
      {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: clean } },
            { type: 'text', text: address ? `Address: ${address}\n\n${PROMPT}` : PROMPT },
          ],
        }],
      },
    );

    // Degrade to "ask a human" rather than blocking the quote — chrisAccess
    // already treats unsure as a question, so an outage lands somewhere safe.
    if (!ai.ok) {
      console.error('[chris-house] Claude error:', ai.raw || ai.friendly);
      return json({
        storeys: 'unsure', pitch: 'unsure', obstructions: [], confidence: 'low',
        ai_unavailable: ai.unavailable === true,
        notes: ai.friendly || 'Could not read the photo just now — set the height by hand.',
      });
    }

    const text = String(ai.data?.content?.[0]?.text || '').trim();
    let parsed: Record<string, unknown> = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
    } catch {
      console.error('[chris-house] unparseable reply:', text.slice(0, 300));
      return json({ storeys: 'unsure', pitch: 'unsure', obstructions: [], confidence: 'low', notes: 'Unreadable answer — set the height by hand.' });
    }

    const pick = (v: unknown, allowed: string[], fallback: string) =>
      allowed.includes(String(v)) ? String(v) : fallback;

    return json({
      storeys: pick(parsed.storeys, ['1', '2', '3+', 'unsure'], 'unsure'),
      pitch: pick(parsed.pitch, ['shallow', 'normal', 'steep', 'unsure'], 'unsure'),
      obstructions: (Array.isArray(parsed.obstructions) ? parsed.obstructions : [])
        .map((o: unknown) => String(o).slice(0, 80)).filter(Boolean).slice(0, 6),
      confidence: pick(parsed.confidence, ['high', 'medium', 'low'], 'low'),
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 300) : null,
    });

  } catch (error) {
    console.error('[chris-house] error:', error);
    return json({ error: (error as Error)?.message || 'error' }, 500);
  }
});
