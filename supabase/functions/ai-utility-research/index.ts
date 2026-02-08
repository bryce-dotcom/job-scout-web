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
        max_tokens: 16000,
        system: `You are a utility rebate research assistant. Your job is to research electric utility providers in a given US state and their commercial LED lighting rebate programs.

Research thoroughly and return accurate, structured JSON data. Focus on:
1. Major electric utility providers in the state
2. Their commercial/industrial LED lighting rebate programs
3. Specific rebate rates per fixture category

Important guidelines:
- Only include utilities that actually serve the state
- For rebate rates, focus on LED retrofit/replacement incentives
- Use "Per Watt Reduced" as the default calc_method unless the program specifically uses per-fixture incentives
- rate_unit should be "/watt" for per-watt-reduced or "/fixture" for per-fixture
- fixture_category must be one of: Linear, High Bay, Low Bay, Outdoor Area, Outdoor Wall, Decorative, Refrigeration, Other
- program_type must be one of: Prescriptive, Custom, Midstream
- business_size must be one of: Small, Medium, Large, All
- If you cannot find specific rate data, provide your best estimate based on typical utility programs in that region and note it in the notes field
- Include the program URL if you can find it

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
      "program_name": "string",
      "program_type": "Prescriptive|Custom|Midstream",
      "business_size": "Small|Medium|Large|All",
      "dlc_required": true/false,
      "pre_approval_required": true/false,
      "program_url": "url or empty string",
      "max_cap_percent": number or null,
      "annual_cap_dollars": number or null
    }
  ],
  "rates": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "must match a program_name above",
      "fixture_category": "Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|Other",
      "calc_method": "Per Watt Reduced|Per Fixture|Custom",
      "rate": number,
      "rate_unit": "/watt or /fixture",
      "min_watts": number or null,
      "max_watts": number or null,
      "notes": "string"
    }
  ]
}`,
        messages: [{
          role: 'user',
          content: `Research all major electric utility providers in ${state} and their commercial LED lighting rebate programs. Include specific rebate rates for different fixture categories where available. Return the structured JSON as specified.`
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

      // Validate structure
      if (!results.providers || !results.programs || !results.rates) {
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
