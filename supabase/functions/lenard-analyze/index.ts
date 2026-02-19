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
    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ success: false, error: 'imageBase64 is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `You are Lenard, an expert commercial lighting auditor for SRP (Salt River Project) rebate programs in Arizona.

Analyze this photo and identify ALL lighting fixtures visible. For each fixture, determine:

1. **name** — Descriptive fixture name (e.g. "4ft LED Troffer", "150W LED High Bay", "100W LED Wall Pack")
2. **count** — How many of this exact fixture type you can see (estimate if partially visible)
3. **existW** — Estimated existing wattage per fixture (if it looks like an older fixture being replaced)
4. **newW** — Estimated new/proposed LED wattage per fixture
5. **category** — One of: interior, exterior, highbay, panel, strip, relamp
6. **subtype** — More specific: troffer, highbay, wallpack, flood, canopy, strip, panel, tube, downlight, other
7. **sbsType** — SBS rate category: "Interior LED Fixture", "LED Re-Lamp", or "Exterior LED"
8. **confidence** — Your confidence level: high, medium, or low

Return ONLY valid JSON in this exact format:
{
  "fixtures": [
    {
      "name": "4ft LED Troffer",
      "count": 12,
      "existW": 128,
      "newW": 40,
      "category": "interior",
      "subtype": "troffer",
      "sbsType": "Interior LED Fixture",
      "confidence": "high",
      "notes": "Standard 2x4 recessed troffers, appears to be T8 fluorescent converting to LED"
    }
  ],
  "scene_description": "Brief description of the space and lighting layout",
  "recommendations": "Any recommendations for the rebate application"
}

Be practical and accurate. If you can't clearly identify fixtures, say so in the notes. Round wattages to common values. Count carefully.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ success: false, error: `Claude API error: ${response.status}`, details: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed || !parsed.fixtures) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not parse fixture data from AI response',
        raw: text,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      fixtures: parsed.fixtures,
      scene_description: parsed.scene_description || '',
      recommendations: parsed.recommendations || '',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
