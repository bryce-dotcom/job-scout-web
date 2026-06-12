// zach-instant-quote
//
// PUBLIC endpoint — no auth required. Used by the public instant-quote widget.
// The browser:
//   1. User types address → Google Places autocomplete returns lat/lng
//   2. Browser fetches the Static Maps satellite image (referrer-restricted key)
//   3. Browser POSTs base64 + contact info here
//
// We:
//   1. Resolve company by public_quote_slug
//   2. Run the same vision analysis as zach-yard-ai
//   3. Run the lawn estimator with that company's pricing
//   4. Save to lawn_quote_requests as a lead
//   5. Return the bid + AI image URL to the browser
//
// Anti-abuse: simple per-IP-hash rate limiting via the lawn_quote_requests
// table count (last hour). Tighten later if needed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DEFAULT_PRICING = {
  mow_per_sqft: 0.012, mow_minimum: 45, mow_minutes_per_1000sqft: 8,
  edging_per_lin_ft: 0.10, edging_default_lin_ft: 200,
  fert_per_1000sqft: 12, weed_per_1000sqft: 8, grub_per_1000sqft: 14,
  iron_per_1000sqft: 6, lime_per_1000sqft: 5, pre_emergent_per_1000sqft: 10,
  aeration_per_1000sqft: 18, aeration_minimum: 90, overseed_per_1000sqft: 22,
  cleanup_per_hour: 75, travel_per_visit: 0,
  tax_rate: 0, margin_multiplier: 1.0, ai_calibration_factor: 1.0,
};

function metersPerPixel(lat: number, zoom: number) {
  return 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
}
function imageAreaSqft({ lat, zoom, width, height }: { lat: number; zoom: number; width: number; height: number }) {
  const mpp = metersPerPixel(lat, zoom);
  return Math.round((width * mpp) * (height * mpp) * 10.7639);
}
function round2(n: number) { return Math.round((Number(n) || 0) * 100) / 100; }
function per1k(sqft: number, rate: number) { return Math.round((sqft / 1000) * rate * 100) / 100; }

// Inlined estimator — matches src/lib/lawnEstimator.js exactly so the public
// quote and the in-app preview produce the same numbers.
function estimateProgram(turfSqft: number, p: any, freq = 'Weekly', startM = 4, endM = 10) {
  const pricing = { ...DEFAULT_PRICING, ...(p || {}) };
  const months = Math.max(0, endM - startM + 1);
  const weeks = months * 4.33;
  let mowsPerSeason = Math.round(weeks);
  const f = (freq || '').toLowerCase();
  if (f.includes('bi')) mowsPerSeason = Math.round(weeks / 2);
  else if (f.includes('10')) mowsPerSeason = Math.round((months * 30) / 10);
  else if (f.includes('month')) mowsPerSeason = months;

  const mowRaw = turfSqft * Number(pricing.mow_per_sqft);
  const mowCharge = Math.max(mowRaw, Number(pricing.mow_minimum));
  const edgeCharge = Number(pricing.edging_default_lin_ft) * Number(pricing.edging_per_lin_ft);
  const travel = Number(pricing.travel_per_visit) || 0;
  const subtotal = mowCharge + edgeCharge + travel;
  const perVisitTotal = subtotal * Number(pricing.margin_multiplier || 1);
  const perVisitGrand = perVisitTotal * (1 + Number(pricing.tax_rate || 0));
  const predictedMin = Math.round((turfSqft / 1000) * Number(pricing.mow_minutes_per_1000sqft));

  const program = ['pre-emergent', 'fert', 'weed-control', 'fert', 'grub-control', 'fert'];
  const rateMap: Record<string, number> = {
    'pre-emergent': pricing.pre_emergent_per_1000sqft,
    'fert': pricing.fert_per_1000sqft,
    'weed-control': pricing.weed_per_1000sqft,
    'grub-control': pricing.grub_per_1000sqft,
  };
  const treatments = program.map((t, i) => ({
    round: i + 1,
    label: t,
    total: round2(per1k(turfSqft, Number(rateMap[t] || 0)) * Number(pricing.margin_multiplier || 1)),
  }));

  const mowsTotal = round2(perVisitGrand * mowsPerSeason);
  const treatmentsTotal = round2(treatments.reduce((s, x) => s + x.total, 0));
  const annual = round2(mowsTotal + treatmentsTotal);

  return {
    per_visit: round2(perVisitGrand),
    per_visit_subtotal: round2(perVisitTotal),
    predicted_minutes: predictedMin,
    mows_per_season: mowsPerSeason,
    mows_total: mowsTotal,
    treatments,
    treatments_total: treatmentsTotal,
    annual_program_total: annual,
  };
}

