import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const {
      company_name,
      customer_name,
      customer_address,
      estimate_message,
      line_items,
      total,
      utility_incentive,
      discount,
    } = await req.json();

    const totalNum = parseFloat(total) || 0;
    const incentiveNum = parseFloat(utility_incentive) || 0;
    const discountNum = parseFloat(discount) || 0;

    // Build context for Claude
    const lineItemsSummary = (line_items || []).map((li: any) =>
      `- ${li.item_name || li.description}: qty ${li.quantity || 1} @ $${li.price} = $${li.total}`
    ).join('\n');

    const prompt = `You are a professional proposal copywriter for a field services company. Generate a JSON layout for an interactive proposal (like Qwilr) based on the following estimate details.

Company: ${company_name}
Customer: ${customer_name}
${customer_address ? `Location: ${customer_address}` : ''}
${estimate_message ? `Message from company: ${estimate_message}` : ''}

Line Items:
${lineItemsSummary || 'No line items provided'}

Total: $${totalNum.toFixed(2)}
${incentiveNum > 0 ? `Utility Incentive/Rebate: $${incentiveNum.toFixed(2)}` : ''}
${discountNum > 0 ? `Discount: $${discountNum.toFixed(2)}` : ''}

Generate a proposal layout JSON with these sections. Write compelling, professional copy for each section. Estimate annual energy savings if this looks like a lighting/efficiency project (use industry averages of 40-60% energy reduction). If it does not look like an energy project, omit the savings_timeline section.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "sections": [
    { "type": "hero", "heading": "...", "subheading": "..." },
    { "type": "executive_summary", "content": "2-3 sentence overview" },
    { "type": "problem_statement", "content": "describe the challenge the customer faces" },
    { "type": "solution_overview", "content": "overview of the proposed solution", "highlights": ["highlight1", "highlight2", "highlight3"] },
    { "type": "line_items", "show_images": true },
    { "type": "cost_breakdown", "chart_type": "donut" },
    { "type": "savings_timeline", "years": 5, "annual_savings": <number or 0>, "content": "description of savings projection" },
    { "type": "roi_summary", "content": "the numbers that matter", "metrics": { "annual_savings": <number>, "payback_months": <number>, "roi_percent": <number> } },
    ${incentiveNum > 0 ? '{ "type": "utility_incentive", "content": "description of the rebate/incentive" },' : ''}
    { "type": "team" },
    { "type": "approval", "cta_text": "Approve This Proposal", "content": "call to action message" }
  ]
}

If this is NOT an energy/lighting project, omit savings_timeline and roi_summary sections, and omit utility_incentive. Keep the rest.
Be specific to the customer and project. Do not use generic placeholder text.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return new Response(JSON.stringify({ error: 'AI generation failed: ' + errText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiResult = await response.json();
    const content = aiResult.content?.[0]?.text || '';

    // Parse the JSON from Claude's response
    let proposalLayout;
    try {
      // Try to extract JSON if wrapped in markdown fences
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      proposalLayout = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', content);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Add timestamp
    proposalLayout.generated_at = new Date().toISOString();

    return new Response(JSON.stringify({ proposal_layout: proposalLayout }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('generate-proposal-layout error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
