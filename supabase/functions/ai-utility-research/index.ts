import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { state } = await req.json();

    if (!state) {
      return new Response(JSON.stringify({ success: false, error: 'State is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64000,
        system: `You are a utility rebate and electric rate research assistant. Your job is to research electric utility providers in a given US state, their commercial energy efficiency incentive programs (lighting, HVAC, motors, refrigeration, building envelope), and their published electric rate schedules.

CRITICAL — YEAR VERIFICATION:
- For every program, find the effective date or publication year of the source document
- Include the year in the program name like "Wattsmart Business (2026)"
- Return the year as a separate "source_year" field (integer)
- If you cannot verify the year, set source_year to null and note "Year unverified" in notes

Research thoroughly and return accurate, structured JSON data. Focus on:
1. Major electric utility providers in the state
2. Their commercial/industrial energy efficiency incentive programs with DEEP detail
3. Specific incentive rates per fixture/equipment category and measure type — actual $/watt amounts, $/unit amounts, caps, and requirements
4. Published electric rate schedules — $/kWh rates (flat, TOU, seasonal), demand charges, customer categories
5. Program eligibility rules, required documentation, stacking rules, and funding status

Important guidelines:
- Only include utilities that actually serve the state
- For incentive measures, include LED retrofit/replacement AND other efficiency measures (HVAC, motors, refrigeration, building envelope) if the utility offers them
- Use "Per Watt Reduced" as the default calc_method for lighting unless the program specifically uses per-fixture incentives
- rate_unit should be "/watt" for per-watt-reduced or "/fixture" for per-fixture or "/unit" for equipment
- fixture_category must be one of: Linear, High Bay, Low Bay, Outdoor Area, Outdoor Wall, Decorative, Refrigeration, Other
- measure_type examples: LED Retrofit, LED New Construction, LED Exterior, Controls, DLC Listed, VFD, Rooftop Unit, Walk-in Cooler, Insulation
- program_type must be one of: Prescriptive, Custom, Midstream
- delivery_mechanism: more specific track — Prescriptive, Custom, Midstream, Direct Install, SMBE (Small/Medium Business Energy), SBDI (Small Business Direct Install), or null
- business_size must be one of: Small, Medium, Large, All
- If you cannot find specific rate data, provide your best estimate based on typical utility programs in that region and note it in the notes field
- Include the program URL if you can find it
- For rate schedules, include all major customer categories (Residential, Small Commercial, Large Commercial, Industrial)
- rate_per_kwh should be the average or base rate in dollars (e.g. 0.0845 for 8.45 cents/kWh)
- For TOU schedules, include peak and off-peak rates separately
- For seasonal schedules, include summer and winter rates separately
- Research what documents are required to apply (W9, invoices, photos, spec sheets, DLC certificates, etc.)
- Check if incentives from different programs can be stacked/combined
- Note the funding status — is the program open, waitlisted, or funds exhausted?

PRESCRIPTIVE MEASURE LINE ITEMS — CRITICAL:
- For EVERY program found, search for the actual prescriptive measure documentation (rebate worksheets, applications, measure lists, PDF rebate tables)
- Extract EVERY specific line item from rebate tables — specific fixture types, wattages, rebate amounts per unit
- Do NOT hardcode any utility names — this must work generically for any utility in any state
- Return as many specific measures as possible — utilities often have 20-50+ line items per program
- Include baseline equipment descriptions, replacement equipment descriptions, exact wattages, and exact incentive dollar amounts
- If a utility publishes a prescriptive rebate worksheet or measure list, extract every row from it
- Categorize each measure into the appropriate category and subcategory
- Note whether DLC listing or ENERGY STAR certification is required for each measure
- Include the source page reference from the PDF document when available

Return ONLY valid JSON with this exact structure, no other text:
{
  "providers": [
    {
      "provider_name": "string",
      "state": "XX",
      "service_territory": "string describing coverage area",
      "has_rebate_program": true/false,
      "rebate_program_url": "url or empty string",
      "contact_phone": "phone or empty string",
      "notes": "string"
    }
  ],
  "programs": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "string — include year like 'Program Name (2026)'",
      "program_type": "Prescriptive|Custom|Midstream",
      "program_category": "Lighting|HVAC|Motors|Refrigeration|Building Envelope|Comprehensive",
      "delivery_mechanism": "Prescriptive|Custom|Midstream|Direct Install|SMBE|SBDI or null",
      "business_size": "Small|Medium|Large|All",
      "dlc_required": true/false,
      "pre_approval_required": true/false,
      "application_required": true/false,
      "post_inspection_required": true/false,
      "contractor_prequalification": true/false,
      "program_url": "url or empty string",
      "max_cap_percent": number or null,
      "annual_cap_dollars": number or null,
      "source_year": number or null,
      "eligible_sectors": ["Commercial","Industrial","Agricultural","Institutional","Multifamily"] or null,
      "eligible_building_types": ["Office","Warehouse","Retail","Restaurant","School","Hospital","Manufacturing"] or null,
      "required_documents": ["W9","Invoice","Pre-photo","Post-photo","Spec sheets","DLC certificate"] or null,
      "stacking_allowed": true/false,
      "stacking_rules": "string describing what can/cannot combine, or empty string",
      "funding_status": "Open|Waitlisted|Exhausted|Paused",
      "processing_time_days": number or null,
      "rebate_payment_method": "Check|Bill Credit|Direct Deposit or null",
      "program_notes_ai": "string — tips, gotchas, common rejection reasons for AI agents"
    }
  ],
  "incentives": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "must match a program_name above",
      "measure_category": "Lighting|HVAC|Motors|Refrigeration|Building Envelope|Controls|Other",
      "measure_subcategory": "string — e.g. LED Tube, VFD, Rooftop Unit, Walk-in Cooler, Insulation",
      "fixture_category": "Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|Other",
      "measure_type": "LED Retrofit|LED New Construction|LED Exterior|Controls|DLC Listed|Other",
      "calc_method": "Per Watt Reduced|Per Fixture|Custom",
      "rate": number,
      "rate_value": number,
      "rate_unit": "/watt or /fixture or /unit",
      "tier": "string — e.g. Tier 1, Tier 2, Premium, or null",
      "cap_amount": number or null,
      "cap_percent": number or null,
      "per_unit_cap": number or null,
      "equipment_requirements": "string — e.g. Must be DLC 5.1 Premium, ENERGY STAR certified",
      "installation_requirements": "string — e.g. Must be installed by certified contractor",
      "baseline_description": "string — what existing equipment must be, e.g. Existing T12 fluorescent",
      "replacement_description": "string — what replacement must be, e.g. DLC-listed LED tube or fixture",
      "requirements": "string describing general eligibility requirements or empty string",
      "effective_date": "YYYY-MM-DD or null",
      "expiration_date": "YYYY-MM-DD or null",
      "min_watts": number or null,
      "max_watts": number or null,
      "notes": "string"
    }
  ],
  "rate_schedules": [
    {
      "provider_name": "must match a provider_name above",
      "schedule_name": "string — e.g. 'Schedule 6 - General Service'",
      "customer_category": "Residential|Small Commercial|Large Commercial|Industrial|Agricultural",
      "rate_type": "Flat|Tiered|Time-of-Use|Seasonal|Demand",
      "rate_per_kwh": number (in dollars, e.g. 0.0845),
      "peak_rate_per_kwh": number or null (on-peak for TOU),
      "off_peak_rate_per_kwh": number or null (off-peak for TOU),
      "summer_rate_per_kwh": number or null,
      "winter_rate_per_kwh": number or null,
      "demand_charge": number or null ($/kW),
      "min_demand_charge": number or null (minimum monthly),
      "customer_charge": number or null (fixed monthly charge),
      "time_of_use": true/false,
      "effective_date": "YYYY-MM-DD or empty string",
      "source_url": "url to tariff document or empty string",
      "description": "string",
      "notes": "string"
    }
  ],
  "prescriptive_measures": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "must match a program_name above",
      "measure_code": "utility's internal code or null",
      "measure_name": "exact name from utility docs, e.g. T8 4ft Linear to LED Tube",
      "measure_category": "Lighting|HVAC|Motors|Refrigeration|Building Envelope",
      "measure_subcategory": "Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|VFD|RTU|Other",
      "baseline_equipment": "what is being replaced, e.g. T8 4ft 32W 2-lamp fluorescent",
      "baseline_wattage": number or null,
      "replacement_equipment": "what it becomes, e.g. DLC-listed LED Tube Type A/B 18W",
      "replacement_wattage": number or null,
      "incentive_amount": number,
      "incentive_unit": "per_fixture|per_lamp|per_watt_reduced|per_kw|flat|per_ton",
      "incentive_formula": "formula if complex calc, or null",
      "max_incentive": number or null,
      "location_type": "interior|exterior|parking|refrigerated or null",
      "application_type": "retrofit|new_construction|both",
      "dlc_required": true/false,
      "dlc_tier": "Standard|Premium or null",
      "energy_star_required": true/false,
      "hours_requirement": number or null,
      "source_page": "page reference from PDF or null",
      "notes": "special conditions"
    }
  ]
}`,
        messages: [{
          role: 'user',
          content: `Research all major electric utility providers in ${state} and their commercial energy efficiency incentive programs. Include:
1. Specific incentive rates for different fixture/equipment categories and measure types (lighting, HVAC, motors, refrigeration, building envelope)
2. Published electric rate schedules for all customer categories, including TOU and seasonal rates where available
3. Program eligibility rules: required documents, pre-approval requirements, contractor prequalification, eligible building types and business sectors
4. Stacking rules: which programs can combine and which cannot
5. Funding status: is the program still accepting applications?
6. Delivery mechanisms: Prescriptive, Custom, Midstream, Direct Install, SMBE, SBDI tracks
7. Verify the year/effective date of each program document
8. PRESCRIPTIVE MEASURE LINE ITEMS: For every program, find the prescriptive rebate worksheets, measure lists, or rebate tables. Extract EVERY individual line item — specific fixture types, baseline and replacement wattages, exact rebate dollar amounts per unit, measure codes, DLC/ENERGY STAR requirements, and any location or application type restrictions. Utilities often have 20-50+ individual prescriptive measures per program — return as many as you can find.
Return the structured JSON as specified.`
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return new Response(JSON.stringify({ success: false, error: data.error.message || 'Anthropic API error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const content = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]);

      // Backward compat: normalize "rates" → "incentives" if AI returns old key
      if (results.rates && !results.incentives) {
        results.incentives = results.rates;
        delete results.rates;
      }

      // Default rate_schedules to empty array if missing
      if (!results.rate_schedules) {
        results.rate_schedules = [];
      }

      // Ensure rate_value is populated on each incentive
      if (results.incentives) {
        for (const inc of results.incentives) {
          if (inc.rate_value == null && inc.rate != null) {
            inc.rate_value = inc.rate;
          }
          if (inc.rate == null && inc.rate_value != null) {
            inc.rate = inc.rate_value;
          }
        }
      }

      // Default prescriptive_measures to empty array if missing
      if (!results.prescriptive_measures) {
        results.prescriptive_measures = [];
      }

      // Validate structure
      if (!results.providers || !results.programs || !results.incentives) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid response structure', raw: content }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Could not parse research results', raw: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
