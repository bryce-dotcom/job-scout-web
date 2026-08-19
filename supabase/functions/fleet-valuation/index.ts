// What is this machine actually worth today?
//
// The lifecycle bar has been running on class residual curves — a reasonable
// shape for "a pickup at 40% of its life", and no help at all with "a 2019
// CAT 262D with 3,180 hours". The difference matters, because the number is
// attached to advice about selling a five-figure asset.
//
// There is no affordable equipment-value API, so this researches recent SOLD
// comparables the way a person would, and cites them. Two decisions keep it
// cheap enough to ship:
//
// CACHED BY MODEL, NOT BY ASSET. What a 2019 262D with 3,000 hours is worth
// does not depend on who owns it. Fifty tenants with the same machine share
// one lookup, and the cache is deliberately not tenant-scoped — see the
// fleet_valuations migration. Keying it per company would mean paying for the
// same market research fifty times over, which is the difference between a
// feature that costs pennies and one that cannot ship.
//
// BANDED METERS. Comps cluster, and a band matches how auction data actually
// arrives. Keying on exact hours would fragment the cache into one row per
// machine and defeat the point.
//
// Ninety-day expiry: used equipment prices move slowly, and it caps spend.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import { resolveCompanyId } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function pg(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`db ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/**
 * Meter bands. Wide enough that comps land in the same bucket, narrow enough
 * that the bucket still means something — a skid steer at 500 hours and one
 * at 5,500 are not the same machine.
 */
function band(meter: number, basis: string): { low: number; high: number } {
  if (basis === 'hours') {
    const size = meter < 1000 ? 250 : meter < 4000 ? 500 : 1000
    return { low: Math.floor(meter / size) * size, high: Math.floor(meter / size) * size + size }
  }
  const size = meter < 30_000 ? 10_000 : meter < 120_000 ? 20_000 : 40_000
  return { low: Math.floor(meter / size) * size, high: Math.floor(meter / size) * size + size }
}

