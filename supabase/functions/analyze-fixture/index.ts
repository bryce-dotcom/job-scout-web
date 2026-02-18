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
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
    }
  });
  if (!res.ok) return [];
  return res.json();
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

    // Fetch all 4 reference tables in parallel
    const [categories, lampTypesRef, wattageRef, visualGuide] = await Promise.all([
      querySupabase('fixture_categories', 'order=category_code'),
      querySupabase('lamp_types', 'order=lamp_code'),
      querySupabase('fixture_wattage_reference', 'order=category_code,lamp_code,lamp_count'),
      querySupabase('visual_identification_guide', 'order=category_code,feature_name'),
    ]);

    // === BUILD ENRICHED PROMPT ===

    // Section 1: Fixture Categories
    let categoriesSection = '';
    if (categories.length > 0) {
      categoriesSection = `\n\n=== FIXTURE CATEGORIES ===
${categories.map((c: any) =>
  `- ${c.category_code}: ${c.category_name} — ${c.description || ''}. Mounting: ${c.typical_mounting || 'N/A'}. Ceiling: ${c.typical_ceiling_height || 'N/A'}. Applications: ${(c.typical_applications || []).join(', ')}`
).join('\n')}`;
    }

    // Section 2: Lamp Types
    let lampTypesSection = '';
    if (lampTypesRef.length > 0) {
      lampTypesSection = `\n\n=== LAMP TYPES ===
${lampTypesRef.map((lt: any) =>
  `- ${lt.lamp_code}: ${lt.lamp_name} (${lt.technology}). ${lt.visual_characteristics || ''}. Ballast: ${lt.ballast_required ? lt.ballast_type || 'Yes' : 'None'}. ${lt.being_phased_out ? 'BEING PHASED OUT.' : ''}`
).join('\n')}`;
    }

    // Section 3: System Wattage Reference (THE CRITICAL TABLE)
    let wattageSection = '';
    if (wattageRef.length > 0) {
      wattageSection = `\n\n=== SYSTEM WATTAGE REFERENCE (use this as your primary lookup) ===
IMPORTANT: These are EXACT system wattages including ballast losses. Always use this table instead of guessing.

${wattageRef.map((w: any) =>
  `${w.fixture_id}: ${w.fixture_description} | System: ${w.system_wattage}W → LED: ${w.led_replacement_watts}W | ${w.visual_identification || ''}`
).join('\n')}`;
    }

    // Section 4: Visual Identification Guide
    let visualSection = '';
    if (visualGuide.length > 0) {
      visualSection = `\n\n=== VISUAL IDENTIFICATION GUIDE ===
${visualGuide.map((v: any) =>
  `[${v.category_code}] ${v.feature_name}: ${v.identification_tips || ''} Common mistakes: ${v.common_mistakes || 'None'}. Photo clues: ${(v.photo_clues || []).join('; ')}`
).join('\n')}`;
    }

    // Section 5: Company Fixture Types (from client)
    let companyFixtureSection = '';
    if (fixtureTypes && fixtureTypes.length > 0) {
      companyFixtureSection = `\n\n=== COMPANY FIXTURE TYPES (company-specific overrides, prioritize these when matched) ===
${fixtureTypes.map((ft: any) =>
  `- ${ft.fixture_name}: ${ft.category} / ${ft.lamp_type} / ${ft.system_wattage}W existing → ${ft.led_replacement_watts}W LED`
).join('\n')}`;
    }

    // Section 6: Available Products (from client)
    let productSection = '';
    if (availableProducts && availableProducts.length > 0) {
      productSection = `\n\n=== AVAILABLE LED REPLACEMENT PRODUCTS (match the best one) ===
${availableProducts.map((p: any) =>
  `- ID: "${p.id}" | Name: "${p.name}"${p.description ? ` | ${p.description}` : ''}${p.wattage ? ` | ${p.wattage}W` : ''}`
).join('\n')}
Set recommended_product_id to the product's ID string, or "" if no good match.`;
    }

    // Section 7: Prescriptive Measures / Rebates (from client)
    let rebateSection = '';
    if (prescriptiveMeasures && prescriptiveMeasures.length > 0) {
      rebateSection = `\n\n=== PRESCRIPTIVE MEASURES / REBATES (check for rebate eligibility) ===
${prescriptiveMeasures.map((pm: any) =>
  `- ${pm.measure_name}: Baseline ${pm.baseline_equipment || '?'} (${pm.baseline_wattage || '?'}W) → Replacement ${pm.replacement_equipment || '?'} (${pm.replacement_wattage || '?'}W) | Incentive: $${pm.incentive_amount || 0} ${pm.incentive_unit || 'per_fixture'}`
).join('\n')}
After identifying the fixture, check if it matches any baseline equipment above. If so, set rebate_eligible=true and estimated_rebate_per_fixture to the incentive_amount.`;
    }

    // Section 8: Audit Context
    const contextSection = `\n\n=== AUDIT CONTEXT ===
- Area name: ${auditContext?.areaName || 'Unknown'}
- Building type: ${auditContext?.buildingType || 'Commercial'}${auditContext?.utilityProvider ? `\n- Utility provider: ${auditContext.utilityProvider}` : ''}${auditContext?.operatingHours ? `\n- Annual operating hours: ${auditContext.operatingHours}` : ''}`;

    // Build the full prompt
    const promptText = `You are Lenard, an expert lighting auditor with deep knowledge of commercial and industrial lighting systems. Analyze this photo of a lighting fixture or space.

INSTRUCTIONS:
1. Identify the fixture CATEGORY from the photo (troffer, high bay, wall pack, etc.)
2. Identify the LAMP TYPE (T12, T8, T5, T5HO, MH, HPS, CFL, incandescent, halogen, LED)
3. Count lamps per fixture
4. Look up the EXACT SYSTEM WATTAGE from the reference table below (includes ballast losses)
5. Get the LED replacement wattage from the same reference table row
6. Match the best replacement product from the available products list
7. Check prescriptive measures for rebate eligibility

Return JSON with ALL of these fields:
{
  "area_name": "descriptive name for this area/fixture group (e.g., 'Main Office 4ft Troffers', 'Warehouse High Bays')",
  "fixture_type": "specific type (e.g., 4ft T8 Troffer 2-lamp, 400W Metal Halide High Bay, etc.)",
  "fixture_category": "Indoor Linear | Indoor High Bay | Outdoor | Decorative | Other",
  "lamp_type": "T12 | T8 | T5 | T5HO | MH | HPS | MV | CFL | Incandescent | Halogen | LED | Other",
  "lamp_count": number of lamps/bulbs per fixture,
  "fixture_count": estimated number of this fixture type visible,
  "existing_wattage_per_fixture": exact system watts from reference table (includes ballast),
  "led_replacement_wattage": recommended LED replacement wattage from reference table,
  "ceiling_height_estimate": estimated ceiling height in feet if visible,
  "mounting_type": "Recessed | Surface | Suspended | Wall | Pole",
  "condition": "Good | Fair | Poor",
  "recommended_product_id": "ID of best matching product from available list, or empty string",
  "rebate_eligible": true/false based on prescriptive measures match,
  "estimated_rebate_per_fixture": dollar amount per fixture if rebate eligible, or null,
  "notes": "any other observations about the space or fixtures",
  "confidence": "High | Medium | Low"
}
${categoriesSection}${lampTypesSection}${wattageSection}${visualSection}${companyFixtureSection}${productSection}${rebateSection}${contextSection}

Only return valid JSON, no other text.`;

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
