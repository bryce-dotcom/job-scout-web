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
        max_tokens: 32000,
        system: `You are a utility rebate and electric rate research assistant. Your job is to research electric utility providers in a given US state, their commercial LED lighting incentive programs, and their published electric rate schedules.

CRITICAL — YEAR VERIFICATION:
- For every program, find the effective date or publication year of the source document
- Include the year in the program name like "Wattsmart Business (2026)"
- Return the year as a separate "source_year" field (integer)
- If you cannot verify the year, set source_year to null and note "Year unverified" in notes

Research thoroughly and return accurate, structured JSON data. Focus on:
1. Major electric utility providers in the state
2. Their commercial/industrial LED lighting incentive programs with DEEP detail
3. Specific incentive rates per fixture category and measure type — actual $/watt amounts, caps, and requirements
4. Published electric rate schedules — $/kWh rates, demand charges, customer categories

Important guidelines:
- Only include utilities that actually serve the state
- For incentive measures, focus on LED retrofit/replacement incentives
- Use "Per Watt Reduced" as the default calc_method unless the program specifically uses per-fixture incentives
- rate_unit should be "/watt" for per-watt-reduced or "/fixture" for per-fixture
- fixture_category must be one of: Linear, High Bay, Low Bay, Outdoor Area, Outdoor Wall, Decorative, Refrigeration, Other
- measure_type examples: LED Retrofit, LED New Construction, LED Exterior, Controls, DLC Listed
- program_type must be one of: Prescriptive, Custom, Midstream
- business_size must be one of: Small, Medium, Large, All
- If you cannot find specific rate data, provide your best estimate based on typical utility programs in that region and note it in the notes field
- Include the program URL if you can find it
- For rate schedules, include all major customer categories (Residential, Small Commercial, Large Commercial, Industrial)
- rate_per_kwh should be the average or base rate in dollars (e.g. 0.0845 for 8.45 cents/kWh)

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
      "business_size": "Small|Medium|Large|All",
      "dlc_required": true/false,
      "pre_approval_required": true/false,
      "program_url": "url or empty string",
      "max_cap_percent": number or null,
      "annual_cap_dollars": number or null,
      "source_year": number or null
    }
  ],
  "incentives": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "must match a program_name above",
      "fixture_category": "Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|Other",
      "measure_type": "LED Retrofit|LED New Construction|LED Exterior|Controls|DLC Listed|Other",
      "calc_method": "Per Watt Reduced|Per Fixture|Custom",
      "rate": number,
      "rate_value": number,
      "rate_unit": "/watt or /fixture",
      "cap_amount": number or null,
      "cap_percent": number or null,
      "requirements": "string describing eligibility requirements or empty string",
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
      "rate_per_kwh": number (in dollars, e.g. 0.0845),
      "demand_charge": number or null ($/kW),
      "time_of_use": true/false,
      "effective_date": "YYYY-MM-DD or empty string",
      "description": "string",
      "notes": "string"
    }
  ]
}`,
        messages: [{
          role: 'user',
          content: `Research all major electric utility providers in ${state} and their commercial LED lighting incentive programs. Include specific incentive rates for different fixture categories and measure types where available. Also research their published electric rate schedules for all customer categories. Verify the year/effective date of each program document. Return the structured JSON as specified.`
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
