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
      user_direction,
      existing_layout,
      audit_data,
      audit_areas_data,
      proposal_notes,
    } = await req.json();

    const totalNum = parseFloat(total) || 0;
    const incentiveNum = parseFloat(utility_incentive) || 0;
    const discountNum = parseFloat(discount) || 0;
    const isFresh = user_direction === '__fresh__';
    const hasDirection = !isFresh && user_direction && user_direction.trim().length > 0;
    const hasExisting = existing_layout && existing_layout.sections;
    const hasAudit = audit_data && audit_data.annual_savings_kwh > 0;

    // Build context for Claude
    const lineItemsSummary = (line_items || []).map((li: any) =>
      `- ${li.item_name || li.description}: qty ${li.quantity || 1} @ $${li.price} = $${li.total}`
    ).join('\n');

    // Build certified audit data block
    let auditBlock = '';
    if (hasAudit) {
      auditBlock = `
CERTIFIED ENERGY AUDIT DATA (use these EXACT numbers — do NOT estimate or guess):
  Total Existing Wattage: ${audit_data.total_existing_watts.toLocaleString()}W
  Total Proposed (LED) Wattage: ${audit_data.total_proposed_watts.toLocaleString()}W
  Watts Reduced: ${audit_data.watts_reduced.toLocaleString()}W
  Total Fixtures: ${audit_data.total_fixtures}
  Operating Hours/Day: ${audit_data.operating_hours}
  Operating Days/Year: ${audit_data.operating_days}
  Electric Rate: $${audit_data.electric_rate}/kWh
  Annual Energy Savings: ${audit_data.annual_savings_kwh.toLocaleString()} kWh
  Annual Dollar Savings: $${audit_data.annual_savings_dollars.toLocaleString()}
  Estimated Utility Rebate: $${audit_data.estimated_rebate.toLocaleString()}`;

      if (audit_areas_data && audit_areas_data.length > 0) {
        auditBlock += '\n\n  Per-Area Breakdown:';
        for (const area of audit_areas_data) {
          auditBlock += `\n    ${area.area_name}: ${area.fixture_count} fixtures, ${area.existing_wattage}W→${area.led_wattage}W each (${area.area_watts_reduced}W reduced)${area.ceiling_height ? `, ${area.ceiling_height}ft ceiling` : ''}`;
        }
      }
    }

    let notesBlock = '';
    if (proposal_notes && proposal_notes.trim()) {
      notesBlock = `\nCOMPANY NOTES (include these in the proposal):\n${proposal_notes}\n`;
    }

    let prompt: string;

    if (hasDirection && hasExisting) {
      // Refinement mode
      prompt = `You are a professional proposal copywriter. You previously generated a proposal layout and the user wants you to revise it.

CURRENT LAYOUT:
${JSON.stringify(existing_layout, null, 2)}

ESTIMATE CONTEXT:
Company: ${company_name}
Customer: ${customer_name}
${customer_address ? `Location: ${customer_address}` : ''}
Line Items:
${lineItemsSummary || 'No line items provided'}
Total: $${totalNum.toFixed(2)}
${incentiveNum > 0 ? `Utility Incentive/Rebate: $${incentiveNum.toFixed(2)}` : ''}
${discountNum > 0 ? `Discount: $${discountNum.toFixed(2)}` : ''}
${auditBlock}
${notesBlock}
USER'S DIRECTION:
${user_direction}

Revise the proposal layout according to the user's direction. Keep the same JSON structure. Only change what the user asked for — preserve sections and content they didn't mention.${hasAudit ? ' IMPORTANT: Always use the exact audit numbers provided — never estimate or replace them with guesses.' : ''} Return ONLY valid JSON (no markdown fences) with the same structure as the current layout.`;
    } else {
      // Fresh generation — sell hard, every project type
      const netCostCalc = hasAudit
        ? totalNum - (audit_data.estimated_rebate || incentiveNum)
        : totalNum - incentiveNum;

      prompt = `You are a closer. Not a copywriter — a dealmaker who writes proposals that get signed. You work for ${company_name}, a field services company that takes care of commercial properties. Your job: make the customer feel like NOT doing this project is the riskier choice.

PROJECT DETAILS:
Company: ${company_name}
Customer: ${customer_name}
${customer_address ? `Location: ${customer_address}` : ''}
${estimate_message ? `Message from company: ${estimate_message}` : ''}

Line Items:
${lineItemsSummary || 'No line items provided'}

Total Investment: $${totalNum.toFixed(2)}
${incentiveNum > 0 ? `Utility Incentive/Rebate: $${incentiveNum.toFixed(2)} (FREE MONEY — hammer this)` : ''}
${discountNum > 0 ? `Discount Applied: $${discountNum.toFixed(2)}` : ''}
${auditBlock}
${notesBlock}
${hasDirection && user_direction !== '__fresh__' ? `\nSPECIFIC DIRECTION:\n${user_direction}\n` : ''}

WRITING RULES:
- Write like you're talking to a property manager or business owner who has 50 things on their plate. Be direct.
- Frame EVERY project as an investment that pays for itself — not an expense. Even maintenance work prevents bigger costs.
- Use real dollar amounts. Be specific. "Save $4,200/year" not "reduce costs."
- The problem_statement should make them feel the pain of doing nothing — what's it costing them RIGHT NOW to keep the old equipment, skip the maintenance, or ignore the issue?
- The executive_summary should read like a confident handshake — short, direct, "here's what we're going to do and why it's a no-brainer."
- Highlights should be punchy one-liners that a CFO would underline.
- The approval content should create urgency without being sleazy — pricing holds, scheduling windows, seasonal timing, rebate deadlines, etc.
${hasAudit ? `
INVESTMENT GRADE AUDIT DATA (these are REAL certified numbers — use them EXACTLY):
You MUST use these exact figures in savings_timeline and roi_summary. Do NOT estimate or round them.
- annual_savings for savings_timeline AND roi_summary.metrics → ${audit_data.annual_savings_dollars}
- Calculate payback_months from: ($${netCostCalc.toFixed(2)} net cost) / $${audit_data.annual_savings_dollars}/yr * 12
- Calculate roi_percent from: (($${audit_data.annual_savings_dollars} * 5) - $${netCostCalc.toFixed(2)}) / $${netCostCalc.toFixed(2)} * 100
- Reference the specific audit findings in your copy: ${audit_data.watts_reduced}W reduction, ${audit_data.annual_savings_kwh.toLocaleString()} kWh/yr, ${audit_data.total_fixtures} fixtures.
- Include a "warranty" section with content from the company notes above.` : `
COST ANALYSIS APPROACH:
Even without a formal energy audit, frame this as a smart investment:
- For maintenance/repair work: calculate the cost of emergency repairs, downtime, liability. A $5,000 preventative fix beats a $25,000 emergency.
- For upgrades/installations: calculate operational savings, reduced maintenance, extended equipment life. New equipment runs cheaper.
- For any project: property value improvement, code compliance, safety, insurance implications.
- Use the savings_timeline to show how the investment pays back over 3-5 years. Be conservative but real.
- Estimate annual_savings based on: reduced maintenance costs (15-30% of project cost/yr is common for preventative work), energy efficiency gains, avoided emergency repair costs.
- ALWAYS include savings_timeline and roi_summary — every project saves money somehow. Find the angle.`}

Return ONLY valid JSON (no markdown fences):
{
  "sections": [
    { "type": "hero", "heading": "a headline that makes them want to read more — NOT generic", "subheading": "confident one-liner about ${company_name}" },
    { "type": "executive_summary", "content": "2-3 sentences. Direct. What are we doing, why, and what they get. End with a line about the ROI." },
    { "type": "problem_statement", "content": "Make them feel what it's costing them to do nothing. Aging equipment, energy waste, safety risk, liability — whatever fits. Be specific to their project." },
    { "type": "solution_overview", "content": "What we're doing and why it's the right call. Specific to their line items.", "highlights": ["punchy benefit 1", "punchy benefit 2", "punchy benefit 3"] },
    { "type": "line_items", "show_images": true },
    { "type": "cost_breakdown", "chart_type": "donut" },
    { "type": "savings_timeline", "years": 5, "annual_savings": <real number>, "content": "specific description of WHERE the savings come from"${hasAudit ? `, "annual_kwh_savings": ${audit_data.annual_savings_kwh}, "watts_reduced": ${audit_data.watts_reduced}, "total_fixtures": ${audit_data.total_fixtures}` : ''} },
    { "type": "roi_summary", "content": "a line that frames the ROI as obvious", "metrics": { "annual_savings": <real number>, "payback_months": <calculated number>, "roi_percent": <calculated number> } },
    ${proposal_notes ? '{ "type": "warranty", "content": "write this based on the company notes above — make it feel like extra protection, not fine print" },' : ''}
    ${incentiveNum > 0 ? '{ "type": "utility_incentive", "content": "This is free money — explain why they need to claim it now" },' : ''}
    { "type": "team" },
    { "type": "approval", "cta_text": "Approve & Schedule", "content": "create urgency — pricing, scheduling, rebate deadlines, seasonal timing. Make them feel like waiting costs money." }
  ]${hasAudit ? `,
  "audit_certified": true,
  "audit_summary": {
    "total_fixtures": ${audit_data.total_fixtures},
    "watts_reduced": ${audit_data.watts_reduced},
    "annual_kwh_savings": ${audit_data.annual_savings_kwh},
    "annual_dollar_savings": ${audit_data.annual_savings_dollars},
    "electric_rate": ${audit_data.electric_rate},
    "operating_hours": ${audit_data.operating_hours},
    "operating_days": ${audit_data.operating_days}${audit_areas_data ? `,
    "areas": ${JSON.stringify(audit_areas_data)}` : ''}
  }` : ''}
}

Be specific to ${customer_name} and this project. Generic copy = lost deal. Sell it.`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      proposalLayout = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', content);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Inject real audit data into sections so the frontend charts use exact numbers
    if (hasAudit && proposalLayout.sections) {
      // Ensure audit_summary is preserved at the layout level
      if (!proposalLayout.audit_summary) {
        proposalLayout.audit_summary = {
          total_fixtures: audit_data.total_fixtures,
          watts_reduced: audit_data.watts_reduced,
          annual_kwh_savings: audit_data.annual_savings_kwh,
          annual_dollar_savings: audit_data.annual_savings_dollars,
          electric_rate: audit_data.electric_rate,
          operating_hours: audit_data.operating_hours,
          operating_days: audit_data.operating_days,
          areas: audit_areas_data || [],
        };
      }
      proposalLayout.audit_certified = true;

      // Force correct numbers into savings_timeline
      const savingsSection = proposalLayout.sections.find((s: any) => s.type === 'savings_timeline');
      if (savingsSection) {
        savingsSection.annual_savings = audit_data.annual_savings_dollars;
        savingsSection.annual_kwh_savings = audit_data.annual_savings_kwh;
        savingsSection.watts_reduced = audit_data.watts_reduced;
        savingsSection.total_fixtures = audit_data.total_fixtures;
      }

      // Force correct numbers into roi_summary
      const roiSection = proposalLayout.sections.find((s: any) => s.type === 'roi_summary');
      if (roiSection) {
        if (!roiSection.metrics) roiSection.metrics = {};
        roiSection.metrics.annual_savings = audit_data.annual_savings_dollars;
        const netCost = totalNum - (audit_data.estimated_rebate || incentiveNum);
        if (audit_data.annual_savings_dollars > 0) {
          roiSection.metrics.payback_months = Math.round((netCost / audit_data.annual_savings_dollars) * 12);
          roiSection.metrics.roi_percent = Math.round(((audit_data.annual_savings_dollars * 5 - netCost) / netCost) * 100);
        }
      }
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
