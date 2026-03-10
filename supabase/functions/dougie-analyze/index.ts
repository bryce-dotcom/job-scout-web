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

    const prompt = `You are Dougie, an expert at reading handwritten lighting takeoff sheets and audit forms.

STEP 1 — IDENTIFY THE FORM
Look at the page(s) and determine the form structure. Do NOT assume a fixed layout. Instead:
  a) Read every column header printed on the form (left to right).
  b) Read every header/info field at the top of the form (project name, address, meter #, contact, etc.).
  c) Count how many data rows exist per page (often 8, but could be any number).
  d) Note if the form has an EXISTING side and a NEW/PROPOSED side, or just one side.

KNOWN FORM: "Energy Scout" takeoff (common but not guaranteed):
  Header: Project Name | Meter # | SBE/MID/Large | Address | Contact | Hours | City | Phone
  Columns: ROW # | TICK MARK | AREA NAME | TOTAL FIX | FIXTURE TYPE | LAMP TYPE | WATTAGE || TOTAL FIX | FIXTURE TYPE | WATTAGE | CONTROLS Y/N | HT | NOTES
  Footer legend: MH, INC, Hal, CFL, T8, T12, T5, BB

If the form does NOT match this layout, adapt. Read whatever columns ARE present. Some forms may be missing columns like Area Name, Controls, Height, or Notes — that's fine, leave those fields empty in the output.

STEP 2 — RAW TRANSCRIPTION (MANDATORY)
Before structuring anything, write out EVERY piece of text you see on ALL pages, row by row:
  'Page 1 Header: [all header text] | Row 1: [all text in row] | Row 2: [all text in row] ...'
This is your working draft. Be thorough. Include faint or unclear text with your best guess.

STEP 3 — READ THE HEADER
Look for any of these fields in the top/header area of the form. Different forms use different labels:
  - Customer/Project Name (may say "Project Name", "Customer", "Company", "Name")
  - Address, City, State, ZIP
  - Contact name, Phone, Email
  - Meter # or Meter Number (often on the RIGHT side of the header — look carefully)
  - Account # or Account Number
  - EIN or Tax ID
  - Program type (SBE, MID, Large — whichever is circled/checked)
  - Operating Hours (may say "Hours", "Hrs", "Operating Hours")
  - Date
If a field isn't on the form, leave it as empty string.

STEP 4 — READ EVERY ROW
Go through EVERY row on EVERY page. For each row that has ANY writing:
  - Read ALL columns that exist on THIS form (don't force columns that aren't there)
  - If the form has an "Area Name" or "Location" column, read it. If not, use "" for areaName.
  - If the form has existing AND new fixture sides, read both. If only one side, fill what you can.
  - Each row with writing = one entry in "areas". NEVER combine rows. NEVER skip rows.

After reading all pages, COUNT your rows. If you found fewer than expected, re-examine:
  - Page boundaries (last row of page 1, first rows of page 2)
  - Faint or light handwriting
  - Rows with only 1-2 columns filled in
  - Continuation pages

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
  "rawTranscription": "<MANDATORY — every piece of text from all pages>",
  "formType": "<what form this appears to be, e.g. 'Energy Scout takeoff', 'custom audit form', 'lined notebook', etc.>",
  "header": {
    "customerName": "<from project/customer name field, or ''>",
    "contact": "<from contact field, or ''>",
    "phone": "<from phone field, or ''>",
    "email": "<from email field, or ''>",
    "meterNumber": "<from meter # field — look RIGHT side of header, or ''>",
    "accountNumber": "<from account # field, or ''>",
    "address": "<from address field, or ''>",
    "city": "<from city field, or ''>",
    "state": "<from state field, or ''>",
    "zip": "<from zip field, or ''>",
    "ein": "<from EIN/tax ID field, or ''>",
    "utilityCompany": "<from utility field, or ''>",
    "programType": "<from program type field — whichever is circled/checked, or ''>",
    "date": "<from date field, or ''>",
    "operatingHours": "<from hours field — integer, or ''>",
    "notes": ""
  },
  "areas": [
    {
      "areaName": "<from area/location column if it exists, otherwise ''>",
      "rowNumber": "<page and row, e.g. 'P1-R3' = page 1 row 3>",
      "notes": "<from notes column if it exists, otherwise ''>",
      "fixtures": [
        {
          "name": "<full description: e.g. '4-Lamp T8 4ft Troffer'>",
          "qty": "<existing fixture count>",
          "existW": "<existing wattage>",
          "newW": "<new/proposed wattage>",
          "newQty": "<new fixture count — may differ from existing, or same if not specified>",
          "newFixtureType": "<new fixture type if specified>",
          "ledProduct": "",
          "location": "<'interior' or 'exterior' — infer from area name or context>",
          "height": "<mounting height in feet if on form, or ''>",
          "fixtureCategory": "<one of: Linear, High Bay, Low Bay, Recessed, Surface Mount, Wall Pack, Flood, Area Light, Canopy, Outdoor, Other>",
          "lightingType": "<lamp type: T12, T8, T5, T5HO, Metal Halide, HPS, Mercury Vapor, Halogen, Incandescent, CFL, LED, Other>",
          "controls": "<true/false if controls column exists, or false>"
        }
      ]
    }
  ]
}

ABSOLUTE RULES:
- Every row with ANY writing = one entry in "areas". Do NOT combine rows. Do NOT skip rows.
- Read ALL pages. Forms may have 8, 10, 15+ rows per page. Count what's actually there.
- "rawTranscription" is MANDATORY. Write everything you see before structuring.
- If handwriting is unclear, GUESS rather than skip. A wrong guess is better than a missing row.
- If a column doesn't exist on this form, use empty string — don't make up data.
- "meterNumber" is often on the RIGHT side of the header. Look CAREFULLY.`;

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
