// Find a tenant's Google Place ID via the Places Text Search API,
// using their saved business name + address as the query. Lets reps
// skip the "use Google's Place ID Finder, click a marker, paste here"
// dance — they can click one button and pick from the matches.
//
// Requires the GOOGLE_PLACES_API_KEY Supabase secret. The key needs
// the Places API (New) enabled on the same Google Cloud project.
//
// Body: { query: string }
// Returns: { ok: true, candidates: [{ place_id, name, formatted_address, types }] }
//          or { ok: false, error: string } with HTTP 200 so the
//          frontend can render the reason instead of swallowing it.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function res(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
    if (!apiKey) {
      return res({
        ok: false,
        error: "GOOGLE_PLACES_API_KEY isn't configured yet. Add it as a Supabase function secret (Settings → Edge Functions → Secrets), then try again.",
      });
    }

    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return res({ ok: false, error: "query is required" });
    }

    // Places API (New) — Text Search.
    // FieldMask scopes which fields come back; keep it minimal to stay
    // in the cheaper SKU tier.
    const apiRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types,places.businessStatus",
      },
      body: JSON.stringify({ textQuery: query.trim(), maxResultCount: 8 }),
    });
    const body = await apiRes.json();
    if (!apiRes.ok) {
      const msg = body?.error?.message || `Google ${apiRes.status}`;
      return res({ ok: false, error: `Google Places: ${msg}` });
    }

    const candidates = (body.places || []).map((p: any) => ({
      place_id: p.id,
      name: p.displayName?.text || "(unnamed)",
      formatted_address: p.formattedAddress || null,
      types: p.types || [],
      business_status: p.businessStatus || null,
    }));

    return res({ ok: true, candidates });
  } catch (err) {
    return res({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
