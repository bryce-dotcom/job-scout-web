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

    const prompt = `You are Dougie, an expert at reading handwritten "Energy Scout" lighting takeoff forms.

THIS IS THE EXACT FORM LAYOUT. Every page has this structure:

═══ HEADER (3 rows at top of each page) ═══
  Row 1: Column B = "Project Name" .............. Column I = "Meter #" ......... Column L = "SBE, MID, Large="
  Row 2: Column B = "Address" ................... Column I = "Contact" ......... Column N = "Hours"
  Row 3: Column B = "City" ...................... Column I = "Phone"

═══ DATA TABLE (8 numbered rows per page) ═══
The table has 14 columns (A through N). It is split into TWO halves:

  LEFT HALF = EXISTING fixtures (what is currently installed):
    Col A: ROW # (printed 1-8)
    Col B: Tick Mark (checkmark or blank)
    Col C: Area Name (often left BLANK — see areaName rule below)
    Col D: Total Fix (quantity of existing fixtures)
    Col E: Fixture Type (e.g. "2x4 troffer", "high bay", "wall pack")
    Col F: Lamp Type (e.g. "T8", "T12", "MH", "HPS")
    Col G: Wattage (existing system wattage)

  RIGHT HALF = NEW fixtures (what the rep proposes to install):
    Col I: Total Fix (quantity of new fixtures — often same as existing)
    Col J: Fixture Type (e.g. "LED panel", "LED high bay")
    Col K: Wattage (new LED wattage)
    Col L: Controls Y/N
    Col M: HT (mounting height in feet)
    Col N: Notes (description of the area/location — THIS IS IMPORTANT)

═══ FOOTER ═══
  Abbreviation legend: Metal Halide-MH, Incandescent-INC, Halogen-Hal, CFL, T8 4', T8 U, T12 8', T5 4', Battery Backup-BB

═══ PAGE 2+ ═══
  The header repeats, then another set of rows 1-8. Same exact layout.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ONE ROW = ONE ENTRY. The left half (existing) and right half (new) are the SAME row.
   Do NOT create two entries for one row. A form with 11 filled rows = exactly 11 entries.

2. THE EXISTING (LEFT) SIDE IS PRIMARY. Columns D-G tell us what's currently installed.
   The right side (I-N) is supplemental — it's the proposed replacement.

3. AREA NAME RULE: Column C ("Area Name") is often left blank by the person filling out the form.
   When it IS blank, use the NOTES column (Col N, far right) as the areaName instead.
   If BOTH Area Name and Notes are blank, use "Line X" where X is the row number (e.g. "Line 1").

4. READ EVERY PAGE. The form repeats with rows 1-8 on each page. A 2-page form has up to 16 rows.

5. RAW TRANSCRIPTION FIRST. Before structuring, write out every piece of text you see.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW TO READ EACH ROW (left to right across the page):
  Col A: Row number (1-8, printed on form)
  Col B: Tick mark (ignore)
  Col C: Area Name → use as areaName if filled in
  Col D: Total Fix (qty) → this is "qty" (EXISTING fixture count)
  Col E: Fixture Type → use to build "name" (e.g. "2x4 Troffer", "High Bay")
  Col F: Lamp Type → this is "lightingType" (e.g. T8, T12, MH, HPS)
  Col G: Wattage → this is "existW" (existing wattage)
  Col I: Total Fix (qty) → this is "newQty"
  Col J: Fixture Type → this is "newFixtureType"
  Col K: Wattage → this is "newW" (new LED wattage)
  Col L: Controls Y/N → this is "controls" (true if Y, false if N or blank)
  Col M: HT → this is "height" (mounting height in feet)
  Col N: Notes → if Col C is blank, use this as "areaName". Otherwise put in "notes".

BUILD THE FIXTURE NAME: Combine qty info + fixture type + lamp type.
  Example: Col E says "2x4" and Col F says "T8" with "4L" → name = "4-Lamp T8 4ft 2x4 Troffer"
  Example: Col E says "HB" and Col F says "MH" → name = "Metal Halide High Bay"

Common abbreviations:
  MH = Metal Halide | HPS = High Pressure Sodium | MV = Mercury Vapor | INC = Incandescent
  Hal = Halogen | CFL = Compact Fluorescent | BB = Battery Backup
  T8, T12, T5, T5HO = fluorescent tube types
  HB = High Bay | LB = Low Bay | WP = Wall Pack
  2x4, 2x2, 1x4 = troffer/panel sizes
  4L, 3L, 2L = number of lamps (4-lamp, 3-lamp, etc.)

Common wattages (system watts INCLUDING ballast):
  4-Lamp T8 4ft: 112W | 3-Lamp T8 4ft: 84W | 2-Lamp T8 4ft: 56W | 1-Lamp T8 4ft: 32W
  4-Lamp T12 4ft: 172W | 2-Lamp T12 4ft: 86W | 1-Lamp T12 4ft: 46W
  6-Lamp T5HO HB: 351W | 4-Lamp T5HO HB: 234W | 2-Lamp T5HO: 118W
  400W MH: 458W | 250W MH: 288W | 175W MH: 210W | 1000W MH: 1080W
  400W HPS: 465W | 250W HPS: 295W | 150W HPS: 188W | 100W HPS: 120W
  100W MH WP: 120W | 175W MH WP: 210W
If wattage is not written, look up from the table above based on lamp type.
If LED wattage is not written, estimate: T8 troffer→32W, T12→30W, HB 400W→150W, HB 250W→100W, WP→30W

RETURN THIS EXACT JSON (no markdown, no code fences, no backticks):
{
  "rawTranscription": "<MANDATORY: Write out ALL text from ALL pages. Format: Page 1 Header: [text] | Row 1: [Col C] [Col D] [Col E] [Col F] [Col G] → [Col I] [Col J] [Col K] [Col L] [Col M] [Col N] | Row 2: ...>",
  "formType": "Energy Scout",
  "header": {
    "customerName": "<from Project Name field on header row 1>",
    "contact": "<from Contact field on header row 2>",
    "phone": "<from Phone field on header row 3>",
    "email": "",
    "meterNumber": "<from Meter # field on header row 1 — RIGHT side, column I>",
    "accountNumber": "",
    "address": "<from Address field on header row 2>",
    "city": "<from City field on header row 3>",
    "state": "",
    "zip": "",
    "ein": "",
    "utilityCompany": "",
    "programType": "<SBE or MID or Large — whichever is circled on header row 1>",
    "date": "",
    "operatingHours": "<from Hours field on header row 2 — far right, column N>",
    "notes": ""
  },
  "areas": [
    {
      "areaName": "<Col C if filled, else Col N (Notes), else 'Line X'>",
      "rowNumber": "<e.g. 'P1-R3' = page 1 row 3>",
      "notes": "<Col N if Col C was used as areaName, else ''>",
      "fixtures": [
        {
          "name": "<built from Col E + Col F, e.g. '4-Lamp T8 4ft 2x4 Troffer'>",
          "qty": "<Col D — existing fixture count>",
          "existW": "<Col G — existing wattage>",
          "newW": "<Col K — new LED wattage>",
          "newQty": "<Col I — new fixture count>",
          "newFixtureType": "<Col J — new fixture type>",
          "ledProduct": "",
          "location": "<'interior' or 'exterior' — infer from area name>",
          "height": "<Col M — height in feet>",
          "fixtureCategory": "<Linear, High Bay, Low Bay, Recessed, Surface Mount, Wall Pack, Flood, Area Light, Canopy, Outdoor, or Other>",
          "lightingType": "<Col F — T12, T8, T5, T5HO, Metal Halide, HPS, Mercury Vapor, Halogen, Incandescent, CFL, LED, or Other>",
          "controls": "<Col L — true if Y, false if N or blank>"
        }
      ]
    }
  ]
}

ABSOLUTE RULES:
- Each physical row with ANY handwriting = exactly ONE entry in "areas". Never split, never combine.
- The LEFT side (Cols A-G) = EXISTING fixtures. The RIGHT side (Cols I-N) = NEW fixtures. Same row.
- 8 rows per page. 2 pages = up to 16 rows. Count your entries — they must match physical rows.
- "rawTranscription" is MANDATORY. Transcribe EVERYTHING before structuring.
- If handwriting is unclear, GUESS. A wrong guess is better than a missing row.
- Meter # is on header row 1, RIGHT side (Col I area). Look carefully.
- Col N (Notes) is the LAST column on the far right. It often has the area/room description.`;

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
