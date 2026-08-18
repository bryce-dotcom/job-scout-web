// =====================================================================
// watchdog-repair — tier 2. Re-derive the extractor config when the
// cheap tiers stop working.
//
// This is the only place an LLM touches the fleet mirror, and it is
// deliberately NOT on the data path. Paying a model to read a map every
// five minutes would cost more than the GPS hardware. Instead it runs
// when a sync breaks structurally — the provider shipped a redesign,
// an endpoint moved, a field got renamed — reads the live app once,
// writes a new config row, and hands the work back to tier 0.
//
// Three inputs, cheapest signal first:
//
//   1. Endpoints observed during a fresh login. The login service
//      records every XHR the provider's own app fires, so we usually
//      already KNOW the new URLs without asking anyone. This alone
//      fixes the common "they renamed /devices to /v2/assets" break.
//   2. Sample response bodies from those endpoints — the actual field
//      names, which is what field_map needs.
//   3. A screenshot, for when the JSON is ambiguous about which
//      endpoint backs which screen.
//
// The model's output is never trusted on faith: a candidate config has
// to successfully pull real devices for a real company before it goes
// active. A repair that doesn't work is recorded and left inactive.
// =====================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import {
  loadExtractorConfig, loadIntegration, ensureSession, capturePage,
  tier0, normalizePosition, pg,
  type ExtractorConfig,
} from '../_shared/watchdog.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const MODEL = 'claude-sonnet-4-6'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { company_id, reason } = await req.json().catch(() => ({}))
    if (!company_id) return json({ error: 'company_id is required' }, 400)

    const current = await loadExtractorConfig()
    if (!current) return json({ error: 'no active config to repair' }, 503)

    const integration = await loadIntegration(Number(company_id))
    if (!integration) return json({ error: 'no integration for that company' }, 404)

    // Force a fresh login so the login service re-observes the live
    // endpoint list. This is the cheap signal, and it's often sufficient.
    integration.session_expires_at = null
    const session = await ensureSession(integration, current)
    const observed = integration.sessionData?.observedEndpoints || []

    // Sample a few of the observed endpoints so the model can see real
    // field names rather than guessing at them.
    const samples = await sampleEndpoints(observed, session, 6)

    // Only screenshot if the JSON didn't tell us enough — a full-page PNG
    // is by far the most expensive thing we can put in the prompt.
    let screenshot: string | null = null
    if (samples.length < 2) {
      const target = current.login?.mapUrl || current.login?.url
      if (target) {
        screenshot = await capturePage(integration, target)
          .then(c => c.screenshotBase64)
          .catch(() => null)
      }
    }

    const proposal = await proposeConfig({
      companyId: Number(company_id),
      reason: reason || 'sync failed',
      current,
      observed,
      samples,
      screenshot,
      req,
    })

    if (!proposal.ok) return json({ error: proposal.error, stage: 'propose' }, 502)

    // Validate before activating. A config that can't pull devices is
    // worse than the broken one we already have, because it looks fixed.
    const candidate: ExtractorConfig = {
      ...current,
      api_base: proposal.config.api_base || session.apiBase || current.api_base,
      endpoints: proposal.config.endpoints || current.endpoints,
      field_map: proposal.config.field_map || current.field_map,
      selectors: proposal.config.selectors || current.selectors,
      login: proposal.config.login || current.login,
    }

    const check = await validate(candidate, session, Number(company_id))

    const nextVersion = await nextConfigVersion()
    const [row] = await pg('fleet_extractor_config', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{
        provider: 'moto_watchdog',
        version: nextVersion,
        api_base: candidate.api_base,
        login: candidate.login,
        endpoints: candidate.endpoints,
        field_map: candidate.field_map,
        selectors: candidate.selectors,
        source: 'vision',
        confidence: proposal.confidence ?? null,
        notes: `auto-repair after: ${(reason || 'sync failed').slice(0, 200)}\n${proposal.notes || ''}\nvalidation: ${check.detail}`,
        active: false,
        verified_at: check.ok ? new Date().toISOString() : null,
      }]),
    })

    if (!check.ok) {
      return json({
        ok: false,
        activated: false,
        version: nextVersion,
        validation: check.detail,
        message: 'candidate config saved but not activated — it did not pull usable devices',
      })
    }

    // Swap atomically-ish: deactivate the old, activate the new. The
    // partial-unique index on (provider) WHERE active means the old row
    // has to be cleared first.
    await pg(`fleet_extractor_config?provider=eq.moto_watchdog&active=is.true`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ active: false }),
    })
    await pg(`fleet_extractor_config?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ active: true }),
    })

    return json({
      ok: true,
      activated: true,
      version: nextVersion,
      previousVersion: current.version,
      devicesSeen: check.devices,
      usedVision: Boolean(screenshot),
    })
  } catch (err) {
    console.error('[watchdog-repair]', err)
    return json({ error: (err as Error).message || 'internal error' }, 500)
  }
})

/** GET each observed endpoint once and keep a trimmed sample of the body. */
async function sampleEndpoints(
  observed: any[],
  session: { headers: Record<string, string>; apiBase: string },
  limit: number,
): Promise<{ path: string; method: string; sample: unknown }[]> {
  const out: { path: string; method: string; sample: unknown }[] = []
  for (const ep of observed) {
    if (out.length >= limit) break
    if ((ep.method || 'GET').toUpperCase() !== 'GET') continue
    if (ep.pathTemplate?.includes('{')) continue // needs an id we don't have

    try {
      const res = await fetch(new URL(ep.pathTemplate, ep.origin || session.apiBase).toString(), {
        headers: session.headers,
      })
      if (!res.ok) continue
      const body = await res.json()
      out.push({ path: ep.pathTemplate, method: 'GET', sample: trim(body) })
    } catch { /* an endpoint that won't answer just isn't a useful sample */ }
  }
  return out
}

/** Keep response samples small — two array elements is enough to infer a schema. */
function trim(value: any, depth = 0): any {
  if (Array.isArray(value)) return value.slice(0, 2).map(v => trim(v, depth + 1))
  if (value && typeof value === 'object') {
    if (depth > 5) return '…'
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([k, v]) => [k, trim(v, depth + 1)]))
  }
  if (typeof value === 'string' && value.length > 120) return `${value.slice(0, 120)}…`
  return value
}

async function proposeConfig(input: {
  companyId: number
  reason: string
  current: ExtractorConfig
  observed: any[]
  samples: { path: string; method: string; sample: unknown }[]
  screenshot: string | null
  req: Request
}): Promise<{ ok: true; config: any; confidence?: number; notes?: string } | { ok: false; error: string }> {
  const system = `You repair the integration config for a GPS fleet-tracking provider's private web API.

The provider changed something and our extractor broke. You get: the config that used to work, the endpoints their web app is calling RIGHT NOW (captured live during a real login), and sample response bodies from those endpoints.

Produce a corrected config. Rules:
- Prefer evidence over invention. Every endpoint path you output must appear in the observed list. Never guess a URL.
- field_map values are ARRAYS of candidate source keys, tried in order. Keep the old candidates and add new ones rather than replacing — old aliases may still be live on other endpoints.
- Dot paths are supported for nested fields ("location.lat").
- resultPath is the dot path to the ARRAY in a response. Omit it if the response is already an array.
- If you cannot determine something, keep the current value. A partial correct repair beats a confident wrong one.
- Report honest confidence. If the evidence is thin, say so with a low number.

Target field names you must map, where the provider exposes them:
  position: device_id, recorded_at, latitude, longitude, speed, heading, ignition, fuel_percent, battery_percent, odometer, address
  trip:     external_id, device_id, started_at, ended_at, start_latitude, start_longitude, end_latitude, end_longitude,
            start_address, end_address, distance_miles, duration_seconds, idle_seconds, max_speed, avg_speed,
            harsh_brake_count, harsh_accel_count, speeding_count
  alert:    external_id, device_id, alert_type, severity, occurred_at, latitude, longitude, speed, message

Required actions in endpoints: "devices" (live positions). Include "trips" and "alerts" when the observed list supports them. "trips" may use {start_date}/{end_date} query placeholders.`

  const content: any[] = [{
    type: 'text',
    text: `Break reason: ${input.reason}

CURRENT CONFIG (version ${input.current.version}):
${JSON.stringify({
  api_base: input.current.api_base,
  endpoints: input.current.endpoints,
  field_map: input.current.field_map,
}, null, 2)}

ENDPOINTS OBSERVED DURING A LIVE LOGIN JUST NOW:
${JSON.stringify(input.observed, null, 2)}

SAMPLE RESPONSES:
${JSON.stringify(input.samples, null, 2)}`,
  }]

  if (input.screenshot) {
    content.push({
      type: 'text',
      text: 'The JSON evidence was thin, so here is a screenshot of the provider\'s live tracking page for context:',
    })
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: input.screenshot },
    })
  }

  const result = await callAnthropic(
    { feature: 'watchdog-repair', companyId: input.companyId, req: input.req },
    {
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content }],
      tools: [{
        name: 'propose_config',
        description: 'Return the corrected extractor config.',
        input_schema: {
          type: 'object',
          properties: {
            api_base: { type: 'string' },
            endpoints: {
              type: 'object',
              description: 'action -> {method, path, query, resultPath}',
              additionalProperties: {
                type: 'object',
                properties: {
                  method: { type: 'string' },
                  path: { type: 'string' },
                  query: { type: 'object', additionalProperties: { type: 'string' } },
                  resultPath: { type: 'string' },
                },
                required: ['path'],
              },
            },
            field_map: {
              type: 'object',
              description: 'group (position|trip|alert) -> target field -> array of candidate source keys',
              additionalProperties: {
                type: 'object',
                additionalProperties: { type: 'array', items: { type: 'string' } },
              },
            },
            confidence: { type: 'number', description: '0-1, honest' },
            notes: { type: 'string', description: 'what changed and what you were unsure about' },
          },
          required: ['endpoints', 'field_map', 'confidence'],
        },
      }],
      tool_choice: { type: 'tool', name: 'propose_config' },
    },
  )

  if (!result.ok) return { ok: false, error: result.friendly || `model call failed (${result.status})` }

  const block = (result.data?.content || []).find((c: any) => c.type === 'tool_use' && c.name === 'propose_config')
  if (!block?.input) return { ok: false, error: 'model returned no config' }

  return {
    ok: true,
    config: block.input,
    confidence: block.input.confidence,
    notes: block.input.notes,
  }
}

/**
 * A candidate is only good if it actually produces usable data: real
 * devices, with coordinates, that normalize cleanly. Anything less and
 * we keep the broken config, which at least fails loudly.
 */
async function validate(
  candidate: ExtractorConfig,
  session: { headers: Record<string, string>; apiBase: string },
  companyId: number,
): Promise<{ ok: boolean; devices: number; detail: string }> {
  try {
    const rows = await tier0('devices', candidate, { ...session, apiBase: candidate.api_base || session.apiBase })
    if (!rows.length) return { ok: false, devices: 0, detail: 'devices endpoint returned no rows' }

    const normalized = rows
      .map(r => normalizePosition(r, candidate.field_map?.position || {}, companyId))
      .filter(Boolean) as any[]

    if (!normalized.length) {
      return { ok: false, devices: rows.length, detail: 'rows returned but none had a resolvable device_id' }
    }

    const located = normalized.filter(p => p.latitude !== null && p.longitude !== null)
    if (!located.length) {
      return { ok: false, devices: rows.length, detail: 'devices resolved but no coordinates mapped' }
    }

    return {
      ok: true,
      devices: rows.length,
      detail: `${rows.length} devices, ${located.length} with coordinates`,
    }
  } catch (err) {
    return { ok: false, devices: 0, detail: `validation threw: ${(err as Error).message}` }
  }
}

async function nextConfigVersion(): Promise<number> {
  const rows = await pg('fleet_extractor_config?provider=eq.moto_watchdog&select=version&order=version.desc&limit=1')
  return (rows?.[0]?.version ?? 0) + 1
}
