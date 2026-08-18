// =====================================================================
// watchdog-connect — connect, test, or revoke a customer's Moto Watchdog
// account.
//
// The browser can't write fleet_integrations directly: that table holds
// third-party credentials and has no policy for `authenticated`, so RLS
// denies it outright. Everything goes through here, with the service
// role, which means the password exists in plaintext for exactly one
// request and is stored only as pgp_sym_encrypt ciphertext.
//
// Connecting VERIFIES before it stores. A saved-but-wrong password would
// show as "connected" and then quietly fail on the next cron run, hours
// later, with nobody watching — so we sign in first and only persist
// once we've seen it work.
// =====================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { resolveCompanyId } from '../_shared/auth.ts'
import { loadExtractorConfig, pg, rpc } from '../_shared/watchdog.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const LOGIN_SERVICE_URL = Deno.env.get('WATCHDOG_LOGIN_SERVICE_URL') || ''
const LOGIN_SERVICE_SECRET = Deno.env.get('LOGIN_SERVICE_SECRET') || ''

const CONSENT_VERSION = '2026-08-07'

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const companyId = await resolveCompanyId(req, SUPABASE_URL, SERVICE_KEY)
    if (!companyId) return json({ error: 'Sign in first.' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = body?.action || 'connect'

    if (action === 'disconnect') return await disconnect(companyId)
    if (action === 'connect') return await connect(companyId, body, req)

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('[watchdog-connect]', err)
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
})

async function connect(companyId: number, body: any, req: Request): Promise<Response> {
  const email = String(body.email || '').trim()
  const password = String(body.password || '')

  if (!email || !password) return json({ error: 'Email and password are required.' }, 400)
  if (body.consent !== true) {
    return json({ error: 'We need your permission before connecting the account.' }, 400)
  }
  if (!LOGIN_SERVICE_URL || !LOGIN_SERVICE_SECRET) {
    return json({ error: 'GPS mirroring is not configured on this environment yet.' }, 503)
  }

  const config = await loadExtractorConfig()
  if (!config?.login?.url) {
    return json({ error: 'No provider sign-in configuration is set up yet.' }, 503)
  }

  // Verify by actually signing in.
  const res = await fetch(`${LOGIN_SERVICE_URL.replace(/\/$/, '')}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-secret': LOGIN_SERVICE_SECRET },
    body: JSON.stringify({ email, password, config: config.login }),
  })
  const out = await res.json().catch(() => ({}))

  if (!res.ok || !out?.ok) {
    // 422 is "your credentials didn't work" — the user can fix that.
    // Anything else is our problem, and shouldn't read like their mistake.
    const theirFault = res.status === 422
    return json({
      error: theirFault
        ? (out?.error || 'That email and password didn\'t work on Moto Watchdog.')
        : 'We couldn\'t reach Moto Watchdog just now. Try again in a minute.',
      detail: theirFault ? undefined : out?.error,
    }, theirFault ? 400 : 502)
  }

  const encrypt = async (value: string | null) =>
    value ? await rpc('encrypt_fleet_cred', { p_value: value }) : null

  const now = new Date().toISOString()
  const record = {
    company_id: companyId,
    provider: 'moto_watchdog',
    account_email: email,
    password_encrypted: await encrypt(password),
    auth_mode: 'mirror',
    session_token_encrypted: await encrypt(out.authHeaderValue || null),
    session_carrier: out.carrier === 'header' ? 'header' : 'cookie',
    session_data: {
      authHeaderName: out.authHeaderName || null,
      cookies: out.cookies || [],
      localStorageTokens: out.localStorageTokens || {},
      observedEndpoints: out.observedEndpoints || [],
    },
    session_expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
    api_base: out.apiBase || config.api_base,
    status: 'connected',
    last_error: null,
    last_error_at: null,
    consent_at: now,
    consent_by: await employeeIdFor(req, companyId),
    consent_ip: clientIp(req),
    consent_version: CONSENT_VERSION,
    revoked_at: null,
    updated_at: now,
  }

  await pg('fleet_integrations?on_conflict=company_id,provider', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([record]),
  })

  // Kick off the first pull now so the map isn't empty when they click
  // through from Settings. Fire-and-forget — a slow first sync shouldn't
  // hold up the "connected" confirmation.
  fetch(`${SUPABASE_URL}/functions/v1/watchdog-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ company_id: companyId }),
  }).catch(() => {})

  return json({
    ok: true,
    connected: true,
    account_email: email,
    devicesVisible: (out.observedEndpoints || []).length > 0,
  })
}

/**
 * Revoke: wipe the credentials, don't just flag the row.
 *
 * If someone withdraws permission, the honest thing is that we no longer
 * hold their password — not that we hold it behind a boolean. The cached
 * telemetry stays (it's their operational history, and deleting it would
 * blow away trip records they may still need); the keys to the account
 * do not.
 */
async function disconnect(companyId: number): Promise<Response> {
  await pg(`fleet_integrations?company_id=eq.${companyId}&provider=eq.moto_watchdog`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      password_encrypted: null,
      session_token_encrypted: null,
      session_data: null,
      session_expires_at: null,
      status: 'disconnected',
      revoked_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    }),
  })
  return json({ ok: true, connected: false })
}

async function employeeIdFor(req: Request, companyId: number): Promise<number | null> {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const email = (payload?.email || '').toLowerCase()
    if (!email) return null
    const rows = await pg(
      `employees?company_id=eq.${companyId}&email=ilike.${encodeURIComponent(email)}&select=id&limit=1`,
    )
    return rows?.[0]?.id ?? null
  } catch {
    return null
  }
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded ? forwarded.split(',')[0].trim() : null
}
