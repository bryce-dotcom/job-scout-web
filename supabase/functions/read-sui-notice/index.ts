// read-sui-notice — read a state unemployment rate notice (or a screenshot
// of a payroll provider's tax-setup screen) and return the assigned rate,
// the account number and the year it applies to.
//
// This is the one part of "provide the SUI rate" a product can actually do:
// the state mails the number to the employer and nobody else, so the best
// we can offer is to read the letter for them. Gusto routes an uploaded
// notice to a support queue; here the AI wrapper reads it in seconds and
// the person confirms before anything is saved (Settings → Payroll Tax).
//
// Body: { fileBase64, mediaType ('application/pdf' | 'image/*'), state? }
// Auth: the caller's JWT; Admin and above only (a tax rate is company
// identity — the same line the companies guard draws). company_id comes
// from the JWT, never from the body.
//
// Returns { success, read: { kind, employer_name, account_number,
//   assigned_rate_pct, effective_year, wage_base, confidence, notes } }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { resolveCaller } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await resolveCaller(req, Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!caller || caller.companyId == null) return json({ error: 'Sign in to read a rate notice.' }, 401);
    if (caller.level < 3) return json({ error: 'Only an admin can change the company\'s tax settings.' }, 403);

    const { fileBase64, mediaType, state } = await req.json().catch(() => ({}));
    if (!fileBase64 || typeof fileBase64 !== 'string') return json({ error: 'No file received.' }, 400);
    if (fileBase64.length > 16 * 1024 * 1024) return json({ error: 'That file is too large — a photo or a one-page PDF is plenty.' }, 413);

    const mt = String(mediaType || '').toLowerCase();
    const isPdf = mt === 'application/pdf';
    const isImage = /^image\/(png|jpe?g|webp|gif)$/.test(mt);
    if (!isPdf && !isImage) return json({ error: 'Upload a PDF or a photo (PNG/JPEG).' }, 400);

    const stateCode = String(state || 'UT').toUpperCase();
    const contentBlocks: any[] = [
      isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
        : { type: 'image', source: { type: 'base64', media_type: mt, data: fileBase64 } },
      {
        type: 'text',
        text:
`This is either (a) a state unemployment insurance contribution/experience RATE NOTICE mailed to an employer by a state workforce agency — for Utah, the Department of Workforce Services "Contribution Rate Notice", where the number wanted is box J "Assigned Contribution Rate" — or (b) a screenshot of a payroll provider's tax-setup screen (Gusto, QuickBooks, ADP) showing the employer's state unemployment (SUI/UI) rate.

Extract, for state ${stateCode} if the document names a state:
- kind: "rate_notice" or "provider_screen" (or "other" if it is neither)
- employer_name: the employer the notice is addressed to, if shown
- account_number: the employer's unemployment insurance account number as printed (Utah format like C0123456-7), or null
- assigned_rate_pct: the ASSIGNED / total contribution rate as a PERCENT number (0.001 or 0.1% both mean 0.1 → return 0.1). If the notice lists component rates (basic, social cost, reserve, surcharge) AND a total/assigned rate, return the total. Do not add components to a total that already includes them. Null if not present.
- effective_year: the calendar year the rate applies to (or the year of the effective date), or null
- wage_base: the taxable wage base in dollars if printed, else null
- confidence: 0-1, how sure you are the assigned_rate_pct is the employer's total rate for that year
- notes: one short sentence if anything needs a human look (e.g. "two rates shown: 2025 and 2026", "components listed without a total"), else null

Return ONLY a JSON object with exactly those keys. No prose, no markdown fences.`,
      },
    ];

    const ai = await callAnthropic(
      { feature: 'read-sui-notice', companyId: caller.companyId },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: 'You read tax documents for a payroll system. Respond with ONLY a valid JSON object. Never invent a number that is not on the document; use null.',
        messages: [{ role: 'user', content: contentBlocks }],
      },
    );
    if (!ai.ok) return json({ error: ai.friendly || 'The reader is unavailable right now — type the rate from the notice instead.', ai_unavailable: ai.unavailable === true }, 500);

    const text: string = ai.data?.content?.[0]?.text || '';
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* fall through */ }
    if (!parsed) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* still nothing */ } }
    }
    if (!parsed || typeof parsed !== 'object') return json({ error: 'Could not read a rate off that file. Try a clearer photo, or type it from the notice.' }, 422);

    // Normalise: a rate written as a decimal fraction (0.001) is 0.1%.
    let rate = parsed.assigned_rate_pct == null ? null : Number(parsed.assigned_rate_pct);
    if (rate != null && !Number.isFinite(rate)) rate = null;
    if (rate != null && rate > 0 && rate < 0.05) rate = Math.round(rate * 100 * 10000) / 10000; // 0.001 → 0.1
    const year = parsed.effective_year == null ? null : Number(String(parsed.effective_year).slice(0, 4));

    return json({
      success: true,
      read: {
        kind: ['rate_notice', 'provider_screen', 'other'].includes(parsed.kind) ? parsed.kind : 'other',
        employer_name: parsed.employer_name ? String(parsed.employer_name).slice(0, 120) : null,
        account_number: parsed.account_number ? String(parsed.account_number).trim().slice(0, 40) : null,
        assigned_rate_pct: rate,
        effective_year: year && year > 2000 && year < 2100 ? year : null,
        wage_base: parsed.wage_base == null ? null : Number(parsed.wage_base) || null,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
      },
    });
  } catch (err) {
    console.error('read-sui-notice:', err);
    return json({ error: (err as Error).message || 'Unexpected error' }, 500);
  }
});
