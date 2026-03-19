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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const companyId = Deno.env.get('LENARD_COMPANY_ID');

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

    // ============ Fetch recent corrections for few-shot learning ============
    let correctionsBlock = '';
    if (SUPABASE_URL && SERVICE_KEY && companyId) {
      try {
        const corrRes = await fetch(
          `${SUPABASE_URL}/rest/v1/dougie_corrections?company_id=eq.${companyId}&order=created_at.desc&limit=30`,
          { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
        );
        if (corrRes.ok) {
          const corrections = await corrRes.json();
          if (corrections.length > 0) {
            const lines = corrections.map((c: any) =>
              `- ${c.field_type}.${c.field_name}: AI wrote "${c.original_value}" → user corrected to "${c.corrected_value}"${c.context?.areaName ? ` (area: ${c.context.areaName})` : ''}`
            );
            correctionsBlock = `\n\nPAST CORRECTIONS FROM THIS TEAM (learn from these — avoid repeating the same mistakes):
${lines.join('\n')}`;
          }
        }
      } catch (e) {
        console.warn('[Dougie] Could not fetch corrections:', e);
      }
    }

    // ============ PASS 1: Pure OCR — just read every character ============
    const ocrPrompt = `Look at this handwritten form. It is a lighting takeoff sheet with a header section at top and a table of rows below.

Your ONLY job is to transcribe exactly what is written. Do not interpret, do not guess fixture types, do not fill in blanks. Just write down every character you can see.

For the HEADER area at the top, write each field label and what is written next to it.

For the DATA TABLE, each page has rows numbered 1-8. For each row that has ANY handwriting, write down every piece of text from left to right, separated by pipes (|). Include the row number.

Format your response exactly like this:
=== HEADER ===
Project Name: [what is written]
Address: [what is written]
City: [what is written]
Meter #: [what is written]
Contact: [what is written]
Phone: [what is written]
Hours: [what is written]
Program: [which of SBE/MID/Large is circled]

=== PAGE 1 ROWS ===
Row 1: [everything written left to right, separated by |]
Row 2: [everything written left to right, separated by |]
...
=== PAGE 2 ROWS ===
Row 1: [everything written left to right, separated by |]
...

Rules:
- Write EXACTLY what you see. If it says "T12" write "T12". If it says "8'" write "8'". If it says "2L" write "2L".
- Include tick marks as a count if visible (e.g. "IIII II" = 7)
- If you can't read a character, write [?]
- Skip completely blank rows
- Do NOT add any interpretation or fixture names — just raw characters`;

    console.log('[Dougie] Starting Pass 1: OCR transcription');
    const ocrResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
            content: [...imageBlocks, { type: 'text', text: ocrPrompt }],
          },
        ],
      }),
    });

    const ocrData = await ocrResponse.json();
    if (ocrData.error) {
      console.error('[Dougie] OCR error:', ocrData.error);
      return new Response(JSON.stringify({ error: ocrData.error.message || 'OCR failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const rawTranscription = ocrData.content?.map((c: any) => c.text || '').join('') || '';
    console.log('[Dougie] Pass 1 complete. Transcription length:', rawTranscription.length);

    // ============ PASS 2: Structure the transcription into JSON (with images for cross-reference) ============
    const structurePrompt = `You are given a raw transcription of a handwritten lighting takeoff form AND the original images. Use BOTH to produce accurate structured JSON. If the transcription and image disagree, trust the image.

HERE IS THE RAW TRANSCRIPTION:
---
${rawTranscription}
---

THE FORM LAYOUT (columns left to right in each row):
1. Line # (pre-printed 1-8)
2. Tick marks (tally marks counting fixtures — this IS the fixture count if no separate total is written)
3. Total Fixtures (the fixture count — if blank, count the tick marks)
4. Fixture Type (e.g. "2x4", "1x4", "HB", "WP", or blank)
5. Lamp Type (e.g. "T12", "T8", "MH", "HPS") — CRITICAL: read this exactly, T12 ≠ T8
6. Wattage (existing wattage)
[divider — right side of same row]
7. Total Fixtures (new)
8. Fixture Type (new)
9. Wattage (new/LED)
10. Controls (Y/N)
11. HT (height in feet)
12. Notes — this is the AREA NAME (room/location like "Warehouse", "Office", "Parking")

RULES FOR BUILDING THE JSON:
- The LAST column (Notes) = areaName. If blank, use "Line X" where X is the row number.
- One row = one entry in areas array. Left side and right side are the SAME row.
- Do NOT create more entries than rows in the transcription.
- qty and existW must be integers.

FIXTURE NAME: Build from what was transcribed:
- "2L" + "T12" + "8'" = "2-Lamp T12 8ft Strip"
- "4L" + "T8" + "4'" = "4-Lamp T8 4ft Troffer"
- "MH" + "400" = "400W Metal Halide High Bay"
- If just a lamp type and length: "T12 8'" = "T12 8ft Strip"

WATTAGES (system watts, use if not written or to cross-check):
T12 8ft: 1L=110W, 2L=220W, 4L=440W
T12 4ft: 1L=46W, 2L=86W, 3L=130W, 4L=172W
T8 4ft: 1L=32W, 2L=56W, 3L=84W, 4L=112W
T8 8ft: 1L=60W, 2L=120W
T5HO: 2L=118W, 4L=234W, 6L=351W
MH: 175W=210W, 250W=288W, 400W=458W, 1000W=1080W
HPS: 100W=120W, 150W=188W, 250W=295W, 400W=465W

If the transcription shows a wattage that matches a per-lamp value (e.g. 110 for T12 8ft), multiply by lamp count for system wattage.

LED estimates if not written: T12 8ft→44W, T12 4ft→25W, T8 4ft→32W, 400W HB→150W, WP→30W

fixtureCategory mapping:
- T12/T8 with 8ft or strip/1x4 → "Linear"
- T12/T8 with 2x4 or troffer → "Recessed"
- MH/HPS high bay or HB → "High Bay"
- Wall pack or WP → "Wall Pack"
- Exterior pole/flood → "Outdoor"
- Otherwise → "Linear"
${correctionsBlock}

Return ONLY valid JSON (no markdown, no backticks):
{
  "rawTranscription": "${rawTranscription.substring(0, 100).replace(/"/g, '\\"')}...",
  "header": {
    "customerName": "", "contact": "", "phone": "", "email": "",
    "meterNumber": "", "accountNumber": "",
    "address": "", "city": "", "state": "", "zip": "",
    "ein": "", "utilityCompany": "", "programType": "",
    "date": "", "operatingHours": "", "notes": ""
  },
  "areas": [
    {
      "areaName": "from Notes column or Line X",
      "rowNumber": "P1-R1",
      "notes": "",
      "fixtures": [{
        "name": "2-Lamp T12 8ft Strip",
        "qty": 10,
        "existW": 220,
        "newW": 44,
        "newQty": 10,
        "newFixtureType": "",
        "ledProduct": "",
        "location": "interior",
        "height": 10,
        "fixtureCategory": "Linear",
        "lightingType": "T12",
        "controls": false
      }]
    }
  ]
}`;

    console.log('[Dougie] Starting Pass 2: Structuring (with images)');
    const structResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
            // Send images + structuring prompt so Pass 2 can cross-reference handwriting
            content: [...imageBlocks, { type: 'text', text: structurePrompt }],
          },
        ],
      }),
    });

    const structData = await structResponse.json();
    if (structData.error) {
      console.error('[Dougie] Structure error:', structData.error);
      return new Response(JSON.stringify({ error: structData.error.message || 'Structuring failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const structContent = structData.content?.map((c: any) => c.text || '').join('') || '';
    const jsonMatch = structContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse structured data', raw: structContent, transcription: rawTranscription }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.header || !parsed.areas) {
        return new Response(JSON.stringify({ error: 'Invalid response structure', raw: structContent, transcription: rawTranscription }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Override rawTranscription with the actual OCR output
      parsed.rawTranscription = rawTranscription;

      return new Response(JSON.stringify({
        success: true,
        header: parsed.header,
        areas: parsed.areas,
        rawTranscription: rawTranscription,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (parseErr) {
      console.error('[Dougie] JSON parse error:', parseErr);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: structContent, transcription: rawTranscription }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('[Dougie] Error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
