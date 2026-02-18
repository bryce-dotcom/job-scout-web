import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to query Supabase REST API for reference data
async function querySupabase(table: string, params: string = ''): Promise<any[]> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return [];
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, auditContext, availableProducts, fixtureTypes, prescriptiveMeasures } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch wattage reference and visual guide (the two most useful tables)
    const [wattageRef, visualGuide] = await Promise.all([
      querySupabase('fixture_wattage_reference', 'order=category_code,lamp_code,lamp_count'),
      querySupabase('visual_identification_guide', 'select=category_code,feature_name,identification_tips,common_mistakes&order=category_code,feature_name'),
    ]);

    // === BUILD COMPACT PROMPT SECTIONS ===

    // Wattage lookup table — compact CSV-style format
    let wattageTable = '';
    if (wattageRef.length > 0) {
      wattageTable = `

WATTAGE LOOKUP TABLE (fixture_id | description | system_watts → led_watts):
${wattageRef.map((w: any) =>
  `${w.fixture_id} | ${w.lamp_count || 1}×${w.lamp_code} ${w.lamp_length || ''} ${w.category_code} | ${w.system_wattage}W → ${w.led_replacement_watts}W LED`
).join('\n')}`;
    }

    // Visual ID tips — only the most useful disambiguation tips, compact
    let visualTips = '';
    if (visualGuide.length > 0) {
      visualTips = `

KEY VISUAL IDENTIFICATION TIPS:
${visualGuide.map((v: any) =>
  `• ${v.feature_name}: ${v.identification_tips || ''} MISTAKE TO AVOID: ${v.common_mistakes || 'none'}`
).join('\n')}`;
    }

    // Company fixture types (from client)
    let companyFixtures = '';
    if (fixtureTypes && fixtureTypes.length > 0) {
      companyFixtures = `

COMPANY FIXTURE TYPES (use these if the fixture matches):
${fixtureTypes.map((ft: any) =>
  `• ${ft.fixture_name}: ${ft.category}/${ft.lamp_type} ${ft.system_wattage}W → ${ft.led_replacement_watts}W LED`
).join('\n')}`;
    }

    // Available products (from client)
    let productList = '';
    if (availableProducts && availableProducts.length > 0) {
      productList = `

AVAILABLE LED PRODUCTS (pick best match, set recommended_product_id to its ID or ""):
${availableProducts.map((p: any) =>
  `ID:"${p.id}" ${p.name}${p.description ? ` — ${p.description}` : ''}`
).join('\n')}`;
    }

    // Prescriptive measures for rebate eligibility (from client)
    let rebates = '';
    if (prescriptiveMeasures && prescriptiveMeasures.length > 0) {
      rebates = `

REBATE MEASURES (check if fixture matches a baseline below):
${prescriptiveMeasures.map((pm: any) =>
  `• ${pm.measure_name}: ${pm.baseline_equipment || '?'} ${pm.baseline_wattage || '?'}W → ${pm.replacement_equipment || '?'} ${pm.replacement_wattage || '?'}W = $${pm.incentive_amount || 0}/${pm.incentive_unit || 'fixture'}`
).join('\n')}`;
    }

    // Audit context
    const ctx = auditContext || {};
    const contextLine = `Area: ${ctx.areaName || 'Unknown'} | Building: ${ctx.buildingType || 'Commercial'}${ctx.utilityProvider ? ` | Utility: ${ctx.utilityProvider}` : ''}${ctx.operatingHours ? ` | Hours/yr: ${ctx.operatingHours}` : ''}`;

    // Build the full prompt — image analysis instructions FIRST, reference data AFTER
    const promptText = `You are Lenard, an expert commercial lighting auditor. CAREFULLY analyze this photo.

STEP 1 — LOOK AT THE PHOTO FIRST. Describe what you actually see:
- What SHAPE is the fixture? (rectangular/square recessed in ceiling grid = TROFFER, round hole in ceiling = RECESSED CAN, bare tubes on surface = STRIP, box on wall = WALL PACK, hanging from chains = HIGH BAY)
- Is it RECESSED into a drop ceiling grid, SURFACE mounted, SUSPENDED, or WALL mounted?
- Can you see the TUBES/LAMPS? How many? Are they long straight tubes (fluorescent) or a single bulb?
- How THICK are the tubes? (1.5" thick = T12, 1" = T8, thin 5/8" = T5)
- What is the light COLOR? (amber/orange = HPS, white/blue = MH, neutral white = fluorescent/LED)

CRITICAL DISTINCTIONS:
- TROFFER = rectangular fixture RECESSED into a drop ceiling grid (2x4 or 2x2 tiles). Has a flat/prismatic/parabolic lens. Contains fluorescent tubes. This is the MOST COMMON commercial fixture.
- RECESSED CAN = small ROUND hole in ceiling with a single bulb (incandescent, CFL, halogen, or LED). Typically 4-8 inch diameter circle.
- STRIP = bare channel with exposed tubes, NO lens, surface-mounted or chain-hung
- WRAP = surface-mounted with curved acrylic lens around it
- If you see a RECTANGULAR fixture with LONG TUBES in a DROP CEILING — that is a TROFFER, not a recessed can.

STEP 2 — After identifying what you see, look up the EXACT wattage from the table below. Do NOT guess wattages — use the table.

STEP 3 — Return ONLY this JSON:
{
  "area_name": "descriptive name (e.g., 'Main Office 2x4 Troffers')",
  "fixture_type": "specific type (e.g., '4ft T8 Troffer 2-lamp')",
  "fixture_category": "Indoor Linear | Indoor High Bay | Outdoor | Decorative | Other",
  "lamp_type": "T12 | T8 | T5 | T5HO | MH | HPS | MV | CFL | Incandescent | Halogen | LED | Other",
  "lamp_count": number_of_lamps_per_fixture,
  "fixture_count": number_visible_in_photo,
  "existing_wattage_per_fixture": system_watts_from_table,
  "led_replacement_wattage": led_watts_from_table,
  "ceiling_height_estimate": feet_or_null,
  "mounting_type": "Recessed | Surface | Suspended | Wall | Pole",
  "condition": "Good | Fair | Poor",
  "recommended_product_id": "product_id_or_empty_string",
  "rebate_eligible": true_or_false,
  "estimated_rebate_per_fixture": dollars_or_null,
  "notes": "observations",
  "confidence": "High | Medium | Low"
}

Context: ${contextLine}
${wattageTable}${visualTips}${companyFixtures}${productList}${rebates}

Only return valid JSON, no other text.`;

    // Log prompt size for debugging
    console.log(`Lenard prompt: ${promptText.length} chars, wattageRef: ${wattageRef.length} rows, visualGuide: ${visualGuide.length} rows`);

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
              text: promptText
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
