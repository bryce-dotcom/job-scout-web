// zach-yard-ai
//
// Vision-based grass detection for a satellite tile of a property.
// The browser fetches the Static Maps image (using the referrer-restricted
// public key) and sends it to us as base64 — that way no server-side Google
// Maps key is required, and the same code works for the public widget.
//
// Input  : { company_id, image_base64, lat, lng, address?, zoom?, image_width?, image_height?, scale? }
// Output : { ai_sqft, confidence, obstacles[], reasoning, calibration_factor_applied,
//            calibrated_sqft, raw_sqft }
//
// Learning loop:
//   - We pull the company's last N corrections from lawn_ai_corrections
//   - Pass them as few-shot examples in the Claude prompt
//   - Apply the company's stored ai_calibration_factor to the raw output
//
// Model: Anthropic Claude Sonnet 4.5 with vision.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Meters per pixel at a given zoom level + latitude (Web Mercator).
function metersPerPixel(lat: number, zoom: number) {
  return 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
}

// Static Maps image bounds → square feet covered by the image.
function imageAreaSqft({ lat, zoom, width, height, scale }: { lat: number; zoom: number; width: number; height: number; scale: number }) {
  const mpp = metersPerPixel(lat, zoom);
  // scale=2 means 2x the pixel density but the same ground footprint
  const groundW = (width * mpp);   // meters
  const groundH = (height * mpp);
  const sqm = groundW * groundH;
  return Math.round(sqm * 10.7639); // m² → sqft
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = await req.json();
    const {
      company_id,
      image_base64,
      lat,
      lng,
      address,
      zoom = 20,
      image_width = 640,
      image_height = 640,
      scale = 2,
      media_type = 'image/png',
    } = body || {};

    if (!image_base64) return json({ error: 'image_base64 required' }, 400);
    if (lat == null || lng == null) return json({ error: 'lat and lng required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const imageFootprintSqft = imageAreaSqft({ lat, zoom, width: image_width, height: image_height, scale });

    // ============ Pull recent corrections for few-shot learning ============
    let correctionsBlock = '';
    let calibrationFactor = 1.0;
    if (company_id && SUPABASE_URL && SERVICE_KEY) {
      try {
        const corrRes = await fetch(
          `${SUPABASE_URL}/rest/v1/lawn_ai_corrections?company_id=eq.${company_id}&order=created_at.desc&limit=12`,
          { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
        );
        if (corrRes.ok) {
          const corrections = await corrRes.json();
          if (corrections.length > 0) {
            const lines = corrections.map((c: any) =>
              `- AI guessed ${c.ai_sqft.toLocaleString()} sqft → actual was ${c.actual_sqft.toLocaleString()} sqft (${c.delta_pct > 0 ? '+' : ''}${c.delta_pct?.toFixed(0)}%)${c.notes ? ` — ${c.notes}` : ''}`
            );
            correctionsBlock = `\n\nRECENT CORRECTIONS FROM THIS LAWN-CARE COMPANY (use these to calibrate — they're ground truth from the operator who actually mowed these lawns):\n${lines.join('\n')}`;
          }
        }
        // Fetch calibration factor
        const pricingRes = await fetch(
          `${SUPABASE_URL}/rest/v1/lawn_pricing?company_id=eq.${company_id}&select=ai_calibration_factor,ai_sample_n`,
          { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
        );
        if (pricingRes.ok) {
          const rows = await pricingRes.json();
          if (rows[0]?.ai_calibration_factor) {
            calibrationFactor = Number(rows[0].ai_calibration_factor) || 1.0;
          }
        }
      } catch (e) {
        console.warn('[zach-yard-ai] corrections fetch failed:', e);
      }
    }

    // ============ Claude vision call ============
    const systemPrompt = `You are an expert lawn-care estimator analyzing a top-down satellite photo of a residential property. You're looking for the MOWABLE TURF AREA — the actual grass a crew would push a mower across.

WHAT IS TURF (count it):
- Front lawn, back lawn, side yards (visible green grass)
- Park strip / parking strip between sidewalk and street IF it appears to be grass
- Open grassy areas including ones with sparse trees in them

WHAT IS NOT TURF (subtract or skip):
- The house roof, garage, patios, decks, sheds, sport courts
- Driveways, sidewalks, walkways, the street
- Mulched flower beds, vegetable gardens, dirt patches
- Pools, hot tubs, pool decking
- Densely shaded "scrub" areas under heavy tree canopy where grass clearly isn't growing

OUTPUT JSON ONLY (no prose, no markdown fences). Schema:
{
  "estimated_turf_sqft": integer,
  "confidence": 0.0-1.0,
  "obstacles": ["driveway","beds","pool",...],
  "reasoning": "1-2 sentence explanation of what you saw and how you arrived at the number"
}

Confidence guidelines:
- 0.85+ : clear, uncluttered residential lawn, sharp imagery
- 0.65-0.85 : moderate clutter (trees, beds, mixed surfaces)
- 0.45-0.65 : significant occlusion, shadow, or messy parcel
- below 0.45 : you really shouldn't be guessing — say so in reasoning`;

    const userText = `SATELLITE IMAGE METADATA
- Address (approximate center of image): ${address || `${lat}, ${lng}`}
- Latitude / longitude: ${lat}, ${lng}
- Image: ${image_width * scale} × ${image_height * scale} px at zoom ${zoom}, scale ${scale}
- Ground footprint of the entire image: approximately ${imageFootprintSqft.toLocaleString()} sqft

So if the lawn occupies, say, 25% of the visible image area, that's ~${Math.round(imageFootprintSqft * 0.25).toLocaleString()} sqft of turf. Use this to sanity-check your estimate.${correctionsBlock}

Analyze this satellite image and return the JSON.`;

    const ai = await callAnthropic(
      { feature: 'zach-yard-ai', companyId: company_id ?? null },
      {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: userText },
          ],
        }],
      },
    );

    if (!ai.ok) {
      console.error('[zach-yard-ai] Claude error:', ai.raw || ai.friendly);
      return json({ error: ai.friendly, ai_unavailable: ai.unavailable === true }, 502);
    }

    const claudeJson = ai.data;
    const raw = claudeJson?.content?.[0]?.text || '';

    // Extract JSON from the response (Claude usually obeys but be defensive)
    let parsed: any = null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : JSON.parse(raw);
    } catch (e) {
      return json({ error: 'AI returned non-JSON', raw }, 502);
    }

    const rawSqft = Math.max(0, parseInt(parsed.estimated_turf_sqft) || 0);
    const calibratedSqft = Math.round(rawSqft * calibrationFactor);

    return json({
      ai_sqft: calibratedSqft,
      raw_sqft: rawSqft,
      calibration_factor_applied: calibrationFactor,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      obstacles: Array.isArray(parsed.obstacles) ? parsed.obstacles : [],
      reasoning: String(parsed.reasoning || ''),
      image_footprint_sqft: imageFootprintSqft,
    });
  } catch (e) {
    console.error('[zach-yard-ai] error:', e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
