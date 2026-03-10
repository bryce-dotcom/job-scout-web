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
    const { images, jobContext, checklist } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No images provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ctx = jobContext || {};
    const industry = ctx.industry || 'general';

    // Build industry-specific instructions
    let industryInstructions = '';
    if (industry === 'lighting') {
      industryInstructions = `
LIGHTING-SPECIFIC CHECKS:
- Are LED fixtures properly installed and seated flush?
- Is the color temperature consistent across fixtures?
- Are there any visible wiring issues, exposed conductors, or loose connections?
- Have old ballasts been removed or properly disconnected?
- Are fixture labels applied showing new wattage/model?
- Are control systems, dimmers, or occupancy sensors working?
- Is there evidence the customer was shown how to use any lighting control apps or systems?
- Have ceiling tiles been properly replaced with no gaps?
- Are all lights powered on and commissioned?`;
    }

    // Build checklist text
    const checklistText = (checklist || []).map((c: any) =>
      `${c.checked ? '[x]' : '[ ]'} ${c.item} (${c.category || 'General'})`
    ).join('\n');

    // Build image content blocks (max 8 images to stay within token limits)
    const imageBlocks = images.slice(0, 8).map((img: any, idx: number) => ([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType || 'image/jpeg',
          data: img.base64
        }
      },
      {
        type: 'text',
        text: `Photo ${idx + 1} — Type: ${img.photoType || 'general'}`
      }
    ])).flat();

    const promptText = `You are Victor, an expert field verification agent for commercial construction and service work. Your job is to rigorously inspect completed work through photos and crew checklists to ensure quality, completeness, cleanliness, and customer readiness.

JOB: ${ctx.jobTitle || 'Unknown'} | ${ctx.serviceType || 'General'} | ${ctx.address || 'No address'}
TEAM: ${ctx.assignedTeam || 'Unknown'}
INDUSTRY: ${industry}
JOB DETAILS: ${ctx.details || 'None provided'}

CREW CHECKLIST (what the crew says they completed):
${checklistText || 'No checklist provided'}
${industryInstructions}

ANALYZE ALL ${images.length} PHOTOS. For each photo evaluate:
1. WORK QUALITY: Is the work done correctly and professionally? Look for craftsmanship.
2. CLEANLINESS: Is the work area clean? Tools gathered and removed? Debris cleaned up?
3. COMPLETENESS: Does the work appear finished? No loose ends?
4. SAFETY: Any visible safety concerns?
5. CUSTOMER READINESS: Would this be ready for a customer walkthrough right now?

VERIFY THE CREW'S CHECKLIST: For each item they checked, assess from the photos whether it appears to actually be done. Flag any discrepancies where the crew checked something but the photos don't support it.

Be thorough but fair. Give credit where work is done well. Flag issues that matter.

Return ONLY this JSON:
{
  "overall_score": <1-100 integer>,
  "grade": "<A|B|C|D|F>",
  "summary": "<2-3 sentence overall assessment>",
  "work_quality_score": <1-100>,
  "cleanliness_score": <1-100>,
  "completeness_score": <1-100>,
  "customer_readiness_score": <1-100>,
  "photo_analyses": [
    {
      "photo_index": <0-based index>,
      "photo_type": "<type>",
      "score": <1-100>,
      "observations": "<what Victor sees in this photo>",
      "issues": ["<any concerns>"],
      "positives": ["<things done well>"]
    }
  ],
  "checklist_verification": [
    {
      "item": "<checklist item text>",
      "crew_checked": <true|false>,
      "ai_verified": <true|false — does the photo evidence support this?>,
      "confidence": "<high|medium|low>",
      "notes": "<explanation if discrepancy>"
    }
  ],
  "issues_found": [
    {
      "issue": "<description>",
      "severity": "<critical|major|minor>",
      "recommendation": "<what to fix>"
    }
  ]
}

Score guide: A=90+ (excellent), B=80-89 (good, minor issues), C=70-79 (acceptable, needs attention), D=60-69 (below standard), F=below 60 (unacceptable, redo needed).

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
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: promptText }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('[Victor] Claude API error:', data.error);
      return new Response(JSON.stringify({ success: false, error: data.error.message || 'AI analysis failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const content = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const analysis = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify({ success: true, analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (parseErr) {
        console.error('[Victor] JSON parse error:', parseErr);
        return new Response(JSON.stringify({ success: false, error: 'Failed to parse AI response', raw: content }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Could not parse analysis', raw: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Victor] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
