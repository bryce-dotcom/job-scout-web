// AI utility research for Data Console > Utilities.
//
// Runs in PHASES, one HTTP request each, because a single "research the whole
// state" call to Claude took several minutes and the gateway killed it at the
// 150s idle timeout every time (see _shared/streamedJson.ts). The browser
// orchestrates (src/lib/utilityResearch.js):
//
//   discover  { state }                -> providers, programs, rate_schedules, forms
//   measures  { state, programs: [p] } -> incentives + prescriptive_measures for ONE program
//   pdfs      { programs }             -> PDF links found on the program pages (no AI)
//
// Each phase streams a heartbeat while Claude works and returns the JSON
// document in the body. Only a platform developer (the Data Console gate) may
// call it — the caller is read from the JWT, never from the body.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { streamedJson } from "../_shared/streamedJson.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6';
const DEVELOPER_LEVEL = 5;

type Row = Record<string, unknown>;
type Results = {
  providers: Row[]; programs: Row[]; incentives: Row[];
  prescriptive_measures: Row[]; rate_schedules: Row[]; forms: Row[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callClaude(
  system: string,
  userMessage: string,
  opts: { webSearch?: number; maxTokens?: number; retries?: number; req?: Request; companyId?: number | null } = {}
) {
  const { webSearch = 0, maxTokens = 16000, retries = 1, req, companyId = null } = opts;
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  };
  if (webSearch > 0) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: webSearch }];
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ai = await callAnthropic({ feature: 'ai-utility-research', companyId, req }, body);

    if (!ai.ok) {
      if (ai.errorKind === 'rate_limit' && attempt < retries) {
        console.log(`Rate limited, waiting 61s before retry...`);
        await wait(61000);
        continue;
      }
      // Carry the unavailable flag to the handler's catch so the client can
      // tell our billing/key problems apart from ordinary failures.
      const err = new Error(ai.friendly || 'Anthropic API error') as Error & { ai_unavailable?: boolean };
      err.ai_unavailable = ai.unavailable === true;
      throw err;
    }

    const data = ai.data;
    return (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n');
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

function emptyResults(): Results {
  return { providers: [], programs: [], incentives: [], prescriptive_measures: [], rate_schedules: [], forms: [] };
}

// Coerce whatever Claude returned into the six arrays the UI expects.
function normalize(raw: Record<string, unknown> | null): Results {
  const out = emptyResults();
  if (!raw) return out;
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as Row[]) : []);
  out.providers = arr('providers');
  out.programs = arr('programs');
  // Backward compat: an older prompt called the rate card "rates"
  out.incentives = arr('incentives').length ? arr('incentives') : arr('rates');
  out.prescriptive_measures = arr('prescriptive_measures');
  out.rate_schedules = arr('rate_schedules');
  out.forms = arr('forms');
  for (const inc of out.incentives) {
    if (inc.rate_value == null && inc.rate != null) inc.rate_value = inc.rate;
    if (inc.rate == null && inc.rate_value != null) inc.rate = inc.rate_value;
  }
  for (const pm of out.prescriptive_measures) {
    if (pm.needs_pdf_upload === undefined || pm.needs_pdf_upload === null) pm.needs_pdf_upload = true;
  }
  return out;
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const DISCOVER_SYSTEM = `You are a utility rebate and electric rate research assistant. Research the electric utilities in a given US state that offer commercial energy efficiency programs, and their published commercial rate schedules and application forms.

Use web search to find current program pages, tariff schedules, and application forms. Search for:
- "[state] electric utility commercial rebates 2025"
- "[major utility] business incentive program"
- "[utility] commercial rate schedule tariff"

EXAMPLE (one record per array — show ALL fields like this):
{"providers":[{"provider_name":"Rocky Mountain Power","state":"UT","service_territory":"Most of Utah","has_rebate_program":true,"rebate_program_url":"https://www.rockymountainpower.net/savings-energy-choices/business.html","contact_phone":"1-888-221-7070","notes":"Largest IOU"}],
"programs":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","program_type":"Prescriptive","program_category":"Comprehensive","delivery_mechanism":"Prescriptive","business_size":"All","dlc_required":true,"pre_approval_required":false,"application_required":true,"post_inspection_required":false,"contractor_prequalification":false,"program_url":"https://example.com/program","max_cap_percent":70,"annual_cap_dollars":500000,"source_year":2025,"eligible_sectors":["Commercial","Industrial"],"eligible_building_types":["Office","Warehouse","Retail"],"required_documents":["W9","Invoice","DLC certificate"],"stacking_allowed":false,"stacking_rules":"No prescriptive+custom","funding_status":"Open","processing_time_days":60,"rebate_payment_method":"Check","program_notes_ai":"Lighting rates vary by controls tier."}],
"rate_schedules":[{"provider_name":"Rocky Mountain Power","schedule_name":"Schedule 6 - General Service","customer_category":"Medium Commercial","rate_type":"Demand","rate_per_kwh":0.0845,"peak_rate_per_kwh":null,"off_peak_rate_per_kwh":null,"summer_rate_per_kwh":null,"winter_rate_per_kwh":null,"demand_charge":9.50,"min_demand_charge":null,"customer_charge":35,"time_of_use":false,"effective_date":null,"source_url":"https://example.com/tariff.pdf","description":"200-1000 kW","notes":"With demand charge"}],
"forms":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","form_name":"Business Incentive Application","form_type":"Application","form_url":"https://example.com/app.pdf","version_year":2025,"is_required":true,"form_notes":"Main application"}]}

TYPE RULES: source_year and version_year must be integers (2025 not "2025"). eligible_sectors, eligible_building_types, required_documents must be arrays or null — never plain strings.

RULES:
1. Find 3-8 providers. Include every investor-owned utility, the largest municipal utilities and co-ops with a commercial rebate program.
2. Every program's program_name includes the year: "Name (2025)". Each provider may have several programs (prescriptive, custom, express/small business, new construction). Include program_url whenever it is findable.
3. Rate schedules: find the published commercial rate schedules for each major utility — small commercial, medium/demand, large/TOU, and special schedules (agricultural, irrigation, lighting, industrial). Aim for 5-8 for the primary utility. rate_per_kwh in dollars (0.0845 = 8.45 cents/kWh). Always include demand_charge (number or null), customer_charge, source_url, description, customer_category, rate_type.
4. Forms: include provider_name, program_name, form_url, version_year, is_required for each.
5. providers: always include rebate_program_url and contact_phone (search "[name] contact us"); null only when truly unfindable.
6. programs: always include pre_approval_required, stacking_allowed, annual_cap_dollars (number or null), eligible_sectors, required_documents, funding_status, processing_time_days, rebate_payment_method.
7. Do NOT include incentives or prescriptive_measures here — they are researched separately per program.
8. For unknown fields, set null. Never omit fields.

Return ONLY valid JSON, no other text.`;

