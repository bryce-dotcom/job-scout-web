// Arnie picks the top 3 add-on services for a given estimate.
//
// Why this exists: the Suggested Add-Ons strip on the estimate page
// shows the full grouped catalog (22+ items for HHH). Reps scan it
// faster when they know which 3 actually apply to *this* project.
// Arnie reads the line items + project size + utility scope context
// and recommends the most relevant add-ons with a one-line reason
// each. Recommendations cached on the quote row, keyed by a hash of
// the line items so we only call the model when the estimate
// materially changes.
//
// Body: { estimate_id, company_id }
// Returns: { recommendations: [{ addon_id, reason }], cached: bool, hash }
//
// Uses Haiku — this is a ranking task, fast + cheap is right.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Build the cache hash from line items. Same logic as the client so
// they agree on freshness without an extra round-trip.
function hashLines(lines: Array<{ id: number; item_id: number | null; line_total: number }>) {
  const norm = lines
    .map((l) => `${l.item_id ?? "x"}:${Math.round(Number(l.line_total) || 0)}`)
    .sort()
    .join("|");
  // Cheap stable string hash (FNV-1a-ish). Avoids pulling crypto.
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${path}: ${res.status} ${await res.text()}`);
  // 204 No Content (return=minimal PATCHes) has empty body — don't try to parse.
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { estimate_id, company_id, force } = await req.json();
    if (!estimate_id || !company_id) {
      return jsonRes({ error: "estimate_id and company_id are required" });
    }

    // Pull estimate + lines + catalog in parallel.
    const [quoteRows, lineRows, catalogRows] = await Promise.all([
      sb(`quotes?id=eq.${estimate_id}&company_id=eq.${company_id}&select=id,quote_amount,calculated_quote_amount,job_total,arnie_addon_recommendations,arnie_addon_recs_hash`),
      sb(`quote_lines?quote_id=eq.${estimate_id}&select=id,item_id,item_name,line_total,quantity,price,description`),
      sb(`products_services?company_id=eq.${company_id}&suggest_in_lenard=eq.true&active=eq.true&select=id,name,description,unit_price,in_utility_scope`),
    ]);

    const quote = quoteRows[0];
    if (!quote) return jsonRes({ error: "Estimate not found" });

    const lines = lineRows || [];
    const catalog = catalogRows || [];
    if (!lines.length || !catalog.length) {
      return jsonRes({ recommendations: [], cached: false, reason: "no_lines_or_no_catalog" });
    }

    const hash = hashLines(lines);

    // Cache hit: same hash and we already have a recommendation set.
    if (!force && quote.arnie_addon_recs_hash === hash && Array.isArray(quote.arnie_addon_recommendations) && quote.arnie_addon_recommendations.length > 0) {
      return jsonRes({ recommendations: quote.arnie_addon_recommendations, cached: true, hash });
    }

    if (!ANTHROPIC_API_KEY) {
      return jsonRes({ error: "ANTHROPIC_API_KEY not configured", recommendations: [], cached: false });
    }

    // Compose a tight prompt. Haiku doesn't need much priming.
    const total = Number(quote.calculated_quote_amount || quote.quote_amount || quote.job_total || 0);
    const linesText = lines
      .map((l: any) => `- ${l.item_name || "Line " + l.id}${l.description ? " (" + l.description.slice(0, 100) + ")" : ""}: qty ${l.quantity} × $${l.price} = $${l.line_total}`)
      .join("\n");
    const catalogText = catalog
      .map((c: any) => `- id ${c.id}: "${c.name}" — $${c.unit_price}${c.description ? " — " + c.description.slice(0, 120) : ""}${c.in_utility_scope === false ? " [customer pays directly]" : ""}`)
      .join("\n");

    const userPrompt = `Project subtotal: $${total.toFixed(2)}
Line items on this estimate:
${linesText}

Available add-on services catalog:
${catalogText}

Pick the 3 add-ons most likely to apply to THIS specific project. Reason about the scope and size:
- Small / one-line jobs (< $1k): only add-ons that always make sense (e.g. travel for distant sites). Skip enterprise compliance items.
- Mid jobs ($1k–$10k): basic compliance + service add-ons that match the work type.
- Large jobs (>$10k) or utility-rebate work: documentation, M&V, ROI, project management, compliance packages.
- Don't recommend warranty for cleaning-type one-offs; do for installs.
- If the project doesn't fit a category cleanly, recommend fewer items rather than padding.

Respond with ONLY a JSON object, no prose:
{ "picks": [ { "addon_id": <id from catalog>, "reason": "one sentence why this fits this project" } ] }
Reasons should be project-specific (reference the scope or size), not generic.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.log("[arnie-suggest-addons] claude error:", err);
      return jsonRes({ error: "Arnie couldn't reach the model", recommendations: [], cached: false });
    }

    const claudeBody = await claudeRes.json();
    const rawText = claudeBody?.content?.[0]?.text || "";
    // Extract the first {...} block — Haiku usually returns just JSON but
    // belt-and-suspenders against any surrounding prose.
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("[arnie-suggest-addons] no JSON in response:", rawText.slice(0, 200));
      return jsonRes({ error: "Arnie's reply wasn't parseable", recommendations: [], cached: false });
    }

    let parsed: { picks?: Array<{ addon_id: number; reason: string }> } = {};
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log("[arnie-suggest-addons] parse error:", e);
      return jsonRes({ error: "Arnie's reply was malformed JSON", recommendations: [], cached: false });
    }

    const catalogIds = new Set(catalog.map((c: any) => Number(c.id)));
    const recs = (parsed.picks || [])
      .map((p) => ({ addon_id: Number(p.addon_id), reason: String(p.reason || "").slice(0, 200) }))
      .filter((p) => catalogIds.has(p.addon_id) && p.reason)
      .slice(0, 5);

    // Cache on the quote row. Service role bypasses RLS.
    await sb(`quotes?id=eq.${estimate_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        arnie_addon_recommendations: recs,
        arnie_addon_recs_hash: hash,
        arnie_addon_recs_at: new Date().toISOString(),
      }),
    });

    return jsonRes({ recommendations: recs, cached: false, hash });
  } catch (err) {
    console.log("[arnie-suggest-addons] unexpected:", err);
    return jsonRes({ error: (err as Error).message || "Unexpected error", recommendations: [], cached: false });
  }
});
