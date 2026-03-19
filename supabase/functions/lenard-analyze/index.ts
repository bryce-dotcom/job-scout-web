import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const companyId = Deno.env.get('LENARD_COMPANY_ID');

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch recent corrections for few-shot learning
    let correctionsBlock = '';
    if (SUPABASE_URL && SERVICE_KEY && companyId) {
      try {
        const corrRes = await fetch(
          `${SUPABASE_URL}/rest/v1/dougie_corrections?company_id=eq.${companyId}&field_type=eq.camera_fixture&order=created_at.desc&limit=20`,
          { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
        );
        if (corrRes.ok) {
          const corrections = await corrRes.json();
          if (corrections.length > 0) {
            const lines = corrections.map((c: any) =>
              `- ${c.field_name}: AI said "${c.original_value}" → correct answer was "${c.corrected_value}"${c.context?.fixtureName ? ` (fixture: ${c.context.fixtureName})` : ''}${c.context?.category ? ` [${c.context.category}]` : ''}`
            );
            correctionsBlock = `

PAST MISTAKES (learn from these — our field team corrected your previous answers):
${lines.join('\n')}
Pay close attention to these corrections. If you see a similar fixture, use the corrected values.`;
          }
        }
      } catch (e) {
        console.warn('[Lenard] Could not fetch corrections:', e);
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: `You are Lenard, an expert commercial lighting auditor for HHH Building Services.
Analyze this photo and identify ALL lighting fixtures visible.

For EACH distinct fixture type, return:
- "name": descriptive label (e.g. "4-Lamp T8 4ft Troffer", "400W Metal Halide High Bay")
- "count": estimated quantity visible (count carefully)
- "existW": total system wattage INCLUDING ballast loss
- "newW": recommended LED replacement wattage
- "category": one of "exterior", "highbay", "panel", "strip"
- "subtype": one of "ext", "hb_250", "hb_400", "hb_1000", "panel_2x2", "panel_2x4", "strip_4", "strip_8"
  For high bay subtype: calculate watts reduced (existW - newW):
    ≤250W → "hb_250", 251-400W → "hb_400", 401-1000W → "hb_1000"
- "sbsType": one of "Interior LED Fixture", "LED Re-Lamp", "Exterior LED"
- "height": estimated mounting height in feet (integer). Use visual cues:
    Drop ceiling / office: 9ft
    Open ceiling / retail / strip lights: 10-12ft
    Warehouse / industrial / high bays: 18-30ft (estimate from room scale, columns, racking)
    Exterior wall packs: 12-15ft
    Exterior poles / parking: 20-35ft
    If uncertain, use these defaults: troffers/panels → 9, strips → 10, high bays → 20, exterior → 25
- "confidence": "high", "medium", or "low"
- "notes": brief note about what you see

Common wattages (with ballast):
4L T8 4ft: 112W→32W | 3L T8 4ft: 84W→28W | 2L T8 4ft: 56W→24W
4L T12 4ft: 172W→32W | 2L T8 8ft: 112W→44W
6L T5HO HB: 351W→150W | 4L T5HO HB: 234W→110W
400W MH: 458W→150W | 250W MH: 288W→100W | 1000W MH: 1080W→300W
400W HPS: 465W→150W | 250W HPS: 295W→100W
175W MH WP: 210W→40W | 100W MH WP: 120W→25W
${correctionsBlock}

Return ONLY a valid JSON array. No markdown, no backticks, no explanation.` }
          ]
        }]
      })
    });

    const aiData = await response.json();
    if (aiData.error) {
      return new Response(JSON.stringify({ error: aiData.error.message || 'AI request failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const content = aiData.content?.map((c: any) => c.text || '').join('') || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse fixture data', raw: content }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const fixtures = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify({ success: true, fixtures }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
