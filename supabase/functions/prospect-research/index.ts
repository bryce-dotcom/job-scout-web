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
import { callAnthropic } from "../_shared/anthropic.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const CLAUDE_MODEL   = 'claude-sonnet-4-5-20250929';

// Tier quotas — monthly per-company. Stays in lockstep with the
// pricing copy in Settings/Subscription and the drawer's quota UI.
// Two real tiers + one comp tier (field_boss is bundled-in for the
// top JobScout subscription plan, no extra charge).
const TIER_QUOTAS: Record<string, { searches: number; enrichments: number }> = {
  free:       { searches: 3,    enrichments: 10 },
  pro:        { searches: 50,   enrichments: 200 },
  field_boss: { searches: 9999, enrichments: 9999 },  // effectively unlimited
};

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Load tier + current period usage once. Reused by quota checks
    // in both search + enrich actions. Returns null for usage row if
    // the company has zero usage this month (treat as zero).
    const period = currentPeriod();
    const { data: tierRow } = await supabase
      .from('companies')
      .select('prospecting_tier, subscription_tier')
      .eq('id', company_id)
      .single();
    // Field Boss subscribers get prospecting bundled in for free, even
    // if the prospecting_tier flag wasn't backfilled to 'field_boss'.
    // Belt + suspenders behind the migration's UPDATE.
    let tier: keyof typeof TIER_QUOTAS = (tierRow?.prospecting_tier as keyof typeof TIER_QUOTAS) || 'free';
    if (tierRow?.subscription_tier === 'field_boss') tier = 'field_boss';
    const quota = TIER_QUOTAS[tier] || TIER_QUOTAS.free;
    const { data: usageRow } = await supabase
      .from('prospecting_usage')
      .select('searches, enrichments')
      .eq('company_id', company_id)
      .eq('period', period)
      .maybeSingle();
    const usage = { searches: usageRow?.searches || 0, enrichments: usageRow?.enrichments || 0 };

    // Helper to format a structured 402-style block response
    const blockedResponse = (kind: 'search' | 'enrich') => {
      const limit = kind === 'search' ? quota.searches : quota.enrichments;
      const used  = kind === 'search' ? usage.searches : usage.enrichments;
      return json({
        error: 'limit_reached',
        message: `You've used ${used}/${limit} ${kind === 'search' ? 'searches' : 'enrichments'} this month on the ${tier} plan. Upgrade in Settings → Subscription to keep going.`,
        kind,
        used,
        limit,
        tier,
        period,
        upgrade_required: true,
      }, 402);
    };

    // ── ACTION: usage_status (cheap read for UI) ────────────────────
    if (action === 'usage_status') {
      return json({
        ok: true,
        tier,
        period,
        quota,
        usage,
        remaining: {
          searches:    Math.max(0, quota.searches - usage.searches),
          enrichments: Math.max(0, quota.enrichments - usage.enrichments),
        },
      });
    }

    // ── ACTION: search ─────────────────────────────────────────────
    if (action === 'search') {
      if (usage.searches >= quota.searches) return blockedResponse('search');
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
        companyId: company_id ?? null,
        system,
        userMsg,
        maxRounds: 4,
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

      // Successful search — bump usage atomically
      await supabase.rpc('bump_prospecting_usage', {
        p_company_id: company_id,
        p_period: period,
        p_searches: 1,
        p_enrichments: 0,
      });

      return json({
        ok: true,
        query,
        prospects: out,
        count: out.length,
        usage: { ...usage, searches: usage.searches + 1 },
        quota,
        tier,
      });
    }

    // ── ACTION: enrich ─────────────────────────────────────────────
    if (action === 'enrich') {
      if (usage.enrichments >= quota.enrichments) return blockedResponse('enrich');
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
      const system = `You are an expert B2B sales researcher. Find detailed contact info for the following business so a sales rep can call, text, and email the decision-maker.

CRITICAL OUTPUT FORMAT: After you research, return a SINGLE JSON object — no markdown, no code fences, no preamble:
{
  "decision_maker_name": "",
  "decision_maker_title": "",
  "email": "",
  "email_confidence": "verified" | "pattern" | "guessed" | "",
  "personal_email": "",
  "linkedin_url": "",
  "business_phone": "",
  "mobile_phone": "",
  "mobile_phone_confidence": "verified" | "likely" | "guessed" | "not_found",
  "mobile_phone_source": "",
  "address": "",
  "notes": "Extra context — recent expansion, hiring signals, news",
  "source_urls": []
}

DIG HARD FOR MOBILE / CELL NUMBERS. The sales rep needs to text them. Try ALL of these in order:
  1. The person's LinkedIn profile (sometimes lists phone)
  2. Personal websites, portfolios, or blogs they own
  3. Real-estate agent / insurance agent / broker profiles (these almost always show cell)
  4. State business registry filings (e.g. Utah Division of Corporations) — owner phone is often filed
  5. Court records, FCC license filings, professional license boards (chiropractic board, contractor board, etc.)
  6. Press releases that quote them with contact info
  7. Conference speaker pages or alumni directories
  8. Old job postings they authored
  9. Owner-listed properties on Zillow / Redfin / commercial real estate sites
  10. Domain WHOIS records if the domain is registered to them personally

How to tell business phone from mobile/cell:
  - Mobile = personal phone, can text, typically not on the company's "Contact Us" page
  - Business phone = main office line listed publicly on the website
  - If you only find ONE number and it's on the company contact page, that's business_phone, NOT mobile_phone

If you genuinely can't find a mobile, set mobile_phone_confidence to "not_found" and leave mobile_phone empty. NEVER guess a 10-digit number — only return real numbers you found in search results.

Rules for other fields:
  - "email_confidence": "verified" if directly published on the company website / LinkedIn / press release; "pattern" if you applied a common company pattern (firstname@company.com); "guessed" if speculative
  - "personal_email": their non-work email if found (gmail / yahoo / etc. — these often answer cold outreach better than corp emails)
  - Decision-maker = person who buys services for this kind of business (owner / facilities mgr / GM / operations / etc.)
  - If you can't find a decision-maker, leave those fields empty rather than guessing names`;

      const userMsg = `Business to research:
Name: ${c.company_name || cached.company_name || '(unknown)'}
City/State: ${c.city || ''}, ${c.state || ''}
Industry: ${c.industry || 'unknown'}
Website: ${c.website || ''}
Notes so far: ${c.why_it_matches || ''}

Find a decision-maker, their email + LinkedIn + phone, and the business's full address.`;

      const claudeResponse = await runClaudeAgent({
        companyId: company_id ?? null,
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
      // Phone preference order for the cache's `phone` column:
      //   mobile_phone (rep can text) > business_phone (cold-call line) > existing
      const bestPhone = enriched.mobile_phone || enriched.business_phone || enriched.phone || cached.phone;
      const { error: upErr } = await supabase
        .from('prospect_enrichments')
        .update({
          payload: mergedPayload,
          full_name: enriched.decision_maker_name || cached.full_name,
          title: enriched.decision_maker_title || cached.title,
          email: enriched.email || cached.email,
          phone: bestPhone,
          linkedin_url: enriched.linkedin_url || cached.linkedin_url,
          revealed_at: new Date().toISOString(),
        })
        .eq('id', cached.id);
      if (upErr) return json({ error: upErr.message }, 500);

      // Bump usage atomically — only after a successful Claude response
      // landed in the cache. Failures don't count toward the quota.
      await supabase.rpc('bump_prospecting_usage', {
        p_company_id: company_id,
        p_period: period,
        p_searches: 0,
        p_enrichments: 1,
      });

      return json({
        ok: true,
        candidate_id,
        enrichment: enriched,
        usage: { ...usage, enrichments: usage.enrichments + 1 },
        quota,
        tier,
      });
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
        // Best phone for the lead's primary field: prefer mobile (textable),
        // fall back to business line, then whatever we had cached.
        const bestPhone = enr.mobile_phone || enr.business_phone || c.phone || p.phone || null;
        const bestEmail = c.email || enr.email || enr.personal_email || null;
        return {
          company_id,
          customer_name: c.full_name || enr.decision_maker_name || c.company_name || 'AI Prospect',
          email: bestEmail,
          phone: bestPhone,
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
            // Surface BOTH numbers + email types in the notes so the rep
            // can pick the right one for the right channel.
            enr.mobile_phone ? `Mobile (textable): ${enr.mobile_phone}${enr.mobile_phone_confidence ? ` [${enr.mobile_phone_confidence}]` : ''}${enr.mobile_phone_source ? ` — ${enr.mobile_phone_source}` : ''}` : null,
            enr.business_phone && enr.business_phone !== enr.mobile_phone ? `Business: ${enr.business_phone}` : null,
            enr.personal_email && enr.personal_email !== enr.email ? `Personal email: ${enr.personal_email}` : null,
            c.linkedin_url || enr.linkedin_url ? `LinkedIn: ${c.linkedin_url || enr.linkedin_url}` : null,
            ([...(p.source_urls || []), ...(enr.source_urls || [])]).slice(0, 4).map((u: string) => `Source: ${u}`).join('\n'),
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
  companyId: number | null; system: string; userMsg: string; maxRounds: number;
}): Promise<string> {
  const { companyId, system, userMsg, maxRounds } = args;
  let messages: any[] = [{ role: 'user', content: userMsg }];
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 6 },
  ];
  // Wall-clock budget. Each web-search round is slow (10-40s), and an
  // unbounded loop blew past the platform gateway's ~150s ceiling, so the
  // request 504'd and Tracy got nothing. Return partial results before the
  // gateway kills us rather than timing out empty-handed.
  const startedAt = Date.now();
  const MAX_AGENT_MS = 75000;
  let lastText = '';
  for (let round = 0; round < maxRounds; round++) {
    // Never START another slow round once we're out of budget — bail with
    // whatever text we've gathered so far.
    if (round > 0 && Date.now() - startedAt > MAX_AGENT_MS) break;
    const ai = await callAnthropic(
      { feature: 'prospect-research', companyId },
      {
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system,
        tools,
        messages,
      },
    );
    if (!ai.ok) {
      throw new Error(ai.friendly);
    }
    const data = ai.data;
    const blocks = data.content || [];
    const text = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    if (text) lastText = text;

    // Claude's server-side web_search tool returns results as part of
    // its own response — there's no client-side tool-use loop needed.
    // We just collect the text blocks. If stop_reason is 'tool_use'
    // we may need to continue the loop for follow-up calls.
    if (data.stop_reason === 'end_turn' || data.stop_reason === 'stop_sequence') {
      return text || lastText;
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
    return text || lastText;
  }
  // Out of rounds or out of time — return best-effort text from the last turn
  return lastText;
}
