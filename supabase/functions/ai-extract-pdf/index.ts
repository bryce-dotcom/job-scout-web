import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { pdfBase64, pageImages, entityName, targetFields, extraContext } = body;

    if (!pdfBase64 && (!pageImages || pageImages.length === 0)) {
      return new Response(JSON.stringify({ error: 'No PDF or image data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const fieldDescriptions = (targetFields || []).map((f: any) =>
      `${f.field} (${f.type}${f.required ? ', required' : ''}): ${f.desc || f.label}`
    ).join('\n');

    const userPrompt = `Extract all ${entityName || 'records'} from this document.

Target fields (use these as column names where the data matches):
${fieldDescriptions}
${extraContext ? `\nAdditional context: ${extraContext}` : ''}

Rules:
- Extract EVERY row of data, not just a sample
- Use the target field names as headers where the data clearly matches
- For data that doesn't match any target field, use a descriptive header name
- Numbers should be plain (no $ or , formatting)
- Each row array must have the same length as the headers array
- Return ONLY a JSON object with {"headers": [...], "rows": [[...], ...]}`;

    // Build content blocks — prefer page images (rendered from PDF), fall back to PDF document type
    const contentBlocks: any[] = [];

    if (pageImages && pageImages.length > 0) {
      // Client rendered PDF pages as images — most reliable approach
      for (const img of pageImages) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType || 'image/png', data: img.data },
        });
      }
    } else {
      // Fall back to PDF document type
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
      });
    }

    contentBlocks.push({ type: 'text', text: userPrompt });

    // PDF document blocks are GA on the Messages API — the old
    // 'pdfs-2024-09-25' beta header is no longer needed for either path.
    const ai = await callAnthropic(
      { feature: 'ai-extract-pdf', companyId: null },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: 'You are a data extraction assistant. Respond with ONLY a valid JSON object. No markdown fences, no explanation, no preamble. Structure: {"headers": ["col1", "col2", ...], "rows": [["val1", "val2", ...], ...]}',
        messages: [
          { role: 'user', content: contentBlocks },
          { role: 'assistant', content: '{"headers":' },
        ],
      },
    );

    if (!ai.ok) {
      return new Response(JSON.stringify({ error: ai.friendly, ai_unavailable: ai.unavailable === true }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = ai.data;
    const rawText = aiData.content?.[0]?.text || '';

    // We prefilled with '{"headers":', so prepend it
    const text = '{"headers":' + rawText;

    // Try multiple parsing strategies
    let result: any = null;

    // Strategy 1: Direct parse
    try { result = JSON.parse(text); } catch (_) {}

    // Strategy 2: Strip markdown fences then parse
    if (!result) {
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        try { result = JSON.parse(fenceMatch[1].trim()); } catch (_) {}
      }
    }

    // Strategy 3: Find largest JSON object
    if (!result) {
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { result = JSON.parse(objMatch[0]); } catch (_) {}
      }
    }

    // Strategy 4: Fix trailing commas and close truncated brackets
    if (!result) {
      let cleaned = text.replace(/,\s*([\]}])/g, '$1');
      const openBrackets = (cleaned.match(/\[/g) || []).length - (cleaned.match(/\]/g) || []).length;
      const openBraces = (cleaned.match(/\{/g) || []).length - (cleaned.match(/\}/g) || []).length;
      for (let i = 0; i < openBrackets; i++) cleaned += ']';
      for (let i = 0; i < openBraces; i++) cleaned += '}';
      try { result = JSON.parse(cleaned); } catch (_) {}
    }

    if (!result || !result.headers || !result.rows) {
      console.error('Parse failed. Raw:', text.substring(0, 1000));
      return new Response(JSON.stringify({
        error: 'Could not extract structured data. The document may not contain tabular data.',
        raw: text.substring(0, 300),
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No data rows found in this document.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, headers: result.headers, rows: result.rows }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('PDF extraction error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
