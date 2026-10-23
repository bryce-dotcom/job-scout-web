// marketing-google: the company's Google listing, as numbers.
//
// What a business already prints on its own Google listing — rating and
// how many reviews — read through the Places API with the server key and
// the Place ID the company saved (companies.google_place_id). No customer
// login, no Google approval: that is what the Business Profile insights
// (calls, directions, website clicks) need, and they are deliberately not
// here until the OAuth app is verified.
//
//   {cron:true}                  nightly: a marketing_metrics_daily row per
//                                company with a Place ID (Vault key)
//   {action:'status'}            latest row + the one ~30 days back, for the
//                                Numbers tab; refreshes today's row if stale
//   {action:'find', query}       candidates from Places text search, so the
//                                Setup card can set the Place ID in one tap
//   {action:'set', place_id}     save the Place ID on the company (Manager+)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { isCronCaller } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

interface Listing { rating: number | null; reviews: number | null; name: string | null; maps_url: string | null }

async function readListing(key: string, placeId: string): Promise<Listing | { error: string }> {
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri' },
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) return { error: String(d?.error?.message || r.status).slice(0, 200) }
  return { rating: d.rating ?? null, reviews: d.userRatingCount ?? null, name: d.displayName?.text || null, maps_url: d.googleMapsUri || null }
}

async function snapshot(sb: any, key: string, companyId: number, placeId: string) {
  const got = await readListing(key, placeId)
  if ('error' in got) return { ok: false, error: got.error }
  const { error } = await sb.from('marketing_metrics_daily').upsert(
    { company_id: companyId, day: today(), source: 'google', metrics: got },
    { onConflict: 'company_id,day,source' },
  )
  return error ? { ok: false, error: error.message } : { ok: true, ...got }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const PLACES_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') || ''
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  try {
    const body = await req.json().catch(() => ({}))

    if (body.cron === true) {
      if (!(await isCronCaller(req, { url: SUPABASE_URL, key: SERVICE_KEY }))) return json({ ok: false, error: 'Not for callers.' }, 403)
      if (!PLACES_KEY) return json({ ok: false, error: 'GOOGLE_PLACES_API_KEY is not set.' }, 500)
      const { data: cos } = await sb.from('companies').select('id, google_place_id').not('google_place_id', 'is', null).neq('google_place_id', '')
      const out: Record<string, unknown> = {}
      for (const c of cos || []) out[c.id] = await snapshot(sb, PLACES_KEY, c.id, c.google_place_id)
      // Old hits are no longer a trend.
      await sb.from('site_hits').delete().lt('at', new Date(Date.now() - 400 * 86400000).toISOString())
      return json({ ok: true, companies: (cos || []).length, results: out })
    }

    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    const companyId = caller.companyId
    const action = String(body.action || 'status')
    const { data: co } = await sb.from('companies').select('google_place_id, company_name, address, city, state').eq('id', companyId).maybeSingle()

    if (action === 'find') {
      if (caller.level < 2) return json({ ok: false, error: 'Only a Manager or above can change the listing.' }, 403)
      if (!PLACES_KEY) return json({ ok: false, error: 'Google lookups are not set up on the server.' }, 500)
      const query = String(body.query || [co?.company_name, co?.address, co?.city, co?.state].filter(Boolean).join(' ')).trim()
      if (!query) return json({ ok: false, error: 'Give me the business name and town.' }, 400)
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount' },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return json({ ok: false, error: String(d?.error?.message || 'Google refused the search').slice(0, 200) }, 502)
      const candidates = (d.places || []).map((p: any) => ({ place_id: p.id, name: p.displayName?.text || '', address: p.formattedAddress || '', rating: p.rating ?? null, reviews: p.userRatingCount ?? null }))
      return json({ ok: true, query, candidates })
    }

    if (action === 'set') {
      if (caller.level < 2) return json({ ok: false, error: 'Only a Manager or above can change the listing.' }, 403)
      const placeId = String(body.place_id || '').trim()
      if (!/^[A-Za-z0-9_-]{10,200}$/.test(placeId)) return json({ ok: false, error: 'That is not a Place ID.' }, 400)
      const { error } = await sb.from('companies').update({ google_place_id: placeId }).eq('id', companyId)
      if (error) return json({ ok: false, error: error.message }, 500)
      const snap = PLACES_KEY ? await snapshot(sb, PLACES_KEY, companyId, placeId) : { ok: false, error: 'no key' }
      return json({ ok: true, place_id: placeId, today: snap })
    }

    // status
    const placeId = co?.google_place_id || ''
    if (!placeId) return json({ ok: true, configured: false })
    const { data: rows } = await sb.from('marketing_metrics_daily').select('day, metrics').eq('company_id', companyId).eq('source', 'google').order('day', { ascending: false }).limit(60)
    let latest = rows?.[0] || null
    if ((!latest || latest.day !== today()) && PLACES_KEY) {
      const snap = await snapshot(sb, PLACES_KEY, companyId, placeId)
      if (snap.ok) latest = { day: today(), metrics: snap }
    }
    const cutoff = daysAgo(30)
    const before = (rows || []).find((r: any) => r.day <= cutoff) || (rows || [])[rows!.length - 1] || null
    return json({ ok: true, configured: true, place_id: placeId, latest, before: before && before.day !== latest?.day ? before : null })
  } catch (err) {
    console.error('[marketing-google]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Google failed' }, 500)
  }
})
