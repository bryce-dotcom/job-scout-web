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

    const prompt = `You are Dougie, an expert at reading handwritten "Energy Scout" lighting takeoff sheets for HHH Building Services.

THE EXACT FORM LAYOUT (you MUST know this):
This is the "Energy Scout" takeoff form. It is a printed form filled in by hand. Each page has:

HEADER (top of every page — 3 rows):
  Row 1: "Project Name" (left side)  |  "Meter #" (right side)  |  "SBE, MID, Large=" (far right — circle one)
  Row 2: "Address" (left side)       |  "Contact" (right side)  |  "Hours" (far right)
  Row 3: "City" (left side)          |  "Phone" (right side)

FIXTURE TABLE (below header, numbered rows 1-8 per page):
  Left side = EXISTING fixtures | Right side = NEW (replacement) fixtures

  Columns left to right:
  ROW # | TICK MARK | AREA NAME | TOTAL FIX (qty) | FIXTURE TYPE | LAMP TYPE | WATTAGE  ||  TOTAL FIX (qty) | FIXTURE TYPE | WATTAGE | CONTROLS Y/N | HT (height) | NOTES

  The form has 8 numbered rows per page. Some rows may be blank. But if ANY text appears in a row, read ALL columns for that row.

FOOTER:
  Abbreviation legend: "Metal Halide - MH, Incandescent - INC, Halogen - Hal, Compact Fluorescent - CFL, T8 4', T8 U, T12 8', T5 4', Battery Backup - BB"

CRITICAL INSTRUCTIONS:

1. FIRST: Read the header on EVERY page. The first page's header is the primary one. Later pages may repeat it or have different info.

2. SECOND: Go through EVERY numbered row (1-8) on EVERY page. For each row that has ANY writing:
   - Read the Area Name
   - Read the existing fixture info (Total Fix count, Fixture Type, Lamp Type, Wattage)
   - Read the new fixture info (Total Fix count, Fixture Type, Wattage)
   - Read Controls Y/N, Height (HT), and Notes

3. COUNT the total rows you found. The user said there are 11 lines. If you found fewer, GO BACK and look again. Check for:
   - Rows that span across the page boundary (page 1 row 8 → page 2 row 1)
   - Rows with very faint or light handwriting
   - Rows where only a few columns are filled in
   - Second page rows — the form repeats with rows 1-8 on page 2

Common abbreviations:
  MH = Metal Halide | HPS = High Pressure Sodium | MV = Mercury Vapor | INC = Incandescent
  Hal = Halogen | CFL = Compact Fluorescent | BB = Battery Backup
  T8, T12, T5, T5HO = fluorescent tube types
  HB = High Bay | LB = Low Bay | WP = Wall Pack
  2x4, 2x2, 1x4 = troffer/panel sizes (e.g., "2x4 troffer")
  4L, 3L, 2L = number of lamps (4-lamp, 3-lamp, etc.)

Common wattages (system watts INCLUDING ballast):
  4-Lamp T8 4ft: 112W | 3-Lamp T8 4ft: 84W | 2-Lamp T8 4ft: 56W | 1-Lamp T8 4ft: 32W
  4-Lamp T12 4ft: 172W | 2-Lamp T12 4ft: 86W | 1-Lamp T12 4ft: 46W
  6-Lamp T5HO HB: 351W | 4-Lamp T5HO HB: 234W | 2-Lamp T5HO: 118W
  400W MH: 458W | 250W MH: 288W | 175W MH: 210W | 1000W MH: 1080W
  400W HPS: 465W | 250W HPS: 295W | 150W HPS: 188W | 100W HPS: 120W
  100W MH WP: 120W | 175W MH WP: 210W

If only lamp type is written (no wattage), use the wattages above.
If LED wattage is not written, estimate from: T8 troffer → 32W, T12 → 30W, HB 400W → 150W, HB 250W → 100W, WP → 30W

RETURN THIS EXACT JSON (no markdown, no backticks):
{
  "rawTranscription": "<REQUIRED: Write out EVERY piece of text from ALL pages, row by row. Format: 'Page 1 Header: [text] | Row 1: [text] | Row 2: [text]...' This is your working draft — be thorough.>",
  "header": {
    "customerName": "<from 'Project Name' field>",
    "contact": "<from 'Contact' field>",
    "phone": "<from 'Phone' field>",
    "email": "",
    "meterNumber": "<from 'Meter #' field — CRITICAL, look to the RIGHT of 'Project Name'>",
    "accountNumber": "",
    "address": "<from 'Address' field>",
    "city": "<from 'City' field>",
    "state": "",
    "zip": "",
    "ein": "",
    "utilityCompany": "",
    "programType": "<from 'SBE, MID, Large=' — whichever is circled>",
    "date": "",
    "operatingHours": "<from 'Hours' field — integer, daily operating hours>",
    "notes": ""
  },
  "areas": [
    {
      "areaName": "<from 'Area Name' column>",
      "rowNumber": "<which row number on the form, e.g. 'P1-R3' = page 1 row 3>",
      "notes": "<from 'Notes' column>",
      "fixtures": [
        {
          "name": "<full description: e.g. '4-Lamp T8 4ft Troffer'>",
          "qty": "<from 'Total Fix' column on the EXISTING side>",
          "existW": "<from 'Wattage' column on existing side>",
          "newW": "<from 'Wattage' column on NEW side>",
          "newQty": "<from 'Total Fix' column on the NEW side — may differ from existing qty>",
          "newFixtureType": "<from 'Fixture Type' column on NEW side>",
          "ledProduct": "",
          "location": "<'interior' or 'exterior' — infer from area name>",
          "height": "<from 'HT' column — integer feet>",
          "fixtureCategory": "<one of: Linear, High Bay, Low Bay, Recessed, Surface Mount, Wall Pack, Flood, Area Light, Canopy, Outdoor, Other>",
          "lightingType": "<from 'Lamp Type' column: T12, T8, T5, T5HO, Metal Halide, HPS, Mercury Vapor, Halogen, Incandescent, CFL, LED, Other>",
          "controls": "<from 'Controls Y/N' column: true or false>"
        }
      ]
    }
  ]
}

ABSOLUTE RULES:
- Every numbered row with ANY writing = one entry in "areas". Do NOT combine rows. Do NOT skip rows.
- The form has 8 rows per page. With 2 pages that's up to 16 possible rows. Read ALL of them.
- "rawTranscription" is MANDATORY. Write every single thing you see before structuring.
- If handwriting is unclear, GUESS rather than skip. A wrong guess is better than a missing row.
- "meterNumber" is on the RIGHT side of the header next to "Meter #". Look CAREFULLY.`;

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