const MEASURES_SYSTEM = `You are a utility rebate research assistant. You are given ONE commercial energy efficiency program of ONE electric utility. Research its incentive rate card and its prescriptive measure line items.

Use web search to find the program's incentive tables, measure worksheets and rate sheets. Search for:
- "[utility] [program] prescriptive incentives"
- "[utility] [program] lighting incentive worksheet"
- "[utility] [program] HVAC incentives"

EXAMPLE (one record per array — show ALL fields like this):
{"incentives":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","measure_category":"Lighting","measure_subcategory":"LED Interior","fixture_category":"Linear","measure_type":"LED Retrofit","calc_method":"Per Watt Reduced","rate":0.60,"rate_value":0.60,"rate_unit":"/watt","tier":"No Controls","cap_percent":70,"equipment_requirements":"DLC 5.1+","baseline_description":"Fluorescent T8/T12","replacement_description":"DLC LED","notes":"Base rate"}],
"prescriptive_measures":[{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","measure_code":"LT-001","measure_name":"Interior Linear T8 to LED No Controls","measure_category":"Lighting","measure_subcategory":"Linear","baseline_equipment":"T8 4ft 32W 2-lamp","baseline_wattage":64,"replacement_equipment":"DLC LED 36W","replacement_wattage":36,"incentive_amount":0.60,"incentive_unit":"per_watt_reduced","incentive_formula":"(64-36) x $0.60 = $16.80","max_incentive":null,"location_type":"interior","application_type":"retrofit","dlc_required":true,"dlc_tier":"Standard","energy_star_required":false,"hours_requirement":null,"source_page":null,"needs_pdf_upload":true,"notes":"Base rate"},{"provider_name":"Rocky Mountain Power","program_name":"wattsmart Business Incentives (2025)","measure_code":"HV-001","measure_name":"VFD for HVAC Fan/Pump","measure_category":"HVAC","measure_subcategory":"VFD","baseline_equipment":"Constant speed motor","baseline_wattage":7460,"replacement_equipment":"VFD-controlled motor","replacement_wattage":null,"incentive_amount":200,"incentive_unit":"per_hp","incentive_formula":"$200/HP","max_incentive":5000,"location_type":null,"application_type":"retrofit","dlc_required":false,"dlc_tier":null,"energy_star_required":false,"hours_requirement":null,"source_page":null,"needs_pdf_upload":true,"notes":"HVAC only"}]}

RULES:
1. TWO ARRAYS — "incentives" (rate card summary, one row per measure_category + tier) AND "prescriptive_measures" (specific line items with wattages). Populate BOTH. Use the exact provider_name and program_name you were given on every record.
2. Lighting: show No Controls, Networked Controls, LLLC tiers where offered. Show Linear, High Bay, Exterior.
3. HVAC: VFD ($/HP), Heat Pump ($/ton), RTU ($/ton), Chillers. Also Refrigeration, Motors, Building Envelope if offered.
4. measure_code prefix: LT-, HV-, MT-, RF-, BE-. needs_pdf_upload: always true.
5. incentive_formula shows the math like "(64W-36W) x $0.60 = $16.80". rate and rate_value must BOTH be populated with the same number.
6. Every incentive has measure_category, fixture_category ("Other" for non-lighting), calc_method, rate_unit, tier ("Standard" if only one), equipment_requirements, baseline_description, replacement_description.
7. Every prescriptive measure has baseline_wattage (estimate from equipment if exact unknown), replacement_wattage, dlc_required (true for lighting, false otherwise), location_type (interior/exterior/null for non-lighting), incentive_formula, measure_subcategory.
8. Aim for 4-8 incentives and 10-16 prescriptive measures. Prefer accuracy over volume; do not invent measures the program does not offer.
9. For unknown fields, set null. Never omit fields.

Return ONLY valid JSON, no other text.`;

