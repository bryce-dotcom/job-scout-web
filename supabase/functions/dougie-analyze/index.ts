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
    if (images.length > 5) {
      return new Response(JSON.stringify({ error: 'Maximum 5 images allowed' }),
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

    const prompt = `You are Dougie, an expert at reading handwritten commercial lighting takeoff sheets.

CRITICAL INSTRUCTIONS — READ CAREFULLY:

1. FIRST, transcribe EVERY piece of text you can see on ALL pages. Read every word, number, abbreviation, note, and scribble. Do not skip anything. Look in corners, margins, headers, footers, column headers, and between rows.

2. THEN, structure what you transcribed into JSON.

WHAT TO LOOK FOR IN THE HEADER / TOP SECTION:
These sheets are filled out by lighting auditors in the field. The header area typically contains some or all of:
- Customer / Business / Project name (might say "Customer:", "Project:", "Business:", "Name:", or just be the biggest text at the top)
- Contact person name (might say "Contact:", "Attn:", "PM:", or be next to the business name)
- Phone number (any 7 or 10 digit number, might have dashes or dots — look for patterns like 801-555-1234, (801) 555-1234, 8015551234)
- Meter number / Account number (electric utility meter — might say "Meter:", "Meter #:", "Acct:", "Acct #:", "Account:", or just be a long number near the top. Often 8-12 digits. VERY IMPORTANT — look hard for this)
- Address (street address, might include city/state/zip)
- City, State, ZIP (might be separate from street address)
- Email address (look for @ symbol)
- EIN / Tax ID (might say "EIN:", "Tax ID:", "TIN:")
- Date
- Utility company name (e.g., "Rocky Mountain Power", "SRP", "APS")
- Any other header info (building type, square footage, operating hours)

WHAT TO LOOK FOR IN THE FIXTURE ROWS:
The main body is a table or list of fixtures organized by area/room. Look for:

Common abbreviations technicians use:
  T8, T12, T5, T5HO = fluorescent tube types
  MH = Metal Halide | HPS = High Pressure Sodium | MV = Mercury Vapor
  HB = High Bay | LB = Low Bay | WP = Wall Pack
  2x4, 2x2, 1x4 = troffer/panel sizes
  4L, 3L, 2L, 1L = number of lamps (4-lamp, 3-lamp, etc.)
  LED = Light Emitting Diode replacement
  W = Watts
  "→" or arrow = "replaced by" / "to"
  Qty, # = quantity
  Ext = Exterior | Int = Interior
  Ht = Height | Clg = Ceiling

Common existing fixture wattages (including ballast):
  4-Lamp T8 4ft: 112W | 3-Lamp T8 4ft: 84W | 2-Lamp T8 4ft: 56W
  4-Lamp T12 4ft: 172W | 2-Lamp T12 4ft: 86W | 1-Lamp T12 4ft: 46W
  6-Lamp T5HO High Bay: 351W | 4-Lamp T5HO High Bay: 234W
  400W Metal Halide: 458W | 250W Metal Halide: 288W | 175W Metal Halide: 210W | 1000W Metal Halide: 1080W
  400W HPS: 465W | 250W HPS: 295W | 150W HPS: 188W | 100W HPS: 120W
  100W MH Wall Pack: 120W | 175W MH Wall Pack: 210W | 250W MH Shoebox: 295W

If you see a fixture type but no wattage written, USE the wattage from the table above.
If you see a wattage but no fixture type, describe the fixture as best you can.

For LED replacement wattage: if written on the sheet use that value. If not written, estimate:
  T8 troffer → 32W LED | T12 troffer → 30W LED
  T8 strip 4ft → 22W LED | High bay MH 400W → 150W LED
  High bay MH 250W → 100W LED | Wall pack → 25-40W LED
  Shoebox/area light → 70-150W LED

RETURN THIS EXACT JSON STRUCTURE (no markdown, no backticks, no explanation):
{
  "rawTranscription": "<Write out EVERYTHING you can read from ALL pages, line by line, preserving the layout as closely as possible. Include crossed-out text in [brackets]. This is your working notes.>",
  "header": {
    "customerName": "",
    "contact": "",
    "phone": "",
    "email": "",
    "meterNumber": "",
    "accountNumber": "",
    "address": "",
    "city": "",
    "state": "",
    "zip": "",
    "ein": "",
    "utilityCompany": "",
    "date": "",
    "operatingHours": 0,
    "notes": ""
  },
  "areas": [
    {
      "areaName": "Area Name",
      "notes": "",
      "fixtures": [
        {
          "name": "4-Lamp T8 4ft Troffer",
          "qty": 10,
          "existW": 112,
          "newW": 32,
          "ledProduct": "",
          "location": "interior",
          "height": 9,
          "fixtureCategory": "Recessed",
          "lightingType": "T8"
        }
      ]
    }
  ]
}

FIELD RULES:
- "rawTranscription": REQUIRED. Write out everything you see. This ensures you don't miss anything.
- "header" fields: Fill in everything you can find. Use empty string "" for text fields you can't find, 0 for numbers.
- "meterNumber": Look VERY hard for this. It might be labeled "Meter", "Meter #", "Mtr", "M#", "Acct", or just be a prominent number in the header. Utility meter numbers are typically 8-12 digits.
- "accountNumber": If there's a separate account number from meter number, put it here.
- "operatingHours": Daily operating hours if written (e.g., "12 hrs", "24/7" = 24, "8-5" = 9)
- "areas[].areaName": Use what's written. If none, use "Area 1", "Area 2", etc.
- "fixtures[].name": Full descriptive name including lamp count, type, and size
- "fixtures[].qty": The count of this fixture type in this area
- "fixtures[].existW": System wattage INCLUDING ballast. Use the reference table above if only lamp type is written.
- "fixtures[].newW": LED replacement wattage. Estimate if not written.
- "fixtures[].location": "interior" or "exterior" — infer from area name (parking lot, exterior, outside = exterior)
- "fixtures[].height": Mounting height in feet. Estimate from area type if not written.
- "fixtures[].fixtureCategory": One of "Linear", "High Bay", "Low Bay", "Recessed", "Surface Mount", "Wall Pack", "Flood", "Area Light", "Canopy", "Outdoor", "Other"
- "fixtures[].lightingType": One of "T12", "T8", "T5", "T5HO", "Metal Halide", "HPS", "Mercury Vapor", "Halogen", "Incandescent", "CFL", "LED", "Other"

IMPORTANT: Do NOT skip rows. Do NOT skip header fields. Transcribe EVERYTHING first, then structure it. If handwriting is unclear, give your best guess rather than skipping.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              ...imageBlocks,
              { type: 'text', text: prompt },
            ],
          },
        ],
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

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.header || !parsed.areas) {
        return new Response(JSON.stringify({ error: 'Invalid response structure', raw: content }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: true,
        header: parsed.header,
        areas: parsed.areas,
        rawTranscription: parsed.rawTranscription || '',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (parseErr) {
      console.error('[Dougie] JSON parse error:', parseErr);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: content }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('[Dougie] Error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
