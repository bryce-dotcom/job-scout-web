// =====================================================================
// Provider mirroring for Freddy's fleet data.
//
// Moto Watchdog's partner API needs a per-customer AUTH_TOKEN that they
// won't issue, so we read the same JSON API their own web app reads,
// using the customer's own connected account.
//
// Three ways to get the data, cheapest first:
//
//   Tier 0 — session replay. Call the provider's JSON endpoints directly
//            with the customer's session. Plain fetch, no LLM, no
//            browser. This is where ~all traffic should live.
//
//   Tier 1 — DOM extraction. Load the page with the session restored and
//            pull values out of the markup. Still no LLM. Only needed
//            for anything the API doesn't expose.
//
//   Tier 2 — vision. Screenshot the page and let Claude read it.
//
// The interesting part is what tier 2 is FOR. It's not the data path —
// paying an LLM to read a map every five minutes would be absurd. It's
// the REPAIR path: when the provider ships a redesign and tier 0 breaks,
// tier 2 reads the new page once, re-derives the endpoints and field
// mappings, writes a new fleet_extractor_config, and the free tiers pick
// up again. Vision is how the scraper heals, not how it runs.
//
// Everything provider-specific — URLs, selectors, field names — lives in
// fleet_extractor_config, never in this file. That's the property that
// makes self-healing possible: a fix is a row, not a deploy.
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const LOGIN_SERVICE_URL = Deno.env.get('WATCHDOG_LOGIN_SERVICE_URL') || ''
const LOGIN_SERVICE_SECRET = Deno.env.get('LOGIN_SERVICE_SECRET') || ''
const PARTNER_KEY = Deno.env.get('WATCHDOG_PARTNER_KEY') || ''
// The path prefix matters and was missing. Watchdog's public docs page shows
// "Base URL: https://partner.api.motowatchdog.com" with paths listed as
// /devices, /trips, etc. — but the real endpoints, per the in-app developer
// docs, are /partner/api/v1/devices. The original proxy concatenated the host
// with the bare paths, so every partner call would have 404'd even with a
// valid token.
const PARTNER_BASE = 'https://partner.api.motowatchdog.com/partner/api/v1'

export interface ExtractorConfig {
  id: number
  version: number
  api_base: string | null
  login: Record<string, any>
  endpoints: Record<string, EndpointSpec>
  field_map: Record<string, Record<string, string[]>>
  selectors: Record<string, any>
}

export interface EndpointSpec {
  method?: string
  path: string
  query?: Record<string, string>
  /** Dot path to the array in the response, e.g. "data.devices". */
  resultPath?: string
}

export interface Integration {
  id: number
  company_id: number
  provider: string
  account_email: string | null
  auth_mode: 'partner' | 'mirror'
  status: string
  session_carrier: 'bearer' | 'cookie' | 'header' | null
  session_expires_at: string | null
  api_base: string | null
  sync_interval_seconds: number
  // Decrypted on demand — never selected by default.
  password?: string | null
  partnerToken?: string | null
  sessionToken?: string | null
  sessionData?: any
}

// ---------------------------------------------------------------------
// Postgres helpers (service role — these functions never run as a user)
// ---------------------------------------------------------------------

