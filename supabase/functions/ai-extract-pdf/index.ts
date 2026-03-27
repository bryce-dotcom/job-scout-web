import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { pdfBase64, entityName, targetFields, extraContext } = body;

    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: 'No PDF data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const fieldDescriptions = (targetFields || []).map((f: any) =>
      `${f.field} (${f.type}${f.required ? ', required' : ''}): ${f.desc || f.label}`
    ).join('\n');

    const prompt = `Extract all ${entityName || 'records'} from this PDF document. Return ONLY a valid JSON object with this exact structure:
{
  "headers": ["column1", "column2", ...],
  "rows": [["val1", "val2", ...], ...]
}

Target fields for context (use these as column names where the data matches):
${fieldDescriptions}
${extraContext ? `\nAdditional context: ${extraContext}` : ''}

Rules:
- Extract EVERY row of data, not just a sample
- Use the target field names as headers where the data clearly matches
- For data that doesn't match any target field, use a descriptive header name
- Numbers should be plain (no $ or , formatting)
- Each row array must have the same length as the headers array
- Return valid JSON only, no markdown fences or extra text`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
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
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const toParse = jsonMatch ? jsonMatch[1].trim() : text.trim();

    // Find the JSON object
    const objMatch = toParse.match(/\{[\s\S]*\}/);
    if (!objMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: text.substring(0, 500) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = JSON.parse(objMatch[0]);

    if (!result.headers || !result.rows || result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No data could be extracted from this PDF' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, headers: result.headers, rows: result.rows }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
