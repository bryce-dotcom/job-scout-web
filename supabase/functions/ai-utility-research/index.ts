import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callClaude(
  apiKey: string,
  system: string,
  userMessage: string,
  opts: { webSearch?: number; maxTokens?: number; beta?: string; retries?: number } = {}
) {
  const { webSearch = 0, maxTokens = 16000, beta, retries = 1 } = opts;
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  };
  if (webSearch > 0) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: webSearch }];
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (beta) headers['anthropic-beta'] = beta;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.error) {
      const msg = data.error.message || 'Anthropic API error';
      if (msg.includes('rate limit') && attempt < retries) {
        console.log(`Rate limited, waiting 61s before retry...`);
        await wait(61000);
        continue;
      }
      throw new Error(msg);
    }

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n');
    return text;
  }
  throw new Error('Max retries exceeded');
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  try { return JSON.parse(text.substring(start, end + 1)); }
  catch { return null; }
}

// ── System Prompt (single-pass with web search) ──────────────────────────────

const SYSTEM_PROMPT = `You are a utility rebate and electric rate research assistant. Research ALL commercial energy efficiency programs for electric utilities in a given US state.

Use web search to find current program pages, incentive rate tables, tariff schedules, and application forms. Search for:
- "[state] electric utility commercial rebates 2025"
- "[major utility] business incentive program"
- "[utility] prescriptive rebate rates"
- "[utility] commercial rate schedule tariff"

EXAMPLE (one record per array — show ALL fields like this):
{"providers":[{"provider_name":"Rocky Mountain Power","state":"UT","service_territory":"Most of Utah","has_rebate_program":true,"rebate_program_url":"https://www.rockymountainpower.net/savings-energy-choices/business.html","contact_phone":"1-888-221-7070","notes":"Largest IOU"}],
"programs":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","program_type":"Prescriptive","program_category":"Comprehensive","delivery_mechanism":"Prescriptive","business_size":"All","dlc_required":true,"pre_approval_required":false,"application_required":true,"post_inspection_required":false,"contractor_prequalification":false,"program_url":"https://example.com/program","max_cap_percent":70,"annual_cap_dollars":500000,"source_year":2025,"eligible_sectors":["Commercial","Industrial"],"eligible_building_types":["Office","Warehouse","Retail"],"required_documents":["W9","Invoice","DLC certificate"],"stacking_allowed":false,"stacking_rules":"No prescriptive+custom","funding_status":"Open","processing_time_days":60,"rebate_payment_method":"Check","program_notes_ai":"Lighting rates vary by controls tier."}],
"incentives":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","measure_category":"Lighting","measure_subcategory":"LED Interior","fixture_category":"Linear","measure_type":"LED Retrofit","calc_method":"Per Watt Reduced","rate":0.60,"rate_value":0.60,"rate_unit":"/watt","tier":"No Controls","cap_percent":70,"equipment_requirements":"DLC 5.1+","baseline_description":"Fluorescent T8/T12","replacement_description":"DLC LED","notes":"Base rate"}],
"prescriptive_measures":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","measure_code":"LT-001","measure_name":"Interior Linear T8 to LED No Controls","measure_category":"Lighting","measure_subcategory":"Linear","baseline_equipment":"T8 4ft 32W 2-lamp","baseline_wattage":64,"replacement_equipment":"DLC LED 36W","replacement_wattage":36,"incentive_amount":0.60,"incentive_unit":"per_watt_reduced","incentive_formula":"(64-36) x $0.60 = $16.80","max_incentive":null,"location_type":"interior","application_type":"retrofit","dlc_required":true,"dlc_tier":"Standard","energy_star_required":false,"hours_requirement":null,"source_page":null,"needs_pdf_upload":true,"notes":"Base rate"},{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","measure_code":"HV-001","measure_name":"VFD for HVAC Fan/Pump","measure_category":"HVAC","measure_subcategory":"VFD","baseline_equipment":"Constant speed motor","baseline_wattage":7460,"replacement_equipment":"VFD-controlled motor","replacement_wattage":null,"incentive_amount":200,"incentive_unit":"per_hp","incentive_formula":"$200/HP","max_incentive":5000,"location_type":null,"application_type":"retrofit","dlc_required":false,"dlc_tier":null,"energy_star_required":false,"hours_requirement":null,"source_page":null,"needs_pdf_upload":true,"notes":"HVAC only"}],
"rate_schedules":[{"provider_name":"Rocky Mountain Power","schedule_name":"Schedule 6 - General Service","customer_category":"Medium Commercial","rate_type":"Demand","rate_per_kwh":0.0845,"peak_rate_per_kwh":null,"off_peak_rate_per_kwh":null,"summer_rate_per_kwh":null,"winter_rate_per_kwh":null,"demand_charge":9.50,"min_demand_charge":null,"customer_charge":35,"time_of_use":false,"effective_date":null,"source_url":"https://example.com/tariff.pdf","description":"200-1000 kW","notes":"With demand charge"}],
"forms":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","form_name":"Business Incentive Application","form_type":"Application","form_url":"https://example.com/app.pdf","version_year":2025,"is_required":true,"form_notes":"Main application"}]}

TYPE RULES: source_year and version_year must be integers (2025 not "2025"). eligible_sectors, eligible_building_types, required_documents must be arrays or null — never plain strings.

CRITICAL RULES:
1. TWO ARRAYS — "incentives" (rate card summaries per tier) AND "prescriptive_measures" (specific line items with wattages). You MUST populate BOTH.
2. Lighting: show No Controls, Networked Controls, LLLC tiers. Show Linear, High Bay, Exterior.
3. HVAC: VFD ($/HP), Heat Pump ($/ton), RTU ($/ton), Chillers.
4. Also: Refrigeration, Motors, Building Envelope if offered.
5. measure_code prefix: LT-, HV-, MT-, RF-, BE-
6. needs_pdf_upload: always true
7. incentive_formula: show the math like "(64W-36W) x $0.60 = $16.80"
8. Rate schedules: find ALL published commercial rate schedules for each major utility. Include small commercial, medium/demand, large/TOU, AND any special schedules (agricultural, irrigation, lighting, industrial). Search for "[utility] tariff schedule" or "[utility] rate book". Aim for 5-8 schedules for the primary utility.
9. rate and rate_value must BOTH be populated with same number.
10. rate_per_kwh in dollars (0.0845 = 8.45 cents/kWh).
11. program_name includes year: "Name (2025)".
12. Find 3-8 providers. Major programs should have 15-25 prescriptive measures.
13. For unknown fields, set to null. Never omit fields.

FIELD COMPLETENESS — every record MUST populate these fields (search if needed):
• providers: ALWAYS include rebate_program_url (search "[name] energy efficiency" for URL) and contact_phone (search "[name] contact us"). If truly unfindable, set null — but TRY.
• programs: ALWAYS include pre_approval_required (true/false), stacking_allowed (true/false), annual_cap_dollars (number or null). Also include eligible_sectors, required_documents, funding_status, processing_time_days, rebate_payment_method.
• incentives: ALWAYS include measure_category, fixture_category, calc_method, rate_unit, tier, equipment_requirements, baseline_description.
• prescriptive_measures: ALWAYS include baseline_wattage (number — estimate from baseline equipment if exact unknown), dlc_required (true for lighting, false for HVAC/motors/refrigeration/envelope), location_type ("interior"/"exterior"/null for non-lighting). Also include replacement_wattage, incentive_formula, measure_subcategory.
• rate_schedules: ALWAYS include demand_charge (number or null if none), customer_charge (number), source_url, description, customer_category, rate_type.
• forms: ALWAYS include provider_name, form_url (search for it), version_year, is_required.

Return ONLY valid JSON, no other text.`;

