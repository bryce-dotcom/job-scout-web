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
      include_tiers,
      eos_data,
      manual_annual_savings,
    } = await req.json();

    const totalNum = parseFloat(total) || 0;
    const incentiveNum = parseFloat(utility_incentive) || 0;
    const discountNum = parseFloat(discount) || 0;
    const manualSavingsNum = parseFloat(manual_annual_savings) || 0;
    const isFresh = user_direction === '__fresh__';
    const hasDirection = !isFresh && user_direction && user_direction.trim().length > 0;
    const hasExisting = existing_layout && existing_layout.sections;
    const hasAudit = audit_data && audit_data.annual_savings_kwh > 0;
    // Canonical annual savings: manual override (set by user on the estimate) wins over audit.
    const canonicalAnnualSavings = manualSavingsNum > 0
      ? manualSavingsNum
      : (hasAudit ? (audit_data.annual_savings_dollars || 0) : 0);

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
  Estimated Utility Incentive: $${audit_data.estimated_rebate.toLocaleString()}`;

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

    // Build EOS company strategy block
    let eosBlock = '';
    if (eos_data) {
      const parts: string[] = [];
      if (eos_data.core_values?.length) {
        parts.push(`Core Values: ${eos_data.core_values.map((v: any) => typeof v === 'string' ? v : v.name || v.value).join(', ')}`);
      }
      if (eos_data.core_focus) {
        if (eos_data.core_focus.purpose) parts.push(`Our Purpose: ${eos_data.core_focus.purpose}`);
        if (eos_data.core_focus.niche) parts.push(`Our Niche: ${eos_data.core_focus.niche}`);
      }
      if (eos_data.marketing_strategy) {
        const ms = eos_data.marketing_strategy;
        if (ms.target_market) parts.push(`Target Market: ${ms.target_market}`);
        if (ms.uniques?.length) parts.push(`3 Uniques (our differentiators):\n${ms.uniques.map((u: any, i: number) => `  ${i + 1}. ${typeof u === 'string' ? u : u.name || u.value}`).join('\n')}`);
        if (ms.proven_process?.length) parts.push(`Proven Process: ${ms.proven_process.map((s: any) => typeof s === 'string' ? s : s.name || s.step).join(' → ')}`);
        if (ms.guarantee) parts.push(`Our Guarantee: ${ms.guarantee}`);
      }
      if (eos_data.ten_year_target) {
        const t = typeof eos_data.ten_year_target === 'string' ? eos_data.ten_year_target : eos_data.ten_year_target.target || eos_data.ten_year_target.description;
        if (t) parts.push(`10-Year Vision: ${t}`);
      }
      if (parts.length > 0) {
        eosBlock = `\nCOMPANY STRATEGY & IDENTITY (weave these into the proposal to sell the company, not just the project):
