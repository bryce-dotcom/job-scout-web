import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Which price-book sections Lenard sells from.
//
// This used to be `name ilike *SMBE*` — a naming convention, not a price book.
// It was wrong in both directions for HHH: it MISSED 52 active products the
// bundles section really contains (the MES highbays and linear strips, the MES
// tubes, ES LIFT, the vapor-tight control) and it INCLUDED 43 SMBE-named rows
// that live under a different section entirely. A rep could not quote half the
// catalogue, and could quote things that were not in it.
//
// The price book already answers this. Products carry a `type` (the section,
// e.g. "Electrical Services (Bundles)") and a `group_id` into product_groups
// (e.g. "SMBE Highbays", "SMBE Wraps", "SMBE Panels"). Those groups are how the
// tenant has already organised their lighting, so they are what Lenard should
// use to match an existing fixture to its replacement.
//
// The section list is per-tenant, in settings.lenard_product_sections, because
// the Lenard sold inside JobScout has to work for a company whose lighting
// section is named anything at all. UT and AZ are HHH's own public agents and
// read the same setting for LENARD_COMPANY_ID.
const SETTING_KEY = 'lenard_product_sections';

// Only used for a tenant that has never configured the setting, so upgrading
// cannot empty anyone's picker. Configure the setting and this never runs.
const LEGACY_NAME_FILTER = 'name=ilike.*SMBE*';

const PRODUCT_FIELDS = 'id,name,type,group_id,unit_price,cost,description';

async function querySupabase(table: string, params: string = ''): Promise<any[]> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return [];
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** The tenant's configured sections, or null when they have not set any. */
async function configuredSections(cid: number): Promise<string[] | null> {
  // order+limit rather than a single-row read: a duplicate settings row must
  // never read as "unconfigured" and silently change which products a rep sees.
  const rows = await querySupabase(
    'settings',
    `company_id=eq.${cid}&key=eq.${SETTING_KEY}&select=value&order=id.desc&limit=1`,
  );
  const raw = rows?.[0]?.value;
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const list = (Array.isArray(parsed) ? parsed : [parsed])
      .map((s: any) => String(typeof s === 'string' ? s : (s?.name ?? '')).trim())
      .filter(Boolean);
    return list.length ? list : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Scope to the tenant this agent belongs to, the same way lenard-save,
    // lenard-employees and lenard-projects all do. Without it this returned
    // every matching row in the database regardless of owner.
    const companyId = Deno.env.get('LENARD_COMPANY_ID');
    if (!companyId) {
      // Refuse rather than fall back to an unscoped query, which is exactly
      // the leak this filter exists to close.
      return new Response(JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const cid = parseInt(companyId);

    const sections = await configuredSections(cid);
    // PostgREST in.() needs each value quoted; section names contain spaces
    // and parentheses ("Electrical Services (Bundles)").
    const scope = sections
      ? `type=in.(${sections.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(',')})`
      : LEGACY_NAME_FILTER;

    // Active only. A deactivated product must never reach the field: it is off
    // the price book, and quoting from it produces a number nobody can honour.
    const products = await querySupabase(
      'products_services',
      `company_id=eq.${cid}&active=eq.true&${scope}` +
      `&select=${PRODUCT_FIELDS}&order=type,name&limit=2000`,
    );

    // The tenant's own grouping, so the client can match an existing fixture to
    // the right family ("SMBE Highbays", "SMBE Wraps") instead of guessing from
    // product names, and can show the picker grouped the way the price book is.
    const groups = await querySupabase(
      'product_groups',
      `company_id=eq.${cid}&active=eq.true&select=id,name,service_type,sort_order` +
      `&order=sort_order,name&limit=500`,
    );

    return new Response(JSON.stringify({
      success: true,
      products,
      groups,
      sections: sections || [],
      // So the client can tell the rep their catalogue is not configured yet,
      // rather than quietly showing a name-matched approximation.
      configured: !!sections,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