// ── Scoring ──────────────────────────────────────────────────────────────────

function calculateCompleteness(results: Record<string, unknown[]>) {
  const levelScores: Record<string, { name: string; score: number; count: number }> = {};
  const scoreLevels = [
    { level: 1, name: 'Utility Discovery', key: 'providers', required: ['provider_name', 'state', 'has_rebate_program'], optional: ['service_territory', 'rebate_program_url', 'contact_phone'] },
    { level: 2, name: 'Program Discovery', key: 'programs', required: ['provider_name', 'program_name', 'program_type'], optional: ['program_category', 'delivery_mechanism', 'program_url', 'source_year'] },
    { level: 3, name: 'Program Details', key: 'programs', required: ['program_name'], optional: ['max_cap_percent', 'annual_cap_dollars', 'required_documents', 'pre_approval_required', 'stacking_allowed', 'funding_status', 'processing_time_days', 'program_notes_ai'] },
    { level: 4, name: 'Measure Categories', key: 'incentives', required: ['provider_name', 'program_name', 'rate_value'], optional: ['measure_category', 'fixture_category', 'calc_method', 'rate_unit', 'tier', 'equipment_requirements', 'baseline_description'] },
    { level: 5, name: 'Prescriptive Measures', key: 'prescriptive_measures', required: ['provider_name', 'program_name', 'measure_name', 'incentive_amount'], optional: ['measure_code', 'baseline_equipment', 'baseline_wattage', 'replacement_equipment', 'incentive_unit', 'incentive_formula', 'dlc_required', 'location_type'] },
    { level: 6, name: 'Rate Schedules', key: 'rate_schedules', required: ['provider_name', 'schedule_name', 'rate_per_kwh'], optional: ['customer_category', 'rate_type', 'demand_charge', 'customer_charge', 'time_of_use', 'source_url', 'description'] },
    { level: 7, name: 'Forms & Documents', key: 'forms', required: ['form_name', 'form_type'], optional: ['provider_name', 'form_url', 'version_year', 'is_required', 'form_notes'] }
  ];

  let totalWeighted = 0;
  let weightedFilled = 0;
  const weights: Record<number, number> = { 1: 10, 2: 15, 3: 15, 4: 15, 5: 25, 6: 10, 7: 10 };
  const missing_data: string[] = [];

  for (const sl of scoreLevels) {
    const items = results[sl.key] || [];
    let filled = 0;
    let total = 0;
    for (const item of items) {
      const rec = item as Record<string, unknown>;
      for (const f of [...sl.required, ...sl.optional]) {
        total++;
        const v = rec[f];
        if (v !== null && v !== undefined && v !== '') filled++;
      }
    }
    const score = total > 0 ? Math.round((filled / total) * 100) : 0;
    levelScores[sl.level] = { name: sl.name, score, count: items.length };
    const w = weights[sl.level] || 10;
    totalWeighted += w;
    weightedFilled += (score / 100) * w;
    if (items.length === 0) {
      missing_data.push(`Level ${sl.level} (${sl.name}): No data found`);
    } else if (score < 50) {
      missing_data.push(`Level ${sl.level} (${sl.name}): Only ${score}% complete`);
    }
  }

  const completeness_score = totalWeighted > 0 ? Math.round((weightedFilled / totalWeighted) * 100) : 0;
  return { completeness_score, level_scores: levelScores, missing_data };
}

