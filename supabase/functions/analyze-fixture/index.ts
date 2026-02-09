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
    const { imageBase64, auditContext, availableProducts } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build product list for matching
    let productContext = '';
    if (availableProducts && availableProducts.length > 0) {
      productContext = `\n\nAVAILABLE LED REPLACEMENT PRODUCTS (match the best one based on fixture type and wattage):
${availableProducts.map((p: { id: string; name: string; description?: string; wattage?: number }) =>
  `- ID: "${p.id}" | Name: "${p.name}"${p.description ? ` | Description: ${p.description}` : ''}${p.wattage ? ` | Wattage: ${p.wattage}W` : ''}`
).join('\n')}

Choose the most appropriate product based on the fixture type, category, and wattage range. Set recommended_product_id to the product's ID string, or "" if no good match.`;
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

Identify and return JSON with ALL of these fields:
{
  "area_name": "descriptive name for this area/fixture group (e.g., 'Main Office 4ft Troffers', 'Warehouse High Bays')",
  "fixture_type": "specific type (e.g., 4ft T8 Troffer, High Bay, Wall Pack, etc.)",
  "fixture_category": "Indoor Linear | Indoor High Bay | Outdoor | Decorative | Other",
  "lamp_type": "T8 | T12 | T5 | Metal Halide | HPS | Incandescent | LED | CFL | Other",
  "lamp_count": number of lamps/bulbs per fixture,
  "fixture_count": estimated number of this fixture type visible,
  "existing_wattage_per_fixture": estimated total watts per fixture,
  "led_replacement_wattage": recommended LED replacement wattage per fixture,
  "ceiling_height_estimate": estimated ceiling height in feet if visible,
  "mounting_type": "Recessed | Surface | Suspended | Wall | Pole",
  "condition": "Good | Fair | Poor",
  "recommended_product_id": "ID of best matching product from available list, or empty string",
  "notes": "any other observations about the space or fixtures",
  "confidence": "High | Medium | Low"
}

LED REPLACEMENT WATTAGE GUIDELINES:
- 4ft T8 (32W per lamp, 2-lamp = 64W): Replace with 30-40W LED troffer
- 4ft T8 (32W per lamp, 4-lamp = 128W): Replace with 50-65W LED troffer
- 4ft T12 (40W per lamp, 2-lamp = 80W): Replace with 30-40W LED troffer
- 8ft T8 (59W per lamp, 2-lamp = 118W): Replace with 65-80W LED strip
- 8ft T12 (75W per lamp, 2-lamp = 150W): Replace with 65-80W LED strip
- Metal Halide 250W: Replace with 100-120W LED high bay
- Metal Halide 400W: Replace with 150-180W LED high bay
- Metal Halide 1000W: Replace with 300-400W LED high bay
- HPS 150W: Replace with 50-70W LED
- HPS 250W: Replace with 100-120W LED
- HPS 400W: Replace with 150-180W LED
- Wall Pack 150W HPS: Replace with 40-60W LED wall pack
- 100W Incandescent: Replace with 12-15W LED
${productContext}

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
