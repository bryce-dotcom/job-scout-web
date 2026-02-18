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
- What SHAPE is the fixture? Round, rectangular, square, linear?
- Is the fixture FLUSH/SURFACE-MOUNTED on the ceiling, RECESSED into the ceiling, SUSPENDED/hanging, or WALL mounted?
- Is there a visible HOUSING sitting on the ceiling surface, or is there just a hole/opening in the ceiling?
- Can you see TUBES/LAMPS? Or is the light source hidden behind a diffuser/lens?
- Does it look MODERN (thin, sleek, uniform light) or OLD (bulky, visible lamps, yellowed)?
- What is the light COLOR? (amber/orange = HPS, white/blue = MH, neutral white = fluorescent/LED, warm yellow = incandescent)

CRITICAL FIXTURE TYPE DISTINCTIONS:
- TROFFER = RECTANGULAR fixture RECESSED into a drop ceiling grid (2x4 or 2x2 tiles). Has a flat/prismatic/parabolic lens. Contains fluorescent tubes. This is the MOST COMMON commercial fixture.
- RECESSED CAN/DOWNLIGHT = small ROUND opening cut into the ceiling with a bulb recessed INSIDE (you look UP into a can/hole). Trim ring sits flush with ceiling. 4-8 inch diameter.
- SURFACE-MOUNT ROUND FIXTURE = round fixture with a HOUSING that sits ON the ceiling surface (not recessed into it). Includes flush-mount LED discs, drum lights, decorative ceiling fixtures. The fixture body is visible below the ceiling plane.
- SURFACE-MOUNT LED DISC/PANEL = thin round or square LED fixture mounted flat on the ceiling surface. Uniform light, no visible bulbs. ALREADY LED — no retrofit needed.
- STRIP = bare channel with exposed tubes, NO lens, surface-mounted or chain-hung
- WRAP = linear surface-mounted fixture with curved acrylic lens around it
- HIGH BAY = large fixture suspended by chains/rods from high ceilings (20+ ft). Round bell shape (HID) or flat disc (LED UFO) or rectangular (fluorescent/LED linear)
- WALL PACK = box-shaped fixture mounted on exterior wall

IS IT ALREADY LED?
Look for these signs that a fixture is ALREADY LED:
- Thin, flat profile with no bulky housing
- Perfectly uniform light output with no visible tubes or hot spots
- Modern/sleek appearance, often white or silver housing
- LED chips visible through a clear/frosted lens
- No ballast hum, cool to touch appearance
- "UFO" style round disc high bays
- Corn cob lamps inside old HID housings
If it IS already LED, set lamp_type to "LED" and note the estimated wattage. It may not need replacement.

STEP 2 — After identifying what you see, look up the EXACT wattage from the reference table below. Do NOT guess wattages — use the table. If the fixture is already LED or not in the table, estimate based on its size and light output.

STEP 3 — Return ONLY this JSON:
{
  "area_name": "descriptive name (e.g., 'Main Office 2x4 Troffers', 'Lobby Surface-Mount LED Fixtures')",
  "fixture_type": "specific type (e.g., '4ft T8 Troffer 2-lamp', 'Surface-Mount LED Disc', '400W MH High Bay')",
  "fixture_category": "Indoor Linear | Indoor High Bay | Indoor Surface Mount | Indoor Recessed | Outdoor | Decorative | Other",
  "lamp_type": "T12 | T8 | T5 | T5HO | MH | HPS | MV | CFL | Incandescent | Halogen | LED | Other",
  "lamp_count": number_of_lamps_per_fixture,
  "fixture_count": number_visible_in_photo,
  "existing_wattage_per_fixture": system_watts_from_table_or_estimate,
  "led_replacement_wattage": led_watts_from_table_or_0_if_already_led,
  "ceiling_height_estimate": feet_or_null,
  "mounting_type": "Recessed | Surface | Suspended | Wall | Pole",
  "condition": "Good | Fair | Poor",
  "recommended_product_id": "product_id_or_empty_string",
  "rebate_eligible": true_or_false,
  "estimated_rebate_per_fixture": dollars_or_null,
  "notes": "observations — if already LED note that no retrofit is needed",
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