// ── PDF Discovery (lightweight — actual processing deferred to UI) ────────────

async function discoverPdfUrls(programs: Row[], timeLimit: number) {
  const programsWithUrls = programs
    .filter(p => p.program_url && String(p.program_url).startsWith('http'))
    .slice(0, 5);

  const pdfStartTime = Date.now();
  const discoveredPdfs: { url: string; program_name: string; provider_name: string; type: string }[] = [];

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
        discoveredPdfs.push({ url: String(prog.program_url), program_name: String(prog.program_name), provider_name: String(prog.provider_name), type: 'rebate_program' });
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
          // Classify the PDF type based on URL keywords
          const isForm = ['application','form','worksheet'].some(t => lower.includes(t)) && !['rebate','incentive','measure','prescriptive'].some(t => lower.includes(t));
          const isRate = ['schedule','tariff','rate'].some(t => lower.includes(t)) && !['rebate','incentive'].some(t => lower.includes(t));
          const pdfType = isForm ? 'form' : isRate ? 'rate_schedule' : 'rebate_program';
          discoveredPdfs.push({ url: pdfUrl, program_name: String(prog.program_name), provider_name: String(prog.provider_name), type: pdfType });
        }
      }
    } catch { continue; }
  }

  console.log(`PDF discovery: found ${discoveredPdfs.length} PDFs`);
  return discoveredPdfs;
}

// ── Phases ───────────────────────────────────────────────────────────────────

async function discoverPhase(state: string, req: Request, companyId: number | null) {
  const started = Date.now();
  console.log(`[discover] ${state}`);
  const text = await callClaude(DISCOVER_SYSTEM,
    `Research the electric utility providers in ${state} that offer commercial energy efficiency rebate programs.

For each provider find:
- Provider details — name, service territory, rebate program URL, contact phone. SEARCH for each provider's website and contact page.
- Every incentive/rebate program with year, URL and qualification details (pre_approval_required, stacking_allowed, annual_cap_dollars, eligible_sectors, required_documents, funding_status, processing_time_days, rebate_payment_method, program_notes_ai).
- The published commercial rate schedules (small commercial, medium/demand, large/TOU, agricultural/irrigation, lighting, industrial) with demand_charge, customer_charge, source_url, description, customer_category, rate_type.
- Application forms with provider_name, program_name, form_url, version_year, is_required.

Do not list incentive rates or prescriptive measures — those are researched per program in a later step.

Your reply must begin with { and be nothing but the JSON document: no preamble, no narration of your searches, no code fences. (Washington's reply once opened with two paragraphs of prose, ran out of room, and the JSON was cut off.)`,
    { webSearch: 6, maxTokens: 24000, req, companyId }
  );
  const results = normalize(extractJson(text));
  console.log(`[discover] ${state}: ${results.providers.length} providers, ${results.programs.length} programs, ${results.rate_schedules.length} schedules, ${results.forms.length} forms in ${Date.now() - started}ms`);
  if (results.providers.length === 0) {
    return { success: false, error: 'Failed to parse results', raw: text.substring(0, 2000) };
  }
  return { success: true, phase: 'discover', results, timing: { total_ms: Date.now() - started } };
}

