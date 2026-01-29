import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, auditContext } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call Claude Vision API
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
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: `You are Lenard, an expert lighting auditor. Analyze this photo of a lighting fixture or space.

Identify and return JSON with:
{
  "fixture_type": "type of fixture (e.g., 4ft T8 Troffer, High Bay, Wall Pack, etc.)",
  "fixture_category": "Indoor Linear | Indoor High Bay | Outdoor | Decorative | Other",
  "lamp_type": "T8 | T12 | T5 | Metal Halide | HPS | Incandescent | LED | CFL | Other",
  "lamp_count": number of lamps/bulbs per fixture,
  "fixture_count": estimated number of this fixture type visible,
  "existing_wattage_per_fixture": estimated total watts per fixture,
  "ceiling_height_estimate": estimated ceiling height in feet if visible,
  "mounting_type": "Recessed | Surface | Suspended | Wall | Pole",
  "condition": "Good | Fair | Poor",
  "notes": "any other observations about the space or fixtures",
  "confidence": "High | Medium | Low"
}

Context about this audit:
- Area name: ${auditContext?.areaName || 'Unknown'}
- Building type: ${auditContext?.buildingType || 'Commercial'}

Only return valid JSON, no other text.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify({ success: true, analysis }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Could not parse analysis', raw: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