${parts.join('\n')}\n`;
      }
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
${incentiveNum > 0 ? `Utility Incentive: $${incentiveNum.toFixed(2)}` : ''}
${discountNum > 0 ? `Discount: $${discountNum.toFixed(2)}` : ''}
${auditBlock}
${notesBlock}
${eosBlock}
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
${incentiveNum > 0 ? `Utility Incentive: $${incentiveNum.toFixed(2)} (FREE MONEY — hammer this)` : ''}
${discountNum > 0 ? `Discount Applied: $${discountNum.toFixed(2)}` : ''}
${auditBlock}
${notesBlock}
${eosBlock}
${hasDirection && user_direction !== '__fresh__' ? `\nSPECIFIC DIRECTION:\n${user_direction}\n` : ''}

WRITING RULES:
- Write like you're talking to a property manager or business owner who has 50 things on their plate. Be direct.
- Frame EVERY project as an investment that pays for itself — not an expense. Even maintenance work prevents bigger costs.
- Use real dollar amounts. Be specific. "Save $4,200/year" not "reduce costs."
- The problem_statement should make them feel the pain of doing nothing — what's it costing them RIGHT NOW to keep the old equipment, skip the maintenance, or ignore the issue?
- The executive_summary should read like a confident handshake — short, direct, "here's what we're going to do and why it's a no-brainer."
- Highlights should be punchy one-liners that a CFO would underline.
- The approval content should create urgency without being sleazy — pricing holds, scheduling windows, seasonal timing, incentive deadlines, etc.
- NEVER use the word "rebate" — always say "incentive" or "utility incentive."
- If COMPANY STRATEGY data is provided, use it to sell the company: weave core values into the executive summary, reference the proven process in solution_overview, use the guarantee in the approval section, and create a compelling "why_us" section from the 3 uniques and company purpose. Don't just list them — tell a story about why this company is different.
${include_tiers ? `
PRICING TIERS (Good / Better / Best):
Create 3 pricing tiers. CRITICAL RULES:
- The utility incentive amount is THE SAME across all 3 tiers. Incentives do NOT increase with tier level.
- "Good" = the base scope (the estimate as-is). This is what the line items already cover.
- "Better" = base scope + 2-year extended warranty + value-adds. Value-adds can include: recycling/disposal of old fixtures, priority scheduling, enhanced cleanup. If smart controls are in the scope, add app access.
- "Best" = base scope + 3-year extended warranty + all Better value-adds + premium extras. Premium extras can include: remote monitoring, annual maintenance check, smart controls app access if applicable, fixture cleaning, emergency priority service.
- Price increases between tiers come ONLY from the customer's net cost (after incentive). The incentive stays fixed.
- net_price for ALL tiers = price - incentive (same incentive amount subtracted from each).
- The recommended tier should be "better".
- NEVER use the word "rebate" — always say "incentive."
- annual_savings MUST BE THE SAME on all 3 tiers${canonicalAnnualSavings > 0 ? ` and EQUAL TO ${canonicalAnnualSavings}` : ''}. Annual energy savings come from the lighting (same scope across tiers), so the savings figure does not change between Good / Better / Best.
` : ''}
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
    ${eosBlock ? '{ "type": "why_us", "heading": "Why [company name]", "content": "compelling narrative about what makes this company different — weave in core values, proven process, guarantee, and 3 uniques. Do NOT just list bullet points — tell a story.", "highlights": ["differentiator 1", "differentiator 2", "differentiator 3"] },' : ''}
    { "type": "line_items", "show_images": true },
    { "type": "cost_breakdown", "chart_type": "donut" },
    { "type": "savings_timeline", "years": 5, "annual_savings": <real number>, "content": "specific description of WHERE the savings come from"${hasAudit ? `, "annual_kwh_savings": ${audit_data.annual_savings_kwh}, "watts_reduced": ${audit_data.watts_reduced}, "total_fixtures": ${audit_data.total_fixtures}` : ''} },
    { "type": "roi_summary", "content": "a line that frames the ROI as obvious", "metrics": { "annual_savings": <real number>, "payback_months": <calculated number>, "roi_percent": <calculated number> } },
    ${proposal_notes ? '{ "type": "warranty", "content": "write this based on the company notes above — make it feel like extra protection, not fine print" },' : ''}
    ${incentiveNum > 0 ? '{ "type": "utility_incentive", "content": "This is free money — explain why they need to claim it now" },' : ''}
    ${include_tiers ? `{ "type": "pricing_tiers", "heading": "Choose Your Package", "content": "compelling subheading about options", "recommended": "better", "tiers": [
      { "id": "good", "name": "descriptive name", "price": ${totalNum.toFixed(2)}, "net_price": ${(totalNum - incentiveNum).toFixed(2)}, "description": "the base scope — everything in the estimate", "features": ["feature 1", "feature 2", "feature 3"], "annual_savings": <number>, "payback_months": <number> },
      { "id": "better", "name": "descriptive name", "price": <good price + warranty & value-add cost>, "net_price": <price - ${incentiveNum.toFixed(2)} (SAME incentive)>, "description": "base scope + 2-year extended warranty + value-adds like recycling old fixtures, priority scheduling", "features": ["everything in Good", "2-Year Extended Warranty", "Old Fixture Recycling & Disposal", "Priority Scheduling"], "annual_savings": <number>, "payback_months": <number> },
      { "id": "best", "name": "descriptive name", "price": <better price + premium extras cost>, "net_price": <price - ${incentiveNum.toFixed(2)} (SAME incentive)>, "description": "the premium experience — 3-year warranty, remote monitoring, everything in Better plus more", "features": ["everything in Better", "3-Year Extended Warranty", "Remote Monitoring", "Annual Maintenance Check", "Emergency Priority Service"], "annual_savings": <number>, "payback_months": <number> }
    ] },` : ''}
    { "type": "team" },
    { "type": "approval", "cta_text": "Approve & Schedule", "content": "create urgency — pricing, scheduling, incentive deadlines, seasonal timing. Make them feel like waiting costs money." }
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
        model: 'claude-sonnet-4-6',
        max_tokens: 5000,
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

    // Force the canonical annual savings number across every section that displays it,
    // so the AI cannot invent per-tier or per-section variants. Manual override beats audit.
    if (canonicalAnnualSavings > 0 && proposalLayout.sections) {
      const netCost = totalNum - (hasAudit ? (audit_data.estimated_rebate || incentiveNum) : incentiveNum);
      const paybackMonths = canonicalAnnualSavings > 0
        ? Math.round((netCost / canonicalAnnualSavings) * 12)
        : 0;

      for (const section of proposalLayout.sections) {
        if (section.type === 'savings_timeline') {
          section.annual_savings = canonicalAnnualSavings;
        }
        if (section.type === 'roi_summary') {
          if (!section.metrics) section.metrics = {};
          section.metrics.annual_savings = canonicalAnnualSavings;
          if (netCost > 0) {
            section.metrics.payback_months = paybackMonths;
            section.metrics.roi_percent = Math.round(((canonicalAnnualSavings * 5 - netCost) / netCost) * 100);
          }
        }
        if (section.type === 'pricing_tiers' && Array.isArray(section.tiers)) {
          for (const tier of section.tiers) {
            tier.annual_savings = canonicalAnnualSavings;
            const tierNet = parseFloat(tier.net_price) || netCost;
            if (tierNet > 0) {
              tier.payback_months = Math.round((tierNet / canonicalAnnualSavings) * 12);
            }
          }
        }
      }
    }

    // Inject real audit data into sections so the frontend charts use exact numbers.
    // Note: tier annual_savings already forced above using canonicalAnnualSavings (which prefers manual override).
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

      // Force correct kWh / wattage / fixture numbers into savings_timeline.
      // annual_savings already set above using canonicalAnnualSavings (manual override wins).
      const savingsSection = proposalLayout.sections.find((s: any) => s.type === 'savings_timeline');
      if (savingsSection) {
        savingsSection.annual_kwh_savings = audit_data.annual_savings_kwh;
        savingsSection.watts_reduced = audit_data.watts_reduced;
        savingsSection.total_fixtures = audit_data.total_fixtures;
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
