import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { images } = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one image is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (images.length > 3) {
      return new Response(JSON.stringify({ error: 'Maximum 3 images allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build image content blocks
    const imageBlocks = images.map((img: any, idx: number) => ([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType || 'image/jpeg',
          data: img.base64,
        },
      },
      {
        type: 'text',
        text: `Page ${idx + 1} of ${images.length}`,
      },
    ])).flat();

    const prompt = `You are Dougie, an expert at reading handwritten commercial lighting takeoff sheets for HHH Building Services.

These ${images.length} photo(s) show a handwritten lighting audit / takeoff sheet filled out by a field technician. The sheet typically has:
- A header section with project info (customer name, contact person, phone, meter number, address)
- Rows organized by AREA (e.g., "Warehouse", "Office", "Parking Lot", "Break Room")
- Each area has fixture rows showing: existing fixture type, quantity, wattage, and the proposed LED replacement fixture, quantity, wattage

Read EVERY row carefully. Handwriting may be messy — do your best to interpret it.

For each fixture row, determine:
- "name": the existing fixture description (e.g., "4-Lamp T8 4ft Troffer", "400W Metal Halide High Bay")
- "qty": number of fixtures (integer)
- "existW": existing system wattage per fixture INCLUDING ballast loss. Common wattages:
  4L T8 4ft: 112W | 3L T8 4ft: 84W | 2L T8 4ft: 56W
  4L T12 4ft: 172W | 2L T12 4ft: 86W
  6L T5HO HB: 351W | 4L T5HO HB: 234W
  400W MH: 458W | 250W MH: 288W | 1000W MH: 1080W
  400W HPS: 465W | 250W HPS: 295W | 150W HPS: 188W
  175W MH WP: 210W | 100W MH WP: 120W
- "newW": proposed LED replacement wattage per fixture (integer)
- "ledProduct": the LED replacement product name if written (e.g., "LED 2x4 Troffer 32W")
- "location": "interior" or "exterior" based on area name / context
- "height": estimated mounting height in feet:
  Office/drop ceiling: 9 | Retail/open ceiling: 10-12 | Warehouse/high bay: 18-30
  Exterior wall pack: 12-15 | Exterior pole: 20-35
- "fixtureCategory": one of "Linear", "High Bay", "Low Bay", "Recessed", "Surface Mount", "Wall Pack", "Flood", "Area Light", "Canopy", "Outdoor", "Other"
- "lightingType": one of "T12", "T8", "T5", "T5HO", "Metal Halide", "HPS", "Mercury Vapor", "Halogen", "Incandescent", "CFL", "LED", "Other"

Return ONLY valid JSON (no markdown, no backticks):
{
  "header": {
    "customerName": "<project/customer name or empty string>",
    "contact": "<contact person or empty string>",
    "phone": "<phone number or empty string>",
    "meterNumber": "<meter number or empty string>",
    "address": "<address or empty string>"
  },
  "areas": [
    {
      "areaName": "<area name>",
      "fixtures": [
        {
          "name": "<existing fixture description>",
          "qty": <integer>,
          "existW": <integer>,
          "newW": <integer>,
          "ledProduct": "<LED product name or empty string>",
          "location": "<interior|exterior>",
          "height": <integer>,
          "fixtureCategory": "<category>",
          "lightingType": "<lamp type>"
        }
      ]
    }
  ]
}

If you cannot read a value, use your best guess based on context. If a field is truly unreadable, use 0 for numbers and empty string for text.
Group fixtures under the correct area. If no area names are written, use "Area 1", "Area 2", etc.
Return ONLY the JSON object, nothing else.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    const aiData = await response.json();
    if (aiData.error) {
      console.error('[Dougie] Claude API error:', aiData.error);
      return new Response(JSON.stringify({ error: aiData.error.message || 'AI request failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const content = aiData.content?.map((c: any) => c.text || '').join('') || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse takeoff data', raw: content }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.header || !parsed.areas) {
      return new Response(JSON.stringify({ error: 'Invalid response structure', raw: content }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, header: parsed.header, areas: parsed.areas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[Dougie] Error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
