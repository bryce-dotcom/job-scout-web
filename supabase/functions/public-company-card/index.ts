// Who a public page is speaking for.
//
// The SMS terms page (/sms-terms/:slug) has to name the business whose texts it
// governs — a carrier reviewing an A2P 10DLC campaign matches the disclosure
// against the brand that registered, and "JobScout may text you" is not true
// for a tenant's customer. But the page is public by definition (the reviewer
// opens it without logging in) and `companies` has no anon RLS policy, so the
// browser cannot read the name itself.
//
// Same shape as zach-instant-quote, which resolves a company the same way for
// the same reason: exact match on public_quote_slug, which companySetup.ts sets
// for every company at signup. Must be deployed with --no-verify-jwt and is
// pinned in config.toml, or a routine redeploy turns the terms page dark.
//
// It returns only what a business already prints on its own website: trading
// name, legal name, phone, website. Deliberately NOT owner_email — that is
// often a person's own address, and nothing on the page needs it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Slug from the query string (GET) or the body (POST) — the page uses GET.
    let slug = new URL(req.url).searchParams.get('slug') || '';
    if (!slug && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      slug = String(body?.slug || '');
    }
    slug = slug.trim();
    if (!slug) return json({ error: 'slug is required' }, 400);

    // Exact match only. No listing, no prefix search: a wrong slug gets a 404,
    // never somebody else's company.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?public_quote_slug=eq.${encodeURIComponent(slug)}`
      + `&select=company_name,legal_name,phone,website&limit=1`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!res.ok) {
      console.error('[public-company-card] companies read failed:', res.status, (await res.text()).slice(0, 200));
      return json({ error: 'Could not look that up' }, 502);
    }

    const [company] = await res.json();
    if (!company) return json({ error: 'not found' }, 404);

    return json({
      company_name: company.company_name || null,
      legal_name: company.legal_name || null,
      phone: company.phone || null,
      website: company.website || null,
    });

  } catch (error) {
    console.error('[public-company-card] error:', error);
    return json({ error: (error as Error)?.message || 'error' }, 500);
  }
});