async function pg(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`db ${res.status}: ${await res.text()}`)
  // Every write here sends Prefer: return=minimal, and PostgREST answers those
  // with an empty body — 204 for PATCH but 201 for POST. Keying on the status
  // code missed the 201 case and threw "Unexpected end of JSON input" on all
  // inserts, which surfaced as a sync that reported an error while having
  // fetched everything correctly. Decide on the body, not the code.
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`)
  return await res.json()
}

export async function loadExtractorConfig(provider = 'moto_watchdog'): Promise<ExtractorConfig | null> {
  const rows = await pg(
    `fleet_extractor_config?provider=eq.${provider}&active=is.true&select=id,version,api_base,login,endpoints,field_map,selectors&limit=1`,
  )
  return rows?.[0] ?? null
}

/**
 * Load an integration and decrypt its secrets.
 *
 * The ciphertext columns are never handed to the browser — decryption
 * happens here, with the service role, and the plaintext lives only for
 * the duration of the request.
 */
export async function loadIntegration(companyId: number, provider = 'moto_watchdog'): Promise<Integration | null> {
  const rows = await pg(
    `fleet_integrations?company_id=eq.${companyId}&provider=eq.${provider}&select=*&limit=1`,
  )
  const row = rows?.[0]
  if (!row) return null
  if (row.revoked_at) return null

  const decrypt = async (b64: string | null) => {
    if (!b64) return null
    try {
      return await rpc('decrypt_fleet_cred', { p_value: b64 })
    } catch {
      // A credential we can't decrypt is the same as no credential — let
      // the caller fall through to needs_reauth rather than throwing.
      return null
    }
  }

  return {
    ...row,
    password: await decrypt(row.password_encrypted),
    partnerToken: await decrypt(row.partner_auth_token_encrypted),
    sessionToken: await decrypt(row.session_token_encrypted),
    sessionData: row.session_data,
  }
}

export async function updateIntegration(id: number, patch: Record<string, unknown>): Promise<void> {
  await pg(`fleet_integrations?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
}

export async function markError(id: number, message: string, needsReauth = false): Promise<void> {
  await updateIntegration(id, {
    status: needsReauth ? 'needs_reauth' : 'error',
    last_error: message.slice(0, 500),
    last_error_at: new Date().toISOString(),
  })
}

// ---------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------

function sessionIsFresh(integration: Integration): boolean {
  if (!integration.sessionToken && !integration.sessionData) return false
  if (!integration.session_expires_at) return false
  // Refresh a few minutes early — a session that dies mid-sync costs a
  // whole cycle, and re-login is cheap.
  return new Date(integration.session_expires_at).getTime() - Date.now() > 5 * 60_000
}

/**
 * Return a session we can replay, logging in through the browser service
 * only if the stored one is missing or stale.
 *
 * This is the function that keeps the cost story honest: it should hit
 * the browser roughly once per company per session lifetime, and hit
 * nothing at all on every other call.
 */
