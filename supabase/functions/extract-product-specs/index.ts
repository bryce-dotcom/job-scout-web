// Pull the real specifications out of a manufacturer's spec-sheet PDF.
//
// Why this exists: datasheet_json is empty on all 715 products, so the only
// place a lumen count or an IP rating lives is inside the maker's PDF. We
// cannot hand that PDF to a customer — it reads "Phone: (844) LEDONE6 |
// www.ledonecorp.com" and hands them everything they need to re-bid the job
// elsewhere. So we extract the facts and render our own sheet.
//
// It deliberately does NOT scrub here. It records what it found, including
// brand_terms — every string that identifies the maker. Scrubbing happens at
// render time through _shared/specScrub.ts, so the internal view can still
// show the real datasheet while the customer-facing one cannot.
//
// ai-extract-pdf could not be reused: it is built for tables ("rows"/"headers")
// and rejects documents with no tabular data, which is every spec sheet.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `You read lighting product specification sheets and return structured data.

Respond with ONLY a valid JSON object, no markdown fences and no preamble:
{
  "specs": [{"label": "Wattage", "value": "110W"}, ...],
  "applications": ["Warehouses", "Factories"],
  "construction": "one or two sentences on materials and build",
  "brand_terms": ["every brand name, manufacturer name, product-line name, model or catalog number, domain, phone number and email that appears"]
}

Rules:
- specs: the measurable facts a buyer cares about — wattage, lumens, efficacy,
  CCT, CRI, beam angle, voltage, IP/IK rating, lifetime, dimensions, weight,
  operating temperature, warranty, certifications. Use the sheet's own units.
- Return AT MOST 25 spec rows, chosen for what decides a purchase. A sheet
  covering a family must NOT emit one row per model: consolidate them, e.g.
  {"label": "Lumens", "value": "10,640 - 33,440 lm depending on wattage"}.
  Long per-model dumps overflow the reply and are unreadable on a proposal.
- Omit a field entirely rather than guessing. An absent spec is fine; a wrong
  one ends up on a customer's proposal.
- brand_terms must be EXHAUSTIVE. Anything that could identify the
  manufacturer or let someone search for this exact part belongs here,
  including LED chip brands and driver brands. Over-collect deliberately.
- Do not include prices.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { specText, pdfUrl, productName, companyId } = await req.json();

    // The caller extracts the text (pdfjs-dist is already an app dependency)
    // and posts it here. Sending the PDF as a base64 document block was tried
    // first and the API rejected it with a 400; text is also several times
    // cheaper per sheet and avoids re-uploading a 575KB file per product.
    const text = typeof specText === 'string' ? specText.trim() : '';
    if (text.length < 200) {
      // Almost certainly a scanned, image-only sheet. Say so rather than
      // asking the model to invent specs from nothing.
      return new Response(JSON.stringify({
        error: 'Not enough readable text in this spec sheet — it is probably a scan and needs manual entry.',
        chars: text.length,
        needs_manual: true,
      }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ai = await callAnthropic(
      { feature: 'extract-product-specs', companyId: companyId ?? null },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,   // a truncated reply is invalid JSON; the big family sheets ran past 4096
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Extract the specifications for${productName ? ` "${productName}"` : ' this product'}. If the sheet covers a family of models, give the specs that apply across the family and express varying figures as a single range row.\n\nSPEC SHEET TEXT:\n"""\n${text.slice(0, 60000)}\n"""`,
          },
          // NO assistant prefill. claude-sonnet-4-6 rejects it outright:
          // "This model does not support assistant message prefill. The
          // conversation must end with a user message." The system prompt
          // asks for bare JSON instead and parseJsonReply strips a fence if
          // one shows up anyway.
        ],
      },
    );

    if (!ai.ok) {
      // ai_unavailable means our billing/key, not the caller's input — the
      // script should report it and move on rather than writing junk.
      // Pass the API's own message through. This is an admin/batch tool, not
      // a customer surface, and "AI analysis failed" with no detail cost real
      // time diagnosing a malformed request.
      return new Response(JSON.stringify({
        error: ai.friendly,
        detail: ai.raw ?? null,
        ai_unavailable: ai.unavailable === true,
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const replyText = ai.data?.content?.[0]?.text ?? '';
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(replyText);
    } catch {
      // A markdown fence or trailing prose — take the outermost object.
      const m = replyText.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = null; } }
    }

    if (!parsed || !Array.isArray(parsed.specs)) {
      return new Response(JSON.stringify({ error: 'Could not read specifications from this document.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      specs: parsed.specs,
      applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      construction: typeof parsed.construction === 'string' ? parsed.construction : '',
      brand_terms: Array.isArray(parsed.brand_terms) ? parsed.brand_terms : [],
      source: { url: pdfUrl ?? null, model: 'claude-sonnet-4-6' },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
