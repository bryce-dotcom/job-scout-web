import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Always 200 so supabase.functions.invoke exposes the body to the caller
// (non-2xx becomes an opaque error wrapper on the client side). The
// `success` flag inside tells the client whether to treat it as a result.
const json = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { images, jobContext, checklist, verificationType, companyId } = await req.json();

    if (!images || images.length === 0) {
      return json({ success: false, error: 'No images provided' });
    }

    const isDaily = verificationType === 'daily';

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

    let promptText: string;

    if (isDaily) {
      // Daily end-of-day housekeeping prompt
      promptText = `You are Victor, an expert field verification agent. Your job right now is to verify end-of-day jobsite housekeeping and vehicle readiness for a field crew that has finished their workday.

CREW'S END-OF-DAY CHECKLIST (what they say they completed):
${checklistText || 'No checklist provided'}

ANALYZE ALL ${images.length} PHOTOS. Evaluate:
1. CLEANLINESS: Is the work area / jobsite clean? Debris removed? Swept?
2. TOOL MANAGEMENT: Are all tools gathered, organized, and accounted for? Nothing left on-site?
3. VEHICLE CONDITION: Is the truck/vehicle tidied? Ladders secured? Equipment properly stowed?
4. SITE CONDITION: Is customer property undamaged? No materials or trash left behind?

VERIFY THE CREW'S CHECKLIST: For each item they checked, assess from the photos whether it appears to actually be done. Flag any discrepancies.

Be fair but thorough. This is a quick end-of-day quality check, not a job completion inspection.

Return ONLY this JSON:
{
  "overall_score": <1-100 integer>,
  "grade": "<A|B|C|D|F>",
  "summary": "<2-3 sentence assessment of end-of-day readiness>",
  "cleanliness_score": <1-100 — site cleanliness and debris removal>,
  "completeness_score": <1-100 — tools gathered and accounted for>,
  "work_quality_score": <1-100 — vehicle condition, ladders secured, equipment stowed>,
  "customer_readiness_score": <1-100 — nothing left behind, customer property intact>,
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

Score guide: A=90+ (excellent), B=80-89 (good, minor issues), C=70-79 (acceptable, needs attention), D=60-69 (below standard), F=below 60 (unacceptable).

Only return valid JSON, no other text.`;
    } else {
      // Existing completion verification prompt
      const ctx = jobContext || {};
      const industry = ctx.industry || 'general';

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

      promptText = `You are Victor, an expert field verification agent for commercial construction and service work. Your job is to rigorously inspect completed work through photos and crew checklists to ensure quality, completeness, cleanliness, and customer readiness.

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
    }

    // Call Claude Vision API via the shared wrapper (usage metering, error
    // taxonomy, admin alerting). claude-sonnet-4-20250514 retires June 15 —
    // moved to claude-sonnet-4-6.
    const ai = await callAnthropic(
      { feature: 'victor-verify', companyId: companyId ?? jobContext?.companyId ?? null },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: promptText }
          ]
        }]
      },
    );

    if (!ai.ok) {
      // ai_unavailable=true means OUR billing/key problem — the client must
      // NOT block clock-out/completion on it (Cameron was stuck in the field
      // when the account ran out of credits).
      return json({ success: false, error: ai.friendly, ai_unavailable: ai.unavailable === true });
    }
    const data = ai.data;

    const content = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const analysis = JSON.parse(jsonMatch[0]);
        return json({ success: true, analysis });
      } catch (parseErr) {
        console.error('[Victor] JSON parse error:', parseErr);
        return json({ success: false, error: 'Failed to parse AI response', raw: content });
      }
    }

    return json({ success: false, error: 'Could not parse analysis', raw: content });

  } catch (error) {
    console.error('[Victor] Error:', error);
    return json({ success: false, error: (error as Error).message || 'Internal error' });
  }
});
