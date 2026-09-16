// parcel-lookup — nationwide parcels for the Liahona map via Regrid.
//
// The map asks free county sources first (UGRC in Utah, the Maricopa County
// Assessor in AZ). Everywhere else it comes here. The Regrid token lives in
// REGRID_API_TOKEN and never reaches the browser.
//
// Actions (POST JSON, user JWT required, caller must belong to company_id):
//   point  { lat, lng }                      → { parcel | null, cached, source }
//   area   { bbox: [west, south, east, north], limit? } → { features, source }
//
// Point results are cached in parcel_cache for 90 days (by tapped point and
// by Regrid's ll_uuid); every uncached call bumps parcel_api_usage for the
// company so the plan can meter it. Area calls are not cached (bulk, cheap
// per parcel) but are counted once per call.
//
// Regrid sandbox tokens only cover sample counties (Marion County, IN);
// a paid token is nationwide. An expired or bad token comes back as
// { error: 'regrid_auth' } so the map can say so instead of failing quietly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const REGRID = 'https://app.regrid.com/api/v2';
const CACHE_DAYS = 90;

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const title = (s: unknown) => s ? String(s).toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()) : '';
const period = () => { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

// Regrid feature → the parcel shape src/lib/parcels.js already renders.
function normalize(f: any, withGeometry: boolean) {
  const p = f?.properties?.fields || {};
  const addr = title(p.address);
  return {
    source: 'regrid', source_label: 'Regrid (nationwide)', county: p.county ? title(p.county) + ' County' : null,
    parcel_id: p.parcelnumb || null, ll_uuid: f?.properties?.ll_uuid || p.ll_uuid || null,
    address: addr, city: title(p.scity), zip: p.szip || '', state: p.state2 || '',
    owner_name: title(p.owner), mail_address: [title(p.mailadd), title(p.mail_city), p.mail_state2, p.mail_zip].filter(Boolean).join(', ') || null,
    year_built: num(p.yearbuilt), sqft: num(p.ll_bldg_footprint_sqft) ?? null,
    lot_acres: p.ll_gissqft ? +(num(p.ll_gissqft)! / 43560).toFixed(2) : (num(p.sqft) ? +(num(p.sqft)! / 43560).toFixed(2) : null),
    market_value: num(p.parval) || null, land_value: num(p.landval) || null, improvement_value: num(p.improvval) || null,
    last_sale_date: p.saledate || null, last_sale_price: num(p.saleprice) || null,
    prop_class: p.usedesc || p.lbcs_activity_desc || null, prop_type: p.zoning ? `Zoning ${p.zoning}` : null, primary_res: null,
    subdivision: p.subdivision || null, source_url: f?.properties?.path ? `https://app.regrid.com${f.properties.path}` : 'https://regrid.com',
    as_of: p.ll_last_refresh || null,
    lat: num(p.lat), lng: num(p.lon),
    geometry: withGeometry ? (f?.geometry || null) : null,
  };
}

async function regrid(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, token });
  const res = await fetch(`${REGRID}${path}?${qs}`, { signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403 || body?.message === 'Access denied') throw new Error('regrid_auth');
  if (!res.ok) throw new Error(`regrid_http_${res.status}`);
  return body;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = Deno.env.get('REGRID_API_TOKEN');
    if (!token) return json({ error: 'regrid_not_configured' }, 503);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Authorization required' }, 401);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(auth);
    if (userErr || !user) return json({ error: 'Invalid auth token' }, 401);

    const body = await req.json().catch(() => ({}));
    const { action, company_id } = body;
    if (!action || !company_id) return json({ error: 'action + company_id required' }, 400);
    const { data: emp } = await supabase.from('employees').select('id').eq('company_id', company_id).ilike('email', user.email!).maybeSingle();
    if (!emp) return json({ error: 'Not a member of that company' }, 403);

    const fresh = (iso: string) => (Date.now() - new Date(iso).getTime()) < CACHE_DAYS * 86400e3;

    if (action === 'point') {
      const lat = Number(body.lat), lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'lat + lng required' }, 400);
      const ptKey = `pt:${lat.toFixed(5)},${lng.toFixed(5)}`;
      const { data: hit } = await supabase.from('parcel_cache').select('payload, fetched_at').eq('key', ptKey).maybeSingle();
      if (hit && fresh(hit.fetched_at)) return json({ parcel: hit.payload, cached: true, source: 'regrid' });

      let out: any;
      try { out = await regrid('/parcels/point', { lat: String(lat), lon: String(lng), radius: '15', return_geometry: 'true' }, token); }
      catch (e) { const m = String((e as Error).message); return json({ error: m.startsWith('regrid_') ? m : 'regrid_failed', detail: m }, m === 'regrid_auth' ? 502 : 502); }
      await supabase.rpc('bump_parcel_usage', { p_company_id: company_id, p_period: period(), p_lookups: 1 });

      const f = out?.parcels?.features?.[0];
      const parcel = f ? normalize(f, true) : null;
      const rows = [{ key: ptKey, ll_uuid: parcel?.ll_uuid || null, payload: parcel, fetched_at: new Date().toISOString() }];
      if (parcel?.ll_uuid) rows.push({ key: `uuid:${parcel.ll_uuid}`, ll_uuid: parcel.ll_uuid, payload: parcel, fetched_at: rows[0].fetched_at });
      await supabase.from('parcel_cache').upsert(rows, { onConflict: 'key' });
      return json({ parcel, cached: false, source: 'regrid' });
    }

    if (action === 'area') {
      const b = body.bbox;
      if (!Array.isArray(b) || b.length !== 4 || b.some((v: unknown) => !Number.isFinite(Number(v)))) return json({ error: 'bbox [west,south,east,north] required' }, 400);
      const [w, s, e, n] = b.map(Number);
      // Keep bulk pulls small: a few city blocks, never a whole town.
      if (Math.abs(e - w) > 0.03 || Math.abs(n - s) > 0.03) return json({ error: 'bbox_too_large' }, 400);
      const limit = Math.min(500, Math.max(1, Number(body.limit) || 300));
      const geojson = JSON.stringify({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
      let out: any;
      try { out = await regrid('/parcels/area', { geojson, limit: String(limit), return_geometry: 'true' }, token); }
      catch (e2) { const m = String((e2 as Error).message); return json({ error: m.startsWith('regrid_') ? m : 'regrid_failed', detail: m }, 502); }
      await supabase.rpc('bump_parcel_usage', { p_company_id: company_id, p_period: period(), p_lookups: 1 });
      const features = (out?.parcels?.features || []).filter((f: any) => f.geometry).map((f: any) => ({
        type: 'Feature', geometry: f.geometry, properties: normalize(f, false),
      }));
      return json({ features, source: 'regrid' });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
