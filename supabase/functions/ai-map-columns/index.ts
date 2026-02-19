import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { headers, sampleRows, serviceTypes } = await req.json();
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return new Response(JSON.stringify({ error: 'No headers provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const targetFields = [
      { field: 'name', type: 'text', required: true, desc: 'Product or service name' },
      { field: 'description', type: 'text', required: false, desc: 'Product description' },
      { field: 'type', type: 'text', required: false, desc: `Service type / category (known types: ${(serviceTypes || []).join(', ') || 'any'})` },
      { field: 'unit_price', type: 'number', required: false, desc: 'Selling price per unit in dollars' },
      { field: 'cost', type: 'number', required: false, desc: 'Cost / wholesale price in dollars' },
      { field: 'markup_percent', type: 'number', required: false, desc: 'Markup percentage (0-100+)' },
      { field: 'taxable', type: 'boolean', required: false, desc: 'Whether the product is taxable' },
      { field: 'active', type: 'boolean', required: false, desc: 'Whether the product is active/available' },
      { field: 'allotted_time_hours', type: 'number', required: false, desc: 'Estimated labor hours for this product/service' },
    ];

    const prompt = `You are a data mapping assistant. Given source spreadsheet columns and target database fields, determine the best mapping.

SOURCE COLUMNS (from uploaded file):
${headers.map((h: string, i: number) => `  ${i}: "${h}"`).join('\n')}

SAMPLE DATA (first ${Math.min((sampleRows || []).length, 3)} rows):
${(sampleRows || []).slice(0, 3).map((row: any[], ri: number) => `  Row ${ri + 1}: ${row.map((v: any, ci: number) => `[${headers[ci]}]="${v}"`).join(', ')}`).join('\n')}

TARGET DATABASE FIELDS:
${targetFields.map(f => `  ${f.field} (${f.type}${f.required ? ', REQUIRED' : ''}) — ${f.desc}`).join('\n')}

Return a JSON object mapping each target field to the source column index (0-based) that best matches it. Only include mappings where you're reasonably confident. If a source column doesn't match any target field, skip it. If a target field has no good match, skip it. The "name" field MUST be mapped.

For "type", if the source data doesn't have an explicit type/category column but you can infer a consistent type from context, note it in a "defaults" object.
For "taxable", default to true if not present.
For "active", default to true if not present.

Response format (JSON only, no markdown):
{
  "mapping": { "name": 0, "description": 2, "unit_price": 3 },
  "defaults": { "taxable": true, "active": true, "type": "Electrical" },
  "confidence": "high",
  "notes": "Brief explanation of mapping choices"
}`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `AI request failed: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await resp.json();
    const text = aiData.content?.[0]?.text || '';

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: text }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
