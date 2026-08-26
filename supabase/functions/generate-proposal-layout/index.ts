import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { sanitizeValueSection } from "../_shared/valueClaims.ts";
import { normalizeUpsells, buildTiers } from "../_shared/upsells.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
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
      include_value_section,
      upsells,
    } = await req.json();

    const totalNum = parseFloat(total) || 0;
    const incentiveNum = parseFloat(utility_incentive) || 0;
    const discountNum = parseFloat(discount) || 0;
    const manualSavingsNum = parseFloat(manual_annual_savings) || 0;
    const isFresh = user_direction === '__fresh__';
    const hasDirection = !isFresh && user_direction && user_direction.trim().length > 0;
    // Noah's ask: show building owners what the project does beyond the power
    // bill. On unless a rep turns it off — the reasons people actually buy are
    // rarely only the savings, and an opt-in nobody discovers is the same as
    // not building it (79 of 110 sends never switched to the interactive mode
    // for exactly that reason).
    const includeValueSection = include_value_section !== false;

    // The upsell catalogue the company actually sells, with REAL prices.
    // Previously the seven upsells were hardcoded in the prompt below and the
    // package prices were left for the model to invent
    // (`<good price + warranty & value-add cost>`), so customers chose between
    // Good/Better/Best at numbers nobody had set. Computed here, and written
    // over the model's output after it returns.
    const catalogue = normalizeUpsells(upsells);
    const computedTiers = buildTiers(totalNum, incentiveNum, catalogue);
    // Packages are only offered when the tenant actually has upsells to offer.
    // include_tiers alone produced three cards at the same price with feature
    // lists the model wrote itself — services the company does not sell, on the
    // document the customer chooses from.
    const showTiers = include_tiers && catalogue.length > 0;
    const betterFeatures = computedTiers[1].features;
    const bestFeatures = computedTiers[2].features;
    const hasExisting = existing_layout && existing_layout.sections;
    const hasAudit = audit_data && audit_data.annual_savings_kwh > 0;
    // Canonical annual savings: manual override (set by user on the estimate) wins over audit.
    const canonicalAnnualSavings = manualSavingsNum > 0
      ? manualSavingsNum
      : (hasAudit ? (audit_data.annual_savings_dollars || 0) : 0);
    // Do we have a savings figure that a HUMAN or a certified audit stands
    // behind? If not, the model must not produce one.
    //
    // This prompt used to tell the AI, when no audit was linked, to "estimate
    // annual_savings based on ... 15-30% of project cost/yr" and that "every
    // project saves money somehow — find the angle." It did exactly that:
    // of 77 estimates carrying a savings figure, ZERO matched their audit, 38
    // overstated it by 2x-35x, and ~48 landed inside that 15-30% band. Those
    // are energy-savings promises on proposals sent to customers, implying
    // electricity rates up to $2.80/kWh against a real $0.08/kWh. Damien
    // reported it as "completely wrong ... no idea where the numbers are
    // coming from" — because a model invented them to satisfy a heuristic.
    //
    // No measured data => no dollar claim. Qualitative framing only.
    const hasRealSavings = canonicalAnnualSavings > 0;

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