export async function ensureSession(
  integration: Integration,
  config: ExtractorConfig,
): Promise<{ headers: Record<string, string>; apiBase: string; refreshed: boolean }> {
  if (sessionIsFresh(integration)) {
    return {
      headers: sessionHeaders(integration),
      apiBase: integration.api_base || config.api_base || '',
      refreshed: false,
    }
  }

  if (!LOGIN_SERVICE_URL || !LOGIN_SERVICE_SECRET) {
    throw new Error('login service is not configured (WATCHDOG_LOGIN_SERVICE_URL / LOGIN_SERVICE_SECRET)')
  }
  if (!integration.account_email || !integration.password) {
    throw new Error('no stored credentials — the customer needs to reconnect their account')
  }

  const res = await fetch(`${LOGIN_SERVICE_URL.replace(/\/$/, '')}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-secret': LOGIN_SERVICE_SECRET },
    body: JSON.stringify({
      email: integration.account_email,
      password: integration.password,
      config: config.login,
    }),
  })

  const out = await res.json().catch(() => ({}))
  if (!res.ok || !out?.ok) {
    const needsReauth = res.status === 422 || out?.needsReauth === true
    await markError(integration.id, out?.error || `login failed (${res.status})`, needsReauth)
    throw new Error(out?.error || `login failed (${res.status})`)
  }

  // Providers rarely tell us when a session dies. Assume a conservative
  // 12 hours; an expired session surfaces as a 401 on the next pull and
  // triggers a re-login anyway, so guessing short is the safe direction.
  const expiresAt = new Date(Date.now() + 12 * 3600_000).toISOString()
  const apiBase = out.apiBase || config.api_base || ''

  const carrier: Integration['session_carrier'] = out.carrier === 'header' ? 'header' : 'cookie'
  const token = out.authHeaderValue || null

  await updateIntegration(integration.id, {
    session_token_encrypted: token ? await rpc('encrypt_fleet_cred', { p_value: token }) : null,
    session_carrier: carrier,
    session_data: {
      authHeaderName: out.authHeaderName || null,
      cookies: out.cookies || [],
      localStorageTokens: out.localStorageTokens || {},
      observedEndpoints: out.observedEndpoints || [],
    },
    session_expires_at: expiresAt,
    api_base: apiBase,
    status: 'connected',
    last_error: null,
    last_error_at: null,
  })

  integration.sessionToken = token
  integration.sessionData = {
    authHeaderName: out.authHeaderName || null,
    cookies: out.cookies || [],
    localStorageTokens: out.localStorageTokens || {},
  }
  integration.session_carrier = carrier
  integration.api_base = apiBase

  return { headers: sessionHeaders(integration), apiBase, refreshed: true }
}

function sessionHeaders(integration: Integration): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const data = integration.sessionData || {}

  if (integration.sessionToken && data.authHeaderName) {
    headers[data.authHeaderName] = integration.sessionToken
  } else if (integration.sessionToken) {
    headers['Authorization'] = integration.sessionToken
  }

  if (Array.isArray(data.cookies) && data.cookies.length) {
    headers['Cookie'] = data.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')
  }
  return headers
}

// ---------------------------------------------------------------------
// Tier 0 — session replay
// ---------------------------------------------------------------------

export class SessionExpired extends Error {}

/**
 * Call one configured endpoint and return the array it yields.
 *
 * A 401/403 here means the session died early; we throw SessionExpired so
 * the caller can re-login once and retry rather than writing an empty
 * result and calling it a successful sync.
 */
export async function tier0(
  action: string,
  config: ExtractorConfig,
  session: { headers: Record<string, string>; apiBase: string },
  params: Record<string, string | number> = {},
): Promise<any[]> {
  const spec = config.endpoints?.[action]
  if (!spec) throw new Error(`no endpoint configured for action "${action}"`)

  const path = spec.path.replace(/\{(\w+)\}/g, (_m, key) => encodeURIComponent(String(params[key] ?? '')))
  const url = new URL(path, session.apiBase)
  for (const [k, template] of Object.entries(spec.query || {})) {
    const value = template.replace(/\{(\w+)\}/g, (_m, key) => String(params[key] ?? ''))
    if (value !== '') url.searchParams.set(k, value)
  }

  const res = await fetch(url.toString(), { method: spec.method || 'GET', headers: session.headers })

  if (res.status === 401 || res.status === 403) throw new SessionExpired(`${res.status} on ${action}`)
  if (!res.ok) throw new Error(`${action} failed: ${res.status} ${(await res.text()).slice(0, 200)}`)

  const body = await res.json()
  const data = spec.resultPath ? dig(body, spec.resultPath) : body
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') return [data]
  return []
}

/** Run an action, re-logging in once if the session turns out to be dead. */
export async function tier0WithRetry(
  action: string,
  integration: Integration,
  config: ExtractorConfig,
  session: { headers: Record<string, string>; apiBase: string },
  params: Record<string, string | number> = {},
): Promise<{ rows: any[]; session: typeof session; relogged: boolean }> {
  try {
    return { rows: await tier0(action, config, session, params), session, relogged: false }
  } catch (err) {
    if (!(err instanceof SessionExpired)) throw err
    integration.session_expires_at = null // force ensureSession to re-login
    const fresh = await ensureSession(integration, config)
    return { rows: await tier0(action, config, fresh, params), session: fresh, relogged: true }
  }
}

// ---------------------------------------------------------------------
// Tier 1 — DOM extraction
// ---------------------------------------------------------------------

/**
 * Render a page with the session restored and pull values out with the
 * configured selectors. No LLM. Used for anything the JSON API doesn't
 * expose, and as the first thing to try when tier 0 breaks.
 */
export async function tier1(
  action: string,
  integration: Integration,
  config: ExtractorConfig,
): Promise<{ rows: any[]; html: string; screenshotBase64: string }> {
  const spec = config.selectors?.[action]
  if (!spec?.url) throw new Error(`no tier-1 selector config for action "${action}"`)

  const capture = await capturePage(integration, new URL(spec.url, integration.api_base || config.api_base || '').toString())

  // Deliberately regex-based rather than a DOM parse: Deno has no DOM, and
  // pulling in a parser for this is more weight than the fallback deserves.
  // Tier 1 is a stopgap between "tier 0 broke" and "vision fixed it".
  const rows: any[] = []
  const rowRe = new RegExp(spec.rowPattern, 'gi')
  let match: RegExpExecArray | null
  while ((match = rowRe.exec(capture.html)) !== null) {
    rows.push(match.groups ? { ...match.groups } : { value: match[1] })
    if (rows.length > 1000) break
  }

  return { rows, html: capture.html, screenshotBase64: capture.screenshotBase64 }
}

export async function capturePage(
  integration: Integration,
  url: string,
): Promise<{ html: string; screenshotBase64: string; url: string }> {
  if (!LOGIN_SERVICE_URL || !LOGIN_SERVICE_SECRET) {
    throw new Error('login service is not configured')
  }
  const data = integration.sessionData || {}
  const res = await fetch(`${LOGIN_SERVICE_URL.replace(/\/$/, '')}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-secret': LOGIN_SERVICE_SECRET },
    body: JSON.stringify({
      url,
      cookies: data.cookies || [],
      authHeaderName: data.authHeaderName || null,
      authHeaderValue: integration.sessionToken || null,
      localStorageTokens: data.localStorageTokens || {},
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok || !out?.ok) throw new Error(out?.error || `capture failed (${res.status})`)
  return { html: out.html || '', screenshotBase64: out.screenshotBase64 || '', url: out.url || url }
}

// ---------------------------------------------------------------------
// Partner API (kept intact for if/when Watchdog starts issuing tokens)
// ---------------------------------------------------------------------

export async function partnerFetch(
  path: string,
  authToken: string,
  init: RequestInit = {},
): Promise<Response> {
  return await fetch(`${PARTNER_BASE}${path}`, {
    ...init,
    headers: {
      AUTH_TOKEN: authToken,
      PARTNER: PARTNER_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

export const partnerConfigured = () => Boolean(PARTNER_KEY)

// ---------------------------------------------------------------------
// Normalization
//
// Provider payloads get mapped onto our columns through field_map, which
// lists candidate source keys per target field:
//
//   { "position": { "latitude": ["lat", "latitude", "location.lat"] } }
//
// Candidates rather than a single key because providers are inconsistent
// across endpoints (a device's live position and a trip's start point
// rarely agree on naming), and because it lets the vision repair add a
// new alias without breaking the old one.
// ---------------------------------------------------------------------

export function dig(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}

export function pick(row: any, candidates: string[] | undefined, fallback: any = null): any {
  if (!candidates) return fallback
  for (const key of candidates) {
    const value = key.includes('.') ? dig(row, key) : row?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const bool = (v: any): boolean | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v
  return /^(1|true|on|yes|running)$/i.test(String(v))
}

const ts = (v: any): string | null => {
  if (!v) return null
  // Providers send seconds, milliseconds, or ISO strings interchangeably.
  const n = Number(v)
  if (Number.isFinite(n) && n > 0) {
    const ms = n > 1e12 ? n : n * 1000
    return new Date(ms).toISOString()
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** km/h -> mph when the provider reports metric. */
const speed = (value: any, unit: string | undefined): number | null => {
  const n = num(value)
  if (n === null) return null
  return /kph|kmh|km\/h|metric/i.test(unit || '') ? Math.round(n * 0.621371 * 100) / 100 : n
}

export function normalizePosition(row: any, map: Record<string, string[]>, companyId: number, units?: string) {
  const deviceId = pick(row, map.device_id)
  if (!deviceId) return null
  return {
    company_id: companyId,
    device_id: String(deviceId),
    recorded_at: ts(pick(row, map.recorded_at)) || new Date().toISOString(),
    latitude: num(pick(row, map.latitude)),
    longitude: num(pick(row, map.longitude)),
    speed_mph: speed(pick(row, map.speed), units),
    heading: num(pick(row, map.heading)),
    ignition: bool(pick(row, map.ignition)),
    fuel_percent: num(pick(row, map.fuel_percent)),
    battery_percent: num(pick(row, map.battery_percent)),
    odometer: num(pick(row, map.odometer)),
    address: pick(row, map.address),
    raw: row,
  }
}

export function normalizeTrip(row: any, map: Record<string, string[]>, companyId: number, units?: string) {
  const externalId = pick(row, map.external_id)
  if (!externalId) return null
  const startedAt = ts(pick(row, map.started_at))
  const endedAt = ts(pick(row, map.ended_at))

  let duration = num(pick(row, map.duration_seconds))
  if (duration === null && startedAt && endedAt) {
    duration = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  }

  let distance = num(pick(row, map.distance_miles))
  if (distance !== null && /km|metric/i.test(units || '')) distance = Math.round(distance * 0.621371 * 100) / 100

  return {
    company_id: companyId,
    external_id: String(externalId),
    device_id: pick(row, map.device_id) ? String(pick(row, map.device_id)) : null,
    started_at: startedAt,
    ended_at: endedAt,
    start_latitude: num(pick(row, map.start_latitude)),
    start_longitude: num(pick(row, map.start_longitude)),
    end_latitude: num(pick(row, map.end_latitude)),
    end_longitude: num(pick(row, map.end_longitude)),
    start_address: pick(row, map.start_address),
    end_address: pick(row, map.end_address),
    distance_miles: distance,
    duration_seconds: duration,
    idle_seconds: num(pick(row, map.idle_seconds)),
    max_speed_mph: speed(pick(row, map.max_speed), units),
    avg_speed_mph: speed(pick(row, map.avg_speed), units),
    harsh_brake_count: num(pick(row, map.harsh_brake_count)),
    harsh_accel_count: num(pick(row, map.harsh_accel_count)),
    speeding_count: num(pick(row, map.speeding_count)),
    raw: row,
  }
}

export function normalizeAlert(row: any, map: Record<string, string[]>, companyId: number, units?: string) {
  const externalId = pick(row, map.external_id)
  if (!externalId) return null
  return {
    company_id: companyId,
    external_id: String(externalId),
    device_id: pick(row, map.device_id) ? String(pick(row, map.device_id)) : null,
    alert_type: pick(row, map.alert_type),
    severity: pick(row, map.severity),
    occurred_at: ts(pick(row, map.occurred_at)),
    latitude: num(pick(row, map.latitude)),
    longitude: num(pick(row, map.longitude)),
    speed_mph: speed(pick(row, map.speed), units),
    message: pick(row, map.message),
    raw: row,
  }
}

/**
 * Attach our fleet.id to rows keyed by the provider's device id.
 *
 * The link is fleet.gps_device_id, set when a user links a tracker on the
 * vehicle detail screen. Rows for unlinked devices still get stored —
 * they're real telemetry, and the user may link the vehicle later, at
 * which point the history is already there.
 */
export async function attachFleetIds<T extends { device_id: string | null }>(
  rows: T[],
  companyId: number,
): Promise<(T & { fleet_id: number | null })[]> {
  const ids = [...new Set(rows.map(r => r.device_id).filter(Boolean))] as string[]
  if (!ids.length) return rows.map(r => ({ ...r, fleet_id: null }))

  const list = ids.map(id => `"${id.replace(/"/g, '')}"`).join(',')
  const fleet = await pg(`fleet?company_id=eq.${companyId}&gps_device_id=in.(${list})&select=id,gps_device_id`)
  const byDevice = new Map<string, number>((fleet || []).map((f: any) => [f.gps_device_id, f.id]))

  return rows.map(r => ({ ...r, fleet_id: r.device_id ? byDevice.get(r.device_id) ?? null : null }))
}

/** Upsert on a table's natural key. */
export async function upsert(table: string, rows: any[], onConflict: string): Promise<number> {
  if (!rows.length) return 0
  let written = 0
  // Chunked so one oversized sync can't blow the request body limit.
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    await pg(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    })
    written += chunk.length
  }
  return written
}

export { pg, rpc }