const SYSTEM = `You value used commercial vehicles and construction equipment.

Search for RECENTLY SOLD comparables — auction results and completed sales,
not asking prices. Asking prices on dealer listings run well above what
machines actually change hands for, and a valuation built on them will tell
an owner to hold something they should have sold.

Good sources: Ritchie Bros, IronPlanet, Machinery Trader sold archives,
Purple Wave, Equipment Trader, Copart/IAA for trucks.

Return ONLY a JSON object, no prose, no markdown fence:
{
  "value_low": number,        // conservative / rough condition
  "value_typical": number,    // what it most likely brings
  "value_high": number,       // clean, low hours for the band
  "confidence": number,       // 0-1, honest about how thin the evidence is
  "comps": [ { "source": "...", "title": "...", "price": number,
               "meter": number, "sold_on": "YYYY-MM-DD or null", "url": "..." } ],
  "notes": "one sentence on what drove the number"
}

If you cannot find real comparables, say so with confidence 0 and an empty
comps array. A number with nothing behind it is worse than no number: it will
be shown to someone as the value of their machine.`

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // Authenticated callers only. The results are shared, but the AI spend is
    // not something an anonymous caller should be able to trigger.
    // Two kinds of legitimate caller: a signed-in user looking at an asset,
    // and an internal job backfilling values for models already in the fleet.
    // The second has no company because the result belongs to no company —
    // valuations are shared market data, not tenant data.
    // Read the role claim rather than string-matching the service key: the
    // value in the function's env is not guaranteed to be the same string the
    // caller sent, and comparing them fails silently and confusingly. The
    // platform has already verified the signature by the time this runs, so
    // the claim can be trusted.
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
    let role = ''
    try {
      const payload = bearer.split('.')[1]
      if (payload) role = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role || ''
    } catch { /* not a JWT; treated as no role */ }
    const internal = role === 'service_role'
    const companyId = internal ? null : await resolveCompanyId(req, SUPABASE_URL, SERVICE_KEY)
    if (!internal && !companyId) return json({ error: 'Sign in to value equipment.' }, 401)

    const body = await req.json().catch(() => ({}))
    const { asset_class, make, model, model_year, meter, meter_basis = 'hours', refresh = false } = body

    if (!asset_class || !meter_basis) return json({ error: 'asset_class and meter_basis are required' }, 400)
    if (!make && !model) {
      // Without make and model there is nothing to search for, and the class
      // curve already covers that case better than a guess would.
      return json({ error: 'make or model is required to research comparables' }, 400)
    }

    const m = Number(meter) || 0
    const { low, high } = band(m, meter_basis)

    const key =
      `asset_class=eq.${encodeURIComponent(asset_class)}` +
      `&make=eq.${encodeURIComponent(make || '')}` +
      `&model=eq.${encodeURIComponent(model || '')}` +
      `&model_year=eq.${Number(model_year) || 0}` +
      `&meter_basis=eq.${encodeURIComponent(meter_basis)}` +
      `&meter_low=eq.${low}&source=eq.ai_comps`

    if (!refresh) {
      const hit = await pg(`fleet_valuations?${key}&expires_at=gt.${new Date().toISOString()}&select=*&limit=1`)
      if (hit?.length) return json({ ok: true, cached: true, valuation: hit[0] })
    }

    const what = [model_year, make, model].filter(Boolean).join(' ')
    const unit = meter_basis === 'hours' ? 'hours' : 'miles'
    const ai = await callAnthropic({ feature: 'fleet-valuation', companyId, req }, {
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      messages: [{
        role: 'user',
        content: `What is a ${what} with roughly ${low.toLocaleString()}–${high.toLocaleString()} ${unit} worth today? Category: ${asset_class.replace(/_/g, ' ')}.`,
      }],
    })

    if (!ai.ok) {
      // The class curve still works. Degrading to it is far better than
      // blocking the page, so this is a soft failure by design.
      return json({ ok: false, unavailable: ai.unavailable, error: ai.friendly || 'Valuation unavailable' }, 200)
    }

    const text = (ai.data?.content || [])
      .filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ ok: false, error: 'No usable valuation returned' }, 200)

    let parsed: any
    try { parsed = JSON.parse(match[0]) } catch { return json({ ok: false, error: 'Valuation was not valid JSON' }, 200) }

    const num = (v: any) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null))
    const typical = num(parsed.value_typical)

    // A comparable with no price is not a comparable. The model returns them
    // in good faith — a listing it found but could not read a figure from —
    // and stored unfiltered they inflate the apparent evidence behind a
    // number that a person is about to act on.
    const comps = (Array.isArray(parsed.comps) ? parsed.comps : [])
      .filter((c: any) => (num(c?.price) ?? 0) > 0)

    // Two priced comparables is the floor for calling something researched.
    // Below that the class curve is the better answer and says so honestly,
    // rather than a single listing dressed up as a market.
    if (typical === null || typical <= 0 || comps.length < 2) {
      return json({
        ok: false,
        error: comps.length ? 'Not enough priced comparables to be worth trusting' : 'No real comparables found',
        pricedComps: comps.length,
        notes: parsed.notes || null,
      }, 200)
    }

    const row = {
      asset_class, make: make || '', model: model || '',
      model_year: Number(model_year) || 0,
      meter_basis, meter_low: low, meter_high: high,
      value_low: num(parsed.value_low) ?? typical,
      value_typical: typical,
      value_high: num(parsed.value_high) ?? typical,
      source: 'ai_comps',
      confidence: Math.min(1, Math.max(0, num(parsed.confidence) ?? 0.5)),
      comps,
      researched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    }

    await pg('fleet_valuations?on_conflict=asset_class,make,model,model_year,meter_basis,meter_low,meter_high,source', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    })

    return json({ ok: true, cached: false, valuation: row, notes: parsed.notes ?? null })
  } catch (err) {
    console.error('[fleet-valuation]', err)
    return json({ error: (err as Error).message || 'internal error' }, 500)
  }
})
