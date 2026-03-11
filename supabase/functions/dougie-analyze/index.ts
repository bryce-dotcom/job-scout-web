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

    const prompt = `You are Dougie. You read photos of handwritten lighting takeoff forms and return structured JSON.

THE FORM has a HEADER at top and a DATA TABLE below.

HEADER (top of each page):
  Left: "Project Name" / "Address" / "City"
  Right: "Meter #" / "Contact" / "Phone"
  Far right: "SBE, MID, Large=" (one circled) / "Hours"

DATA TABLE — each page has exactly 8 printed row numbers (1–8). The rows are pre-printed. Only rows where the rep wrote something count. Each row is ONE line item spanning the full width:

  LEFT SIDE (existing fixture):
    Line # | Tick marks (ignore) | Total Fixtures (qty) | Fixture Type | Lamp Type | Wattage
  RIGHT SIDE (proposed new fixture, same row):
    Total Fixtures (new) | Fixture Type (new) | Wattage (new) | Controls | HT | Notes

The LAST column "Notes" is where the rep writes the area/room name (e.g. "Warehouse", "Office", "Parking Lot"). Use Notes as areaName. If Notes is blank, use "Line X" (the row number).

ROW COUNTING: Each page has EXACTLY 8 pre-printed rows. Do NOT create more entries than there are filled rows. If the form has 2 pages with 8 rows each, the maximum is 16 entries. Count the filled rows carefully — blank rows don't count.

HOW TO READ THE FIXTURE TYPE AND LAMP TYPE:
Reps write shorthand. Read EXACTLY what is written. Do NOT assume or default.

  "T12" means T12 fluorescent. "T8" means T8 fluorescent. These are DIFFERENT — T12 is older/fatter, T8 is newer/thinner. If the writing says "12" it is T12, not T8.
  "8'" or "8ft" means 8-foot length. "4'" or "4ft" means 4-foot.
  "2L" = 2-Lamp. "3L" = 3-Lamp. "4L" = 4-Lamp. The number BEFORE the L is the lamp count.

  Common combos reps write:
    "2L T12 8'" or "T12-8'-2L" → "2-Lamp T12 8ft Strip" (lightingType: T12, fixtureCategory: Linear)
    "1L T12 8'" → "1-Lamp T12 8ft Strip" (lightingType: T12, fixtureCategory: Linear)
    "4L T12 8'" → "4-Lamp T12 8ft Strip" (lightingType: T12, fixtureCategory: Linear)
    "4L T8 4'" or "2x4 T8" → "4-Lamp T8 4ft Troffer" (lightingType: T8, fixtureCategory: Recessed)
    "2L T8 4'" or "1x4 T8" → "2-Lamp T8 4ft Strip" (lightingType: T8, fixtureCategory: Linear)
    "MH 400" or "400 MH" → "400W Metal Halide High Bay" (lightingType: Metal Halide, fixtureCategory: High Bay)
    "HPS 250" → "250W HPS Wall Pack" (lightingType: HPS, fixtureCategory: Wall Pack)
    "WP" = Wall Pack. "HB" = High Bay. "LB" = Low Bay.

  T12 8ft fixtures are VERY COMMON on these forms. They are typically strip/linear fixtures in warehouses, shops, and storage areas. If you see "8'" with "T12" or just "12", it is a T12 8ft strip — NOT a T8, NOT a troffer, NOT 4ft.

WATTAGES (system watts with ballast). Use to fill in blank wattage OR to cross-check:
  T12 8ft: 1-Lamp=110W, 2-Lamp=220W, 4-Lamp=440W
  T12 4ft: 1-Lamp=46W, 2-Lamp=86W, 3-Lamp=130W, 4-Lamp=172W
  T8 4ft: 1-Lamp=32W, 2-Lamp=56W, 3-Lamp=84W, 4-Lamp=112W
  T8 8ft: 1-Lamp=60W, 2-Lamp=120W
  T5HO: 2-Lamp=118W, 4-Lamp=234W, 6-Lamp=351W
  Metal Halide: 175W=210W, 250W=288W, 400W=458W, 1000W=1080W
  HPS: 100W=120W, 150W=188W, 250W=295W, 400W=465W

WATTAGE CHECK: If the written wattage looks like a per-lamp value, multiply by lamp count. Example: "2L T12 8'" with "110" written → system wattage = 220W (110 × 2). Always use system wattage for existW.

LED wattage estimates (if not written): T12 8ft strip→44W, T12 4ft→25W, T8 4ft troffer→32W, 400W HB→150W, 250W HB→100W, WP→30W

Return ONLY this JSON (no markdown, no backticks):
{
  "rawTranscription": "Write ALL text from ALL pages, row by row, BEFORE structuring. Page 1 Header: ... | Line 1: [qty] [type] [lamp] [watts] > [new qty] [new type] [new watts] [ctrl] [ht] [notes] | Line 2: ...",
  "header": {
    "customerName": "", "contact": "", "phone": "", "email": "",
    "meterNumber": "", "accountNumber": "",
    "address": "", "city": "", "state": "", "zip": "",
    "ein": "", "utilityCompany": "", "programType": "",
    "date": "", "operatingHours": "", "notes": ""
  },
  "areas": [
    {
      "areaName": "from Notes (last column), or Line X if blank",
      "rowNumber": "P1-R1",
      "notes": "",
      "fixtures": [
        {
          "name": "e.g. 2-Lamp T12 8ft Strip",
          "qty": 1,
          "existW": 220,
          "newW": 44,
          "newQty": 1,
          "newFixtureType": "",
          "ledProduct": "",
          "location": "interior",
          "height": 10,
          "fixtureCategory": "Linear",
          "lightingType": "T12",
          "controls": false
        }
      ]
    }
  ]
}

RULES:
- One physical row on the form = one entry in areas. The left side and right side of a row are the SAME entry.
- Do NOT create more entries than filled rows. 8 rows per page max. Count carefully.
- Notes (last column) = areaName. If blank, use "Line" + the row number (e.g. "Line 1").
- rawTranscription is mandatory — transcribe everything BEFORE building JSON.
- Read what is written. Do not assume T8 when it says T12. Do not assume 4ft when it says 8ft.
- qty and existW are integers, not strings.
- Meter # is on the RIGHT side of the header. Look carefully.`;

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
