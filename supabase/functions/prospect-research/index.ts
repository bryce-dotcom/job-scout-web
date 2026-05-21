// prospect-research
// =====================================================================
// In-house AI prospect researcher powered by Claude + the web_search tool.
// Setters type a natural-language query and Claude does the live web
// research, returning a structured list of candidates with company info,
// decision-maker hints, and cited source URLs.
//
// Path-3 foreground (the AI agent). Background public-data pipelines
// (Google Places sync, state biz registries, etc.) ship later. This
// works on day one because Claude does the searching live — no data
// build-out required.
//
// Actions:
//   search   — NL query → 5-15 candidate prospects with cited sources
//   enrich   — one candidate → email + phone + LinkedIn + decision-maker
//   import   — candidate IDs → create lead rows + stamp prospect_enrichments
//
// Caching: each candidate is keyed by a deterministic hash of (company
// name + city + state) so re-searches dedupe + re-enriches are free.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL   = 'claude-sonnet-4-5-20250929';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Auth
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Authorization required' }, 401);
    const { data: { user: callerUser }, error: userErr } = await supabase.auth.getUser(auth);
    if (userErr || !callerUser) return json({ error: 'Invalid auth token' }, 401);

    const body = await req.json().catch(() => ({}));
    const { action, company_id } = body;
    if (!action || !company_id) return json({ error: 'action + company_id required' }, 400);

    const { data: callerEmp } = await supabase
      .from('employees')
      .select('id, company_id')
      .eq('company_id', company_id)
      .ilike('email', callerUser.email!)
      .maybeSingle();
    if (!callerEmp) return json({ error: 'Not a member of that company' }, 403);

    // ── ACTION: search ─────────────────────────────────────────────
    if (action === 'search') {
      const { query, limit = 10 } = body;
      if (!query?.trim()) return json({ error: 'query required' }, 400);

      const { data: company } = await supabase
        .from('companies')
        .select('company_name, address, state_employer_id_state')
        .eq('id', company_id)
        .single();

      const system = `You are an expert B2B sales researcher. The user is a sales rep at ${company?.company_name || 'a service business'} (based in ${company?.address || 'Utah'}). They will give you a description of the kind of business they want to prospect. Use web search to find up to ${limit} real businesses that match.

CRITICAL OUTPUT FORMAT: After you finish researching, return your final answer as a SINGLE JSON array — no markdown, no code fences, no preamble. Each element looks like:
{
  "company_name": "Acme Manufacturing",
  "city": "Salt Lake City",
  "state": "UT",
  "industry": "manufacturing",
  "estimated_size": "mid / 51-500",
  "why_it_matches": "Single sentence why this fits the query",
  "website": "https://acme.com",
  "phone": "(801) 555-1212",
  "primary_contact_name": "",
  "primary_contact_title": "",
  "source_urls": ["https://acme.com/about", "https://linkedin.com/company/acme"],
  "confidence": "high"
}

Rules:
- Skip duplicates and obviously closed businesses
- Leave a field as "" if not found; do NOT guess names
- "confidence" is "high" | "medium" | "low" based on how clearly search confirmed the business
- Return [] if the query is too vague to research`;

      const userMsg = `Find businesses matching: ${query}`;

      const claudeResponse = await runClaudeAgent({
        apiKey: ANTHROPIC_API_KEY,
        system,
        userMsg,
        maxRounds: 6,
      });

      let prospects: any[] = [];
      try {
        const cleaned = claudeResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const match = cleaned.match(/\[[\s\S]*\]/);
        const toParse = match ? match[0] : cleaned;
        prospects = JSON.parse(toParse);
        if (!Array.isArray(prospects)) prospects = [];
      } catch (e) {
        console.error('[prospect-research] JSON parse failed:', e, 'raw:', claudeResponse.slice(0, 500));
        return json({ error: 'AI returned non-JSON response', raw: claudeResponse.slice(0, 500) }, 502);
      }

      // Cache each candidate
      const out: any[] = [];
      for (const p of prospects) {
        const idSeed = `${(p.company_name || '').toLowerCase()}|${(p.city || '').toLowerCase()}|${(p.state || '').toLowerCase()}`;
        let h = 0;
        for (let i = 0; i < idSeed.length; i++) { h = ((h << 5) - h) + idSeed.charCodeAt(i); h |= 0; }
        const externalId = `ai-${Math.abs(h).toString(36)}`;
        const persist = {
          company_id,
          external_prospect_id: externalId,
          source: 'ai_agent',
          payload: p,
          full_name: p.primary_contact_name || null,
          title: p.primary_contact_title || null,
          email: null,
          phone: p.phone || null,
          company_name: p.company_name || null,
          linkedin_url: null,
        };
        await supabase
          .from('prospect_enrichments')
          .upsert(persist, { onConflict: 'company_id,external_prospect_id' });
        out.push({ ...p, candidate_id: externalId });
      }

      return json({ ok: true, query, prospects: out, count: out.length });
    }

    // ── ACTION: enrich ─────────────────────────────────────────────
    if (action === 'enrich') {
      const { candidate_id } = body;
      if (!candidate_id) return json({ error: 'candidate_id required' }, 400);

      const { data: cached } = await supabase
        .from('prospect_enrichments')
        .select('*')
        .eq('company_id', company_id)
        .eq('external_prospect_id', candidate_id)
        .maybeSingle();
      if (!cached) return json({ error: 'candidate not found in cache' }, 404);

      const c = cached.payload || {};
      const system = `You are an expert B2B sales researcher. Find detailed contact info for the following business so a sales rep can reach out.

CRITICAL OUTPUT FORMAT: After you research, return a SINGLE JSON object — no markdown, no code fences, no preamble:
{
  "decision_maker_name": "",
  "decision_maker_title": "",
  "email": "",
  "email_confidence": "verified" | "pattern" | "guessed" | "",
  "linkedin_url": "",
  "phone": "",
  "address": "",
  "notes": "Extra context — recent expansion, hiring signals, news",
  "source_urls": []
}

Rules:
- If you can't find a decision-maker, leave those fields empty rather than guessing
- "email_confidence": "verified" if directly published on the company website / LinkedIn / press release; "pattern" if you applied a common company pattern (firstname@company.com); "guessed" if speculative
- Decision-maker is the person who buys services for this kind of business (owner / facilities mgr / GM / operations / etc.)`;

      const userMsg = `Business to research:
Name: ${c.company_name || cached.company_name || '(unknown)'}
City/State: ${c.city || ''}, ${c.state || ''}
Industry: ${c.industry || 'unknown'}
Website: ${c.website || ''}
Notes so far: ${c.why_it_matches || ''}

Find a decision-maker, their email + LinkedIn + phone, and the business's full address.`;

      const claudeResponse = await runClaudeAgent({
        apiKey: ANTHROPIC_API_KEY,
        system,
        userMsg,
        maxRounds: 5,
      });

      let enriched: any = {};
      try {
        const cleaned = claudeResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        enriched = JSON.parse(match ? match[0] : cleaned);
      } catch (e) {
        return json({ error: 'AI returned non-JSON response', raw: claudeResponse.slice(0, 500) }, 502);
      }

      const mergedPayload = { ...c, enrichment: enriched };
      const { error: upErr } = await supabase
        .from('prospect_enrichments')
        .update({
          payload: mergedPayload,
          full_name: enriched.decision_maker_name || cached.full_name,
          title: enriched.decision_maker_title || cached.title,
          email: enriched.email || cached.email,
          phone: enriched.phone || cached.phone,
          linkedin_url: enriched.linkedin_url || cached.linkedin_url,
          revealed_at: new Date().toISOString(),
        })
        .eq('id', cached.id);
      if (upErr) return json({ error: upErr.message }, 500);

      return json({ ok: true, candidate_id, enrichment: enriched });
    }

    // ── ACTION: import ─────────────────────────────────────────────
    if (action === 'import') {
      const { candidate_ids, salesperson_id, default_status = 'New', lead_source = 'AI Prospect Research' } = body;
      if (!Array.isArray(candidate_ids) || candidate_ids.length === 0) {
        return json({ error: 'candidate_ids array required' }, 400);
      }

      const { data: cached } = await supabase
        .from('prospect_enrichments')
        .select('*')
        .eq('company_id', company_id)
        .in('external_prospect_id', candidate_ids);

      const toImport = (cached || []).filter(c => !c.imported_as_lead_id);
      if (!toImport.length) return json({ ok: true, imported: 0, already_imported: cached?.length || 0 });

      const leadRows = toImport.map(c => {
        const p = c.payload || {};
        const enr = p.enrichment || {};
        return {
          company_id,
          customer_name: c.full_name || enr.decision_maker_name || c.company_name || 'AI Prospect',
          email: c.email || enr.email || null,
          phone: c.phone || enr.phone || null,
          address: enr.address || (p.city ? `${p.city}, ${p.state || ''}`.trim() : null),
          business_name: c.company_name || p.company_name || null,
          status: default_status,
          lead_source,
          salesperson_id: salesperson_id || callerEmp.id,
          external_prospect_id: c.external_prospect_id,
          enrichment_data: c.payload,
          notes: [
            p.why_it_matches ? `Why this fits: ${p.why_it_matches}` : null,
            enr.notes ? `Notes: ${enr.notes}` : null,
            c.linkedin_url || enr.linkedin_url ? `LinkedIn: ${c.linkedin_url || enr.linkedin_url}` : null,
            ([...(p.source_urls || []), ...(enr.source_urls || [])]).slice(0, 3).map((u: string) => `Source: ${u}`).join('\n'),
          ].filter(Boolean).join('\n'),
        };
      });

      const { data: inserted, error: insErr } = await supabase
        .from('leads')
        .insert(leadRows)
        .select('id, external_prospect_id');
      if (insErr) return json({ error: 'Lead insert failed: ' + insErr.message }, 500);

      for (const lead of inserted || []) {
        await supabase
          .from('prospect_enrichments')
          .update({ imported_as_lead_id: lead.id, imported_at: new Date().toISOString() })
          .eq('company_id', company_id)
          .eq('external_prospect_id', lead.external_prospect_id);
      }

      return json({
        ok: true,
        imported: inserted?.length || 0,
        already_imported: (cached?.length || 0) - toImport.length,
      });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[prospect-research] crashed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

// ─── Claude agent loop with web_search tool ─────────────────────────
async function runClaudeAgent(args: {
  apiKey: string; system: string; userMsg: string; maxRounds: number;
}): Promise<string> {
  const { apiKey, system, userMsg, maxRounds } = args;
  let messages: any[] = [{ role: 'user', content: userMsg }];
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
  ];
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system,
        tools,
        messages,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 500)}`);
    }
    const data = await res.json();
    const blocks = data.content || [];

    // Claude's server-side web_search tool returns results as part of
    // its own response — there's no client-side tool-use loop needed.
    // We just collect the text blocks. If stop_reason is 'tool_use'
    // we may need to continue the loop for follow-up calls.
    if (data.stop_reason === 'end_turn' || data.stop_reason === 'stop_sequence') {
      const text = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      return text;
    }

    // For other stop reasons (max_tokens, tool_use), append and continue
    if (data.stop_reason === 'tool_use') {
      // Server-side tools (web_search) handle themselves — Claude will
      // produce text on the next turn. Add the response + a continuation prompt.
      messages.push({ role: 'assistant', content: blocks });
      messages.push({ role: 'user', content: 'Continue. Return ONLY the final JSON, no preamble.' });
      continue;
    }

    // max_tokens or other — just return what we have
    const text = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    return text;
  }
  // Out of rounds — return whatever we have from the last turn
  return '';
}