// ── PDF Enrichment (optional) ────────────────────────────────────────────────

async function enrichWithPdfs(
  results: Record<string, unknown[]>,
  apiKey: string,
  timeLimit: number
) {
  const programs = (results.programs || []) as Record<string, unknown>[];
  const programsWithUrls = programs
    .filter(p => p.program_url && String(p.program_url).startsWith('http'))
    .slice(0, 5);

  const pdfStartTime = Date.now();
  const discoveredPdfs: { url: string; program_name: string; provider_name: string }[] = [];

  for (const prog of programsWithUrls) {
    if (Date.now() - pdfStartTime > timeLimit) break;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const htmlResponse = await fetch(String(prog.program_url), {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScout/1.0)' }
      });
      clearTimeout(timeout);
      if (!htmlResponse.ok) continue;

      const contentType = htmlResponse.headers.get('content-type') || '';
      if (contentType.includes('application/pdf')) {
        discoveredPdfs.push({ url: String(prog.program_url), program_name: String(prog.program_name), provider_name: String(prog.provider_name) });
        continue;
      }

      const html = await htmlResponse.text();
      const pdfLinkRegex = /href=["']([^"']*\.pdf(?:\?[^"']*)?)['"]/gi;
      let match;
      const baseUrl = new URL(String(prog.program_url));
      const seenUrls = new Set<string>();

      while ((match = pdfLinkRegex.exec(html)) !== null) {
        let pdfUrl = match[1];
        if (pdfUrl.startsWith('/')) pdfUrl = `${baseUrl.protocol}//${baseUrl.host}${pdfUrl}`;
        else if (!pdfUrl.startsWith('http')) {
          const parts = baseUrl.pathname.split('/'); parts.pop();
          pdfUrl = `${baseUrl.protocol}//${baseUrl.host}${parts.join('/')}/${pdfUrl}`;
        }
        const lower = pdfUrl.toLowerCase();
        const relevant = ['rebate','incentive','prescriptive','measure','worksheet','lighting','hvac','commercial','business','energy','efficiency','application','schedule','tariff','rate'];
        if (relevant.some(t => lower.includes(t)) && !seenUrls.has(pdfUrl)) {
          seenUrls.add(pdfUrl);
          discoveredPdfs.push({ url: pdfUrl, program_name: String(prog.program_name), provider_name: String(prog.provider_name) });
        }
      }
    } catch { continue; }
  }

  const pdfsToProcess = discoveredPdfs.slice(0, 3);
  console.log(`PDF enrichment: discovered ${discoveredPdfs.length}, processing ${pdfsToProcess.length}`);

  for (const pdfInfo of pdfsToProcess) {
    if (Date.now() - pdfStartTime > timeLimit) break;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const pdfRes = await fetch(pdfInfo.url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScout/1.0)' } });
      clearTimeout(t);
      if (!pdfRes.ok) continue;

      const buf = await pdfRes.arrayBuffer();
      const b64 = base64Encode(new Uint8Array(buf));
      if (b64.length > 20 * 1024 * 1024) continue;

      const pdfText = await callClaude(apiKey,
        `Extract every prescriptive measure from this utility rebate PDF. Return JSON:
{"prescriptive_measures":[{"measure_code":"string","measure_name":"string","measure_category":"Lighting|HVAC|Motors|Refrigeration|Building Envelope","measure_subcategory":"string","baseline_equipment":"string","baseline_wattage":null,"replacement_equipment":"string","replacement_wattage":null,"incentive_amount":0,"incentive_unit":"per_fixture|per_watt_reduced|per_kw|flat|per_ton","dlc_required":false,"energy_star_required":false,"location_type":"interior|exterior|null","source_page":"string","notes":"string"}]}
Extract EVERY line item. Do not skip rows.`,
        `Extract all prescriptive measures from this PDF for "${pdfInfo.program_name}" by "${pdfInfo.provider_name}".`,
        { maxTokens: 32000, beta: 'pdfs-2024-09-25' }
      );

      const pdfResults = extractJson(pdfText);
      if (pdfResults?.prescriptive_measures && Array.isArray(pdfResults.prescriptive_measures)) {
        for (const pm of pdfResults.prescriptive_measures as Record<string, unknown>[]) {
          pm.provider_name = pdfInfo.provider_name;
          pm.program_name = pdfInfo.program_name;
          pm.needs_pdf_upload = false;
          pm.source_pdf_url = pdfInfo.url;
        }
        results.prescriptive_measures = [
          ...(results.prescriptive_measures || []),
          ...pdfResults.prescriptive_measures as unknown[]
        ];
        console.log(`PDF: extracted ${(pdfResults.prescriptive_measures as unknown[]).length} measures from ${pdfInfo.url}`);
      }
    } catch (e) {
      console.log(`PDF error: ${(e as Error).message}`);
      continue;
    }
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { state, fetch_pdfs } = await req.json();

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

    const startTime = Date.now();
    const elapsed = () => Date.now() - startTime;

    // ─── Single-pass research with web search ───────────────────────────
    console.log(`[Research] Starting for ${state} with web search...`);

    const text = await callClaude(ANTHROPIC_API_KEY, SYSTEM_PROMPT,
      `Research ALL electric utility providers in ${state} with commercial energy efficiency rebate programs.

For each provider, find:
- Level 1: Provider details — name, territory, URL, phone. SEARCH for each provider's website and contact page.
- Level 2: All incentive/rebate programs with year and URLs
- Level 3: Program qualification details — pre_approval_required (bool), stacking_allowed (bool), annual_cap_dollars, eligible_sectors, required_documents, funding_status, processing_time_days, rebate_payment_method, program_notes_ai
- Level 4: Incentive rate card — one row per measure_category + tier combo. EVERY incentive MUST have: measure_category, fixture_category (use "Other" for HVAC/motors), calc_method, rate_unit, tier (use "Standard" if only one tier), equipment_requirements, baseline_description, replacement_description.
- Level 5: 15-25 prescriptive_measures with ALL fields filled. Every measure MUST have: baseline_wattage (estimate from equipment if exact unknown), replacement_wattage (estimate if needed), dlc_required (true for lighting, false otherwise), location_type (interior/exterior/null for non-lighting), incentive_formula with actual math, measure_subcategory.
- Level 6: ALL published rate schedules for each major utility — not just 3. Include small commercial, medium/demand, large/TOU, agricultural/irrigation, lighting, industrial. Search "[utility] tariff rate book" for the full list. Each must have demand_charge, customer_charge, source_url, description, customer_category, rate_type.
- Level 7: Forms — include provider_name, form_url, version_year, is_required for each.

Search for actual utility program pages. Prioritize field completeness — every field in the schema should be populated (use null only when truly unknown). Maximize completeness at every level.

Return the structured JSON.`,
      { webSearch: 4, maxTokens: 32000 }
    );

    console.log(`[Research] API call done in ${elapsed()}ms`);

    const results = extractJson(text) as Record<string, unknown[]> | null;

    if (!results?.providers) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to parse results', raw: text.substring(0, 2000) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ─── Normalize ──────────────────────────────────────────────────────
    // Backward compat: "rates" → "incentives"
    if ((results as Record<string, unknown>).rates && !results.incentives) {
      results.incentives = (results as Record<string, unknown>).rates as unknown[];
      delete (results as Record<string, unknown>).rates;
    }

    // Ensure all arrays exist
    if (!results.incentives) results.incentives = [];
    if (!results.programs) results.programs = [];
    if (!results.rate_schedules) results.rate_schedules = [];
    if (!results.prescriptive_measures) results.prescriptive_measures = [];
    if (!results.forms) results.forms = [];

    // Normalize rate/rate_value
    for (const inc of results.incentives as Record<string, unknown>[]) {
      if (inc.rate_value == null && inc.rate != null) inc.rate_value = inc.rate;
      if (inc.rate == null && inc.rate_value != null) inc.rate = inc.rate_value;
    }

    // Flag AI-only measures
    for (const pm of results.prescriptive_measures as Record<string, unknown>[]) {
      if (pm.needs_pdf_upload === undefined || pm.needs_pdf_upload === null) {
        pm.needs_pdf_upload = true;
      }
    }

    console.log(`[Normalize] providers: ${results.providers.length}, programs: ${results.programs.length}, incentives: ${results.incentives.length}, measures: ${results.prescriptive_measures.length}, schedules: ${results.rate_schedules.length}, forms: ${results.forms.length}`);

    // ─── Optional: PDF enrichment ───────────────────────────────────────
    if (fetch_pdfs) {
      const pdfTimeLimit = Math.min(90000, Math.max(30000, 240000 - elapsed()));
      console.log(`[PDF] Enrichment with ${pdfTimeLimit}ms budget...`);
      await enrichWithPdfs(results, ANTHROPIC_API_KEY, pdfTimeLimit);
      console.log(`[PDF] Done in ${elapsed()}ms`);
    }

    // ─── Score and return ───────────────────────────────────────────────
    const { completeness_score, level_scores, missing_data } = calculateCompleteness(results);

    console.log(`[Done] Score: ${completeness_score}/100 in ${elapsed()}ms`);

    return new Response(JSON.stringify({
      success: true,
      results,
      completeness_score,
      level_scores,
      missing_data,
      timing: { total_ms: elapsed() }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