Revise the proposal layout according to the user's direction. Keep the same JSON structure. Only change what the user asked for — preserve sections and content they didn't mention.${hasAudit ? ' IMPORTANT: Always use the exact audit numbers provided — never estimate or replace them with guesses.' : hasRealSavings ? ` IMPORTANT: The annual savings figure is ${canonicalAnnualSavings}. Use it exactly — never estimate or replace it with a guess.` : ' IMPORTANT: This estimate has no audit and no savings figure. Do NOT introduce any annual savings, kWh, payback or ROI number — not even if the direction seems to ask for one. There is no measured basis for it.'} Return ONLY valid JSON (no markdown fences) with the same structure as the current layout.`;
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
${hasRealSavings
  ? `- annual_savings MUST BE THE SAME on all 3 tiers and EQUAL TO ${canonicalAnnualSavings}. Annual energy savings come from the lighting (same scope across tiers), so the savings figure does not change between Good / Better / Best.`
  : `- OMIT annual_savings and payback_months from every tier. There is no measured savings figure for this estimate and you must not invent one.`}
` : ''}
${hasAudit ? `
INVESTMENT GRADE AUDIT DATA (these are REAL certified numbers — use them EXACTLY):
You MUST use these exact figures in savings_timeline and roi_summary. Do NOT estimate or round them.
- annual_savings for savings_timeline AND roi_summary.metrics → ${audit_data.annual_savings_dollars}
- Calculate payback_months from: ($${netCostCalc.toFixed(2)} net cost) / $${audit_data.annual_savings_dollars}/yr * 12
- Calculate roi_percent from: (($${audit_data.annual_savings_dollars} * 5) - $${netCostCalc.toFixed(2)}) / $${netCostCalc.toFixed(2)} * 100
- Reference the specific audit findings in your copy: ${audit_data.watts_reduced}W reduction, ${audit_data.annual_savings_kwh.toLocaleString()} kWh/yr, ${audit_data.total_fixtures} fixtures.
- Include a "warranty" section with content from the company notes above.` : hasRealSavings ? `
ANNUAL SAVINGS (a real figure entered on the estimate — use it EXACTLY):
- annual_savings for savings_timeline AND roi_summary.metrics → ${canonicalAnnualSavings}
- Do NOT estimate, round, adjust or re-derive this number. It is the only savings figure you may state.
- Calculate payback_months from: ($${netCostCalc.toFixed(2)} net cost) / $${canonicalAnnualSavings}/yr * 12` : `
COST ANALYSIS APPROACH:
There is NO audit and NO savings figure on this estimate, so you have no measured
data. Frame the value QUALITATIVELY and make no numeric savings claim:
- For maintenance/repair work: the cost of emergency repairs, downtime, liability. A $5,000 preventative fix beats a $25,000 emergency.
- For upgrades/installations: operational reliability, reduced maintenance, extended equipment life.
- For any project: property value improvement, code compliance, safety, insurance implications.

HARD RULE — DO NOT INVENT A SAVINGS NUMBER:
- Do NOT state, estimate, infer or imply any annual savings, kWh figure, payback
  period or ROI percentage. Not as a number, not as a range, not "up to".
- Do NOT derive savings from a percentage of project cost. There is no basis for it.
- OMIT the savings_timeline and roi_summary sections entirely. Their absence is
  correct — an unmeasured guess printed next to our logo is a promise we cannot keep.
- Sell on the qualitative value above. That is enough.`}

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
    ${hasRealSavings ? `{ "type": "savings_timeline", "years": 5, "annual_savings": ${canonicalAnnualSavings}, "content": "specific description of WHERE the savings come from"${hasAudit ? `, "annual_kwh_savings": ${audit_data.annual_savings_kwh}, "watts_reduced": ${audit_data.watts_reduced}, "total_fixtures": ${audit_data.total_fixtures}` : ''} },
    { "type": "roi_summary", "content": "a line that frames the ROI as obvious", "metrics": { "annual_savings": ${canonicalAnnualSavings}, "payback_months": <calculated number>, "roi_percent": <calculated number> } },` : '/* no savings_timeline and no roi_summary — there is no measured savings figure for this estimate, so none may be stated */'}
    ${proposal_notes ? '{ "type": "warranty", "content": "write this based on the company notes above — make it feel like extra protection, not fine print" },' : ''}
    ${incentiveNum > 0 ? '{ "type": "utility_incentive", "content": "This is free money — explain why they need to claim it now" },' : ''}
    ${showTiers ? `{ "type": "pricing_tiers", "heading": "Choose Your Package", "content": "compelling subheading about options", "recommended": "better", "tiers": [
      { "id": "good", "name": "descriptive name", "price": ${totalNum.toFixed(2)}, "net_price": ${(totalNum - incentiveNum).toFixed(2)}, "description": "the base scope — everything in the estimate", "features": ["feature 1", "feature 2", "feature 3"]${hasRealSavings ? `, "annual_savings": ${canonicalAnnualSavings}, "payback_months": <number>` : ''} },
      { "id": "better", "name": "descriptive name", "price": ${computedTiers[1].price.toFixed(2)}, "net_price": ${computedTiers[1].net_price.toFixed(2)}, "description": "base scope plus: ${betterFeatures.join(', ')}", "features": ["everything in Good"${betterFeatures.length ? ', ' + betterFeatures.map(f => JSON.stringify(f)).join(', ') : ''}]${hasRealSavings ? `, "annual_savings": ${canonicalAnnualSavings}, "payback_months": <number>` : ''} },
      { "id": "best", "name": "descriptive name", "price": ${computedTiers[2].price.toFixed(2)}, "net_price": ${computedTiers[2].net_price.toFixed(2)}, "description": "everything in Better plus: ${bestFeatures.join(', ')}", "features": ["everything in Better"${bestFeatures.length ? ', ' + bestFeatures.map(f => JSON.stringify(f)).join(', ') : ''}]${hasRealSavings ? `, "annual_savings": ${canonicalAnnualSavings}, "payback_months": <number>` : ''} }
    ],
    /* The prices and the feature lists above are the COMPANY'S OWN catalogue
       and its real pricing. Reproduce them EXACTLY. Do not invent, round,
       re-order or add an upsell — write only the package "name" and
       "description" copy. A price you make up is a number nobody here set,
       on the document the customer chooses from. */ },` : ''}
    ${includeValueSection ? `{ "type": "added_value", "heading": "a heading about what this does for their BUILDING and their PEOPLE, not their power bill", "content": "1-2 sentences on why owners do this even before the savings", "claims": [
      { "kind": "one of: property_value | tax | rentability | appearance | productivity | safety | maintenance | comfort | compliance", "title": "short label", "detail": "2 sentences, concrete and specific to THIS project type and THIS customer", "basis": "where the claim comes from — REQUIRED for property_value and rentability" }
    ] },
    /* PICK 3-5 CLAIMS THAT FIT THE ACTUAL WORK, and only those an owner of THIS
       building would care about. A lighting retrofit argues property value,
       light quality and how people work under it. Window cleaning argues
       appearance, tenant impression and glass longevity. Pressure washing
       argues kerb appeal, slip safety and surface life. Fleet work argues
       uptime and driver safety. Do not list all nine.

       HARD RULES — these print on a document the customer signs:
       - NEVER put a dollar amount or a percentage on a TAX claim. Eligibility
         depends on their tax position. Say they may qualify and to confirm
         with their own advisor.
       - NEVER promise a property value or rent increase. Describe what owners
         TYPICALLY see and give the basis it rests on.
       - The words guaranteed, will increase, is worth are forbidden. Write
         typically, commonly, often.
       - Emotional is good. Invented is not. If a claim cannot be supported,
         leave it out. */` : ''}
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

    const ai = await callAnthropic(
      { feature: 'generate-proposal-layout', companyId: null, req },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 5000,
        messages: [{ role: 'user', content: prompt }],
      },
    );

    if (!ai.ok) {
      console.error('Anthropic API error:', ai.raw || ai.friendly);
      return new Response(JSON.stringify({ error: ai.friendly, ai_unavailable: ai.unavailable === true }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiResult = ai.data;
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

    // ENFORCEMENT: with no measured savings figure, strip anything the model
    // produced anyway. The prompt forbids it, but a prompt is a request, not a
    // guarantee — and the cost of the model ignoring it is a fabricated energy
    // promise printed on a proposal under the company's logo. Belt and braces.
    // ENFORCEMENT: the value section becomes part of a signed document, and
    // the model wrote it. No figure may sit on a tax claim, and property/rent
    // claims must be ranges rather than promises. Filtered here as well as at
    // render time, so a layout saved today cannot leak tomorrow.
    if (Array.isArray(proposalLayout.sections)) {
      proposalLayout.sections = proposalLayout.sections
        .map((s: Record<string, unknown>) =>
          s?.type === 'added_value' ? sanitizeValueSection(s) : s)
        .filter(Boolean);
    }

    // ENFORCEMENT: package prices and feature lists come from the CATALOGUE,
    // never from the model. It is asked nicely above, but a prompt is a
    // request — and the failure here is a customer choosing a package at a
    // price nobody in the company set. Copy (name, description) is left alone,
    // because that is the part the model is genuinely good at.
    if (catalogue.length > 0 && Array.isArray(proposalLayout.sections)) {
      for (const section of proposalLayout.sections) {
        if (section?.type !== 'pricing_tiers' || !Array.isArray(section.tiers)) continue;
        for (const tier of section.tiers) {
          const truth = computedTiers.find((t) => t.id === tier?.id);
          if (!truth) continue;
          tier.price = truth.price;
          tier.net_price = truth.net_price;
          tier.features = truth.id === 'good'
            ? (Array.isArray(tier.features) ? tier.features : [])
            : [truth.id === 'better' ? 'everything in Good' : 'everything in Better', ...truth.features];
        }
      }
    }

    if (!hasRealSavings && proposalLayout.sections) {
      const before = proposalLayout.sections.length;
      proposalLayout.sections = proposalLayout.sections.filter(
        (s: { type?: string }) => s?.type !== 'savings_timeline' && s?.type !== 'roi_summary'
      );
      for (const section of proposalLayout.sections) {
        if (section.type === 'pricing_tiers' && Array.isArray(section.tiers)) {
          for (const tier of section.tiers) {
            delete tier.annual_savings;
            delete tier.payback_months;
          }
        }
      }
      delete proposalLayout.audit_summary;
      if (before !== proposalLayout.sections.length) {
        console.warn('[generate-proposal-layout] stripped invented savings sections — no audit and no manual figure');
      }
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