async function measuresPhase(state: string, program: Row, req: Request, companyId: number | null) {
  const started = Date.now();
  const providerName = String(program.provider_name || '');
  const programName = String(program.program_name || '');
  console.log(`[measures] ${providerName} / ${programName}`);
  const text = await callClaude(MEASURES_SYSTEM,
    `State: ${state}
Utility (provider_name): ${providerName}
Program (program_name): ${programName}
Program URL: ${program.program_url || 'unknown — search for it'}
Program type: ${program.program_type || 'unknown'}

Research this program's incentive rate card and prescriptive measure line items. Use provider_name "${providerName}" and program_name "${programName}" on every record.

Return the structured JSON.`,
    { webSearch: 4, maxTokens: 12000, req, companyId }
  );
  const results = normalize(extractJson(text));
  // Stamp the names we were given, so the import links rows to the right program
  for (const r of [...results.incentives, ...results.prescriptive_measures]) {
    r.provider_name = providerName;
    r.program_name = programName;
  }
  console.log(`[measures] ${programName}: ${results.incentives.length} incentives, ${results.prescriptive_measures.length} measures in ${Date.now() - started}ms`);
  return {
    success: true,
    phase: 'measures',
    results: { incentives: results.incentives, prescriptive_measures: results.prescriptive_measures },
    timing: { total_ms: Date.now() - started },
  };
}

// ── Main Handler ─────────────────────────────────────────────────────────────

function jwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ success: false, error: 'Invalid JSON body' }, 400); }

  // Who may run this: a platform developer signed into the Data Console, or
  // the platform's own service key (scripts/seed-utility-research.mjs and
  // friends). Developer is a platform-only role since 20260924180000, so a
  // script cannot mint a throwaway developer login to call this — the
  // service key IS the platform's identity for automation.
  // The gateway has already verified the bearer's signature (verify_jwt);
  // a service-role JWT carries role = "service_role". The runtime's own copy
  // of the key is not compared byte-for-byte because the injected value and
  // the one in .env can be different formats of the same credential.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const isServiceCall = bearer.length > 0 && (bearer === serviceKey || jwtRole(bearer) === 'service_role');
  let callerCompanyId: number | null = null;
  if (!isServiceCall) {
    const caller = await resolveCaller(req, Deno.env.get('SUPABASE_URL'), serviceKey);
    if (!caller) return json({ success: false, error: 'Sign in to run research' }, 401);
    if (caller.level < DEVELOPER_LEVEL) return json({ success: false, error: 'Utility research is a platform developer tool' }, 403);
    callerCompanyId = callerCompanyId;
  }

  const phase = String(body.phase || 'discover');
  const state = typeof body.state === 'string' ? body.state.trim() : '';
  const programs = Array.isArray(body.programs) ? (body.programs as Row[]) : [];

  if (phase === 'discover') {
    if (!state) return json({ success: false, error: 'State is required' }, 400);
    return streamedJson(corsHeaders, () => discoverPhase(state, req, callerCompanyId));
  }
  if (phase === 'measures') {
    if (!state) return json({ success: false, error: 'State is required' }, 400);
    if (programs.length !== 1 || !programs[0]?.program_name) {
      return json({ success: false, error: 'measures phase takes exactly one program' }, 400);
    }
    return streamedJson(corsHeaders, () => measuresPhase(state, programs[0], req, callerCompanyId));
  }
  if (phase === 'pdfs') {
    if (programs.length === 0) return json({ success: true, phase: 'pdfs', discovered_pdfs: [] });
    return streamedJson(corsHeaders, async () => {
      const started = Date.now();
      const discovered_pdfs = await discoverPdfUrls(programs, 30000);
      return { success: true, phase: 'pdfs', discovered_pdfs, timing: { total_ms: Date.now() - started } };
    });
  }
  return json({ success: false, error: `Unknown phase "${phase}"` }, 400);
});
