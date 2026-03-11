import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { images, referenceFormUrl } = await req.json();

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

    // Fetch reference form template if available (stored in Supabase Storage)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let referenceBlocks: any[] = [];

    // Try to fetch reference form from storage
    const refUrl = referenceFormUrl || `${SUPABASE_URL}/storage/v1/object/public/audit-photos/dougie/takeoff-template.jpg`;
    try {
      const refResp = await fetch(refUrl);
      if (refResp.ok) {
        const refBuffer = await refResp.arrayBuffer();
        const refBase64 = btoa(String.fromCharCode(...new Uint8Array(refBuffer)));
        const contentType = refResp.headers.get('content-type') || 'image/jpeg';
        referenceBlocks = [
          {
            type: 'text',
            text: 'REFERENCE: This is the BLANK takeoff form template. Study its layout — every column header, every row slot, every field in the header. The filled-in pages that follow use this EXACT form. You MUST find and read EVERY row and field that exists on this template.',
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentType.startsWith('image/') ? contentType : 'image/jpeg',
              data: refBase64,
            },
          },
        ];
        console.log('[Dougie] Reference form loaded successfully');
      } else {
        console.log('[Dougie] No reference form found at', refUrl, '- proceeding without');
      }
    } catch (refErr) {
      console.log('[Dougie] Could not fetch reference form:', refErr.message);
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
        text: `FILLED-IN PAGE ${idx + 1} of ${images.length} — read EVERY line on this page`,
      },
    ])).flat();

    const prompt = `You are Dougie. You read photos of handwritten "Energy Scout" lighting takeoff forms and return structured JSON.

THE FORM has two sections: a HEADER at the top and a DATA TABLE below it.

HEADER (top of each page, 3 rows):
  Left side: "Project Name" / "Address" / "City"
  Right side: "Meter #" / "Contact" / "Phone"
  Far right: "SBE, MID, Large=" (one is circled) / "Hours"

DATA TABLE — each page has 8 numbered rows (1-8). Each row spans the full width of the page and contains BOTH existing AND new fixture data side by side. The row is ONE line item, not two.

Reading left to right across ONE row:
  1. Line # — printed number (1-8)
  2. Tick marks — tally marks the rep uses to count fixtures (ignore these)
  3. Total Fixtures — the count of EXISTING fixtures (this is "qty")
  4. Fixture Type — what the existing fixture is (e.g. "2x4", "HB", "WP", "1x4")
  5. Lamp Type — the existing lamp (e.g. "T8", "T12", "MH", "HPS", "CFL")
  6. Wattage — existing system wattage (this is "existW")
  [gap/divider]
  7. Total Fixtures (new) — count of replacement fixtures (this is "newQty")
  8. Fixture Type (new) — the proposed replacement (e.g. "LED panel", "LED HB")
  9. Wattage (new) — the new LED wattage (this is "newW")
  10. Controls — Y or N
  11. HT — mounting height in feet (applies to both existing and new)
  12. Notes — this is the AREA NAME (e.g. "Warehouse", "Office", "Parking lot", "Shop floor")

IMPORTANT: The "Notes" column (last column, far right) is where the rep writes the location/area name. Use this as the areaName. If Notes is also blank, use "Line X" (e.g. "Line 1", "Line 2").

The printed column header "Area Name" exists on the form between Tick Marks and Total Fixtures but reps almost NEVER fill it in. Ignore it. The area name is in Notes.

INSTRUCTIONS:
1. Read the header on page 1. Extract Project Name, Meter #, Address, City, Contact, Phone, Hours, and which of SBE/MID/Large is circled.
2. Go through every row on every page. Each row with ANY handwriting = one entry. The left side (columns 3-6) is the EXISTING fixture. The right side (columns 7-12) is the NEW fixture and notes. They are the SAME row, the SAME entry.
3. Build a fixture name from Fixture Type + Lamp Type. Examples:
   - Fixture Type "2x4" + Lamp Type "T8" + "4L" written nearby = "4-Lamp T8 4ft 2x4 Troffer"
   - Fixture Type "HB" + Lamp Type "MH" = "Metal Halide High Bay"
   - Fixture Type "WP" + Lamp Type "HPS" = "HPS Wall Pack"
   - Fixture Type "1x4" + Lamp Type "T8" + "2L" = "2-Lamp T8 4ft 1x4 Strip"

Abbreviations: MH=Metal Halide, HPS=High Pressure Sodium, MV=Mercury Vapor, INC=Incandescent, Hal=Halogen, CFL=Compact Fluorescent, BB=Battery Backup, HB=High Bay, LB=Low Bay, WP=Wall Pack, 2x4/2x2/1x4=troffer sizes, 4L/3L/2L=lamp count

Wattages (system watts with ballast) — use these if wattage is not written:
  4-Lamp T8: 112W | 3-Lamp T8: 84W | 2-Lamp T8: 56W | 1-Lamp T8: 32W
  4-Lamp T12: 172W | 2-Lamp T12: 86W | 1-Lamp T12: 46W
  6-Lamp T5HO: 351W | 4-Lamp T5HO: 234W | 2-Lamp T5HO: 118W
  400W MH: 458W | 250W MH: 288W | 175W MH: 210W | 1000W MH: 1080W
  400W HPS: 465W | 250W HPS: 295W | 150W HPS: 188W | 100W HPS: 120W
LED estimates if not written: T8 troffer→32W, T12→30W, 400W HB→150W, 250W HB→100W, WP→30W

Return ONLY this JSON (no markdown, no backticks, no explanation):
{
  "rawTranscription": "Write every piece of text from every page here first, row by row. Page 1 Header: ... | Line 1: [qty] [fixture type] [lamp type] [wattage] > [new qty] [new type] [new watt] [controls] [ht] [notes/area] | Line 2: ...",
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
    "programType": "",
    "date": "",
    "operatingHours": "",
    "notes": ""
  },
  "areas": [
    {
      "areaName": "from Notes column (last column). If blank use Line X",
      "rowNumber": "P1-R1",
      "notes": "",
      "fixtures": [
        {
          "name": "e.g. 4-Lamp T8 4ft 2x4 Troffer",
          "qty": "from Total Fixtures (existing) column",
          "existW": "from Wattage (existing) column",
          "newW": "from Wattage (new) column",
          "newQty": "from Total Fixtures (new) column",
          "newFixtureType": "from Fixture Type (new) column",
          "ledProduct": "",
          "location": "interior or exterior — infer from area name",
          "height": "from HT column",
          "fixtureCategory": "Linear or High Bay or Low Bay or Recessed or Surface Mount or Wall Pack or Flood or Area Light or Canopy or Outdoor or Other",
          "lightingType": "from Lamp Type column: T12, T8, T5, T5HO, Metal Halide, HPS, Mercury Vapor, Halogen, Incandescent, CFL, LED, Other",
          "controls": "true if Y, false if N or blank"
        }
      ]
    }
  ]
}

RULES:
- One physical row = one entry in areas. Never split left/right into two entries. Never combine two rows.
- Notes column = areaName. The printed "Area Name" column is always blank — ignore it.
- rawTranscription is mandatory. Write everything you see before building the JSON.
- Guess unclear handwriting. A wrong guess beats a missing row.
- qty and existW come from the LEFT side (existing fixtures). newQty and newW come from the RIGHT side (new fixtures).
- Each area has exactly one fixture entry (one row = one fixture type in one area).
- Meter # is on the RIGHT side of the header row. Look carefully.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: [
              ...referenceBlocks,
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