async function callClaudeVision(opts: { companyId: number | null; image_base64: string; media_type: string; lat: number; lng: number; address?: string; zoom: number; image_width: number; image_height: number; scale: number; correctionsBlock: string }) {
  const footprintSqft = imageAreaSqft({ lat: opts.lat, zoom: opts.zoom, width: opts.image_width, height: opts.image_height });
  const sys = `You are an expert lawn-care estimator analyzing a top-down satellite photo of a residential property. Identify the MOWABLE TURF AREA — the actual grass a crew would push a mower across. Exclude house, driveway, sidewalks, beds, pool, dirt, deck. Park-strip grass counts.

OUTPUT JSON ONLY:
{ "estimated_turf_sqft": int, "confidence": 0-1, "obstacles": [...], "reasoning": "1-2 sentences" }`;
  const user = `Address center: ${opts.address || `${opts.lat}, ${opts.lng}`}
Image: ${opts.image_width * opts.scale} × ${opts.image_height * opts.scale} px @ zoom ${opts.zoom}
Total image footprint ≈ ${footprintSqft.toLocaleString()} sqft (so 25% lawn ≈ ${Math.round(footprintSqft * 0.25).toLocaleString()} sqft).${opts.correctionsBlock}

Return JSON only.`;

  const ai = await callAnthropic(
    { feature: 'zach-instant-quote', companyId: opts.companyId },
    {
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 700,
      system: sys,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: opts.media_type, data: opts.image_base64 } },
        { type: 'text', text: user },
      ] }],
    },
  );
  if (!ai.ok) {
    throw new Error(ai.friendly);
  }
  const j = ai.data;
  const txt = j?.content?.[0]?.text || '';
  const m = txt.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : txt);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = await req.json();
    const {
      company_slug, address, lat, lng,
      image_base64, media_type = 'image/png',
      zoom = 20, image_width = 640, image_height = 640, scale = 2,
      contact_name, contact_email, contact_phone, notes,
    } = body || {};

    if (!company_slug) return json({ error: 'company_slug required' }, 400);
    if (!address) return json({ error: 'address required' }, 400);
    if (lat == null || lng == null) return json({ error: 'lat & lng required' }, 400);
    if (!image_base64) return json({ error: 'image_base64 required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'supabase env missing' }, 500);

    const sbHeaders = { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY, 'Content-Type': 'application/json' };

    // Resolve company by slug
    const compRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?public_quote_slug=eq.${encodeURIComponent(company_slug)}&select=id,name`, { headers: sbHeaders });
    const comps = await compRes.json();
    if (!comps?.length) return json({ error: 'Unknown company slug' }, 404);
    const company = comps[0];

    // Naive per-IP-hash rate limit: 10 quotes/hr (last 60 min)
    const ipRaw = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const ipHash = ipRaw ? await sha256(ipRaw + (Deno.env.get('IP_HASH_SALT') || 'zach')) : '';
    if (ipHash) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const rlRes = await fetch(`${SUPABASE_URL}/rest/v1/lawn_quote_requests?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id`, { headers: sbHeaders });
      const recent = await rlRes.json();
      if (Array.isArray(recent) && recent.length >= 10) return json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    // Pull pricing + corrections
    const [pricingRes, corrRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/lawn_pricing?company_id=eq.${company.id}&select=*`, { headers: sbHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/lawn_ai_corrections?company_id=eq.${company.id}&order=created_at.desc&limit=12&select=ai_sqft,actual_sqft,delta_pct,notes`, { headers: sbHeaders }),
    ]);
    const pricingRows = await pricingRes.json();
    const pricing = pricingRows?.[0] || DEFAULT_PRICING;
    const calibrationFactor = Number(pricing.ai_calibration_factor) || 1.0;
    const corrections = await corrRes.json();
    let correctionsBlock = '';
    if (Array.isArray(corrections) && corrections.length) {
      correctionsBlock = '\n\nRECENT CORRECTIONS FROM THIS COMPANY (use to calibrate):\n' +
        corrections.map((c: any) => `- AI guessed ${c.ai_sqft} → actual ${c.actual_sqft} (${(c.delta_pct > 0 ? '+' : '') + c.delta_pct?.toFixed(0)}%)${c.notes ? ` — ${c.notes}` : ''}`).join('\n');
    }

    // Vision analysis
    let aiResult: any;
    try {
      aiResult = await callClaudeVision({
        companyId: company.id ?? null, image_base64, media_type,
        lat: Number(lat), lng: Number(lng), address, zoom, image_width, image_height, scale,
        correctionsBlock,
      });
    } catch (e) {
      return json({ error: 'Vision failed: ' + (e as Error).message }, 502);
    }
    const rawSqft = Math.max(0, parseInt(aiResult.estimated_turf_sqft) || 0);
    const turfSqft = Math.round(rawSqft * calibrationFactor);

    // Quote math
    const quote = estimateProgram(turfSqft, pricing);

    // Create a lead so this prospect shows up in the sales pipeline alongside
    // every other lead. Soft-fail: if the lead insert dies for any reason
    // (schema drift, RLS quirk), we still want the quote request to save.
    let leadId: number | null = null;
    try {
      const fallbackName = (() => {
        const short = String(address).split(',')[0].trim();
        return short ? `Quote — ${short}` : 'Public quote request';
      })();
      const leadNotes = `Public Zach quote · ${turfSqft.toLocaleString()} sqft turf · $${quote.per_visit}/visit · $${quote.annual_program_total}/yr${notes ? `\n\n${notes}` : ''}${aiResult.reasoning ? `\n\nAI: ${aiResult.reasoning}` : ''}`;
      const leadRes = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          company_id: company.id,
          customer_name: (contact_name && String(contact_name).trim()) || fallbackName,
          email: contact_email || null,
          phone: contact_phone || null,
          address,
          service_type: 'Lawn Care',
          lead_source: 'Public Quote',
          status: 'New',
          notes: leadNotes,
        }),
      });
      const leadJson = await leadRes.json();
      if (Array.isArray(leadJson) && leadJson[0]?.id) {
        leadId = leadJson[0].id;
      } else if (!leadRes.ok) {
        console.warn('[zach-instant-quote] lead insert failed:', leadJson);
      }
    } catch (e) {
      console.warn('[zach-instant-quote] lead insert threw:', (e as Error).message);
    }

    // Save the quote request, linked to the lead we just created
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/lawn_quote_requests`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        company_id: company.id,
        lead_id: leadId,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        address,
        latitude: Number(lat),
        longitude: Number(lng),
        ai_estimated_sqft: turfSqft,
        ai_confidence: Math.max(0, Math.min(1, Number(aiResult.confidence) || 0)),
        ai_obstacles: aiResult.obstacles || [],
        quote_per_visit: quote.per_visit,
        quote_annual: quote.annual_program_total,
        quote_breakdown: quote,
        pricing_snapshot: pricing,
        notes: notes || aiResult.reasoning || null,
        user_agent: req.headers.get('user-agent') || null,
        ip_hash: ipHash || null,
        status: 'new',
      }),
    });
    const inserted = (await insertRes.json())?.[0];

    // Mirror Lenard: push this bid into the unified quotes + quote_lines tables
    // so it shows up in the sales pipeline alongside every other quote.
    let pipelineQuoteId: number | null = null;
    if (leadId && quote.annual_program_total > 0) {
      try {
        const shortAddr = String(address).split(',')[0].trim();
        const qPayload = {
          company_id: company.id,
          lead_id: leadId,
          audit_id: null,
          audit_type: 'lawn_care',
          service_type: 'Lawn Care',
          estimate_name: `Lawn care — ${shortAddr || address}`,
          summary: `${turfSqft.toLocaleString()} sqft turf · ${quote.mows_per_season} mows/season · public quote`,
          quote_amount: quote.annual_program_total,
          status: 'Draft',
          notes: `Address: ${address}\nPer visit: $${quote.per_visit} · Treatments: $${quote.treatments_total} · Annual: $${quote.annual_program_total}\n\nAI: ${aiResult.reasoning || ''}`,
        };
        const qRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'return=representation' },
          body: JSON.stringify(qPayload),
        });
        const qJson = await qRes.json();
        const newQuote = Array.isArray(qJson) ? qJson[0] : null;
        if (newQuote?.id) {
          pipelineQuoteId = newQuote.id;

          const lines = [
            {
              company_id: company.id,
              quote_id: newQuote.id,
              item_name: `Mowing — ${quote.mows_per_season} visits`,
              description: `Mowing on ${turfSqft.toLocaleString()} sqft turf · ~${quote.predicted_minutes} min/visit`,
              quantity: quote.mows_per_season,
              price: quote.per_visit,
              line_total: quote.mows_total,
              sort_order: 0,
            },
            ...quote.treatments.map((t: any, i: number) => ({
              company_id: company.id,
              quote_id: newQuote.id,
              item_name: `Treatment Round ${t.round} — ${t.label}`,
              quantity: 1,
              price: t.total,
              line_total: t.total,
              sort_order: i + 1,
            })),
          ];
          const lrRes = await fetch(`${SUPABASE_URL}/rest/v1/quote_lines`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify(lines),
          });
          if (!lrRes.ok) {
            const lrTxt = await lrRes.text();
            console.warn('[zach-instant-quote] quote_lines insert failed:', lrTxt);
          }

          // Link the lead to the new quote so the pipeline shows the value.
          await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({ quote_id: newQuote.id, status: 'Estimate Sent' }),
          });
        } else if (!qRes.ok) {
          console.warn('[zach-instant-quote] quote insert failed:', qJson);
        }
      } catch (e) {
        console.warn('[zach-instant-quote] quote sync threw:', (e as Error).message);
      }
    }

    return json({
      quote_id: inserted?.id,
      pipeline_quote_id: pipelineQuoteId,
      lead_id: leadId,
      company_name: company.name,
      address,
      ai: {
        sqft: turfSqft,
        raw_sqft: rawSqft,
        calibration_factor: calibrationFactor,
        confidence: aiResult.confidence,
        obstacles: aiResult.obstacles || [],
        reasoning: aiResult.reasoning,
      },
      quote,
    });
  } catch (e) {
    console.error('[zach-instant-quote] error:', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

async function sha256(s: string) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
