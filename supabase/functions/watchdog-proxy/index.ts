// =====================================================================
// watchdog-proxy — the one door Freddy's pages knock on for GPS data.
//
// The response contract is unchanged from the original partner-API-only
// version ({devices:[...]}, {trips:[...]}, {alerts:[...]}, ...), so the
// Freddy pages keep working whichever source is behind it. What changed
// underneath:
//
//   1. IT NOW REQUIRES AUTH. The old version took an auth_token straight
//      off the request body and applied our PARTNER key to it, with no
//      JWT check and no company_id anywhere. Anyone who knew the URL
//      could spend our partner credentials. Credentials are now resolved
//      server-side from the caller's company; a token in the body is
//      ignored.
//
//   2. It reads from the mirror cache by default. Watchdog won't issue
//      per-customer partner tokens, so most tenants are served from the
//      fleet_* tables that watchdog-sync fills. Companies that DO have a
//      partner token still go straight to the partner API — if Watchdog
//      ever relents, nothing here needs to change.
//
//   3. Geofence writes work again. The old switch read params?.data and
//      params?.geofence_id while the client sent those fields flat on
//      the body, so create/update/delete/logs silently did nothing —
//      the handlers only console.error'd, so it looked like a no-op
//      rather than a failure.
// =====================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { resolveCompanyId } from '../_shared/auth.ts'
import { loadIntegration, partnerFetch, partnerConfigured, pg } from '../_shared/watchdog.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Platform-account mode. One JobScout-owned Moto Watchdog company holds every
// customer's tracker, with a single API subscription and a single AUTH_TOKEN.
// Tenant separation is ours to enforce, not Watchdog's: their API has no
// account dimension at all (the Device schema carries no company/owner field),
// so this token sees EVERY device in the platform company.
//
// That makes the device whitelist below the entire tenant boundary. It is
// default-deny on purpose — an action that can't be scoped to the caller's
// own devices is refused rather than passed through.
const PLATFORM_TOKEN = Deno.env.get('WATCHDOG_PLATFORM_AUTH_TOKEN') || ''

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
    const body = await req.json().catch(() => ({}))
    const action = body?.action
    if (!action) return json({ error: 'action is required' }, 400)

    // Params may arrive nested ({params:{...}}) or flat on the body —
    // FreddyAlerts sends them flat. Accept both.
    const params = { ...(body || {}), ...(body?.params || {}) }

    const companyId = await resolveCompanyId(req, SUPABASE_URL, SERVICE_KEY)
    if (!companyId) {
      return json({ error: 'Sign in to access fleet tracking.' }, 401)
    }

    const integration = await loadIntegration(companyId)
    const partnerToken = integration?.partnerToken || (await legacyPartnerToken(companyId))

    // Three sources, same envelopes out of all of them:
    //   1. the tenant's own partner token (they bought API access themselves)
    //   2. the shared platform token, filtered to their devices
    //   3. the mirror cache
    if (partnerToken && partnerConfigured()) {
      return await viaPartner(action, params, partnerToken)
    }

    // Platform mode reads the cache, not the provider.
    //
    // Calling the API per client request would mean pulling the whole
    // platform account (every tenant's trackers) on every dispatcher's
    // 60-second map refresh, then throwing away all but their own. The
    // global sync in watchdog-sync already pulls once and writes rows
    // stamped with company_id, so serving those rows is both cheaper and
    // safer — separation comes from the same tenant_isolation policy that
    // protects every other table, instead of a filter written by hand here.
    if (PLATFORM_TOKEN && partnerConfigured()) {
      return await viaMirror(action, params, companyId, integration?.last_sync_at ?? null)
    }

    if (!integration || integration.status === 'disconnected') {
      return json({
        error: 'Connect your Moto Watchdog account in Freddy Settings to see live tracking.',
        needsSetup: true,
      }, 400)
    }
    if (integration.status === 'needs_reauth') {
      return json({
        error: 'Your Moto Watchdog sign-in stopped working. Reconnect the account in Freddy Settings.',
        needsReauth: true,
      }, 400)
    }

    return await viaMirror(action, params, companyId, integration.last_sync_at)
  } catch (err) {
    console.error('[watchdog-proxy]', err)
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
})

/**
 * Companies configured before fleet_integrations existed kept their token
 * in company_agents.settings. Keep honouring it so nobody's tracking
 * breaks on deploy — but read it server-side rather than trusting a
 * token handed to us by the browser.
 */
async function legacyPartnerToken(companyId: number): Promise<string | null> {
  try {
    const rows = await pg(
      `company_agents?company_id=eq.${companyId}&select=settings,agent:agents(slug)`,
    )
    const row = (rows || []).find((r: any) => r.agent?.slug === 'freddy-fleet')
    const token = row?.settings?.watchdog_auth_token
    return typeof token === 'string' && token.trim() ? token.trim() : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------
// Partner API passthrough
// ---------------------------------------------------------------------

function partnerRoute(action: string, params: Record<string, any>):
  { path: string; method: string; body?: string } | null {
  const p = (v: unknown) => encodeURIComponent(String(v ?? ''))
  // Writes may carry their payload as params.data or as loose fields on
  // the body; strip the routing keys and send whatever's left.
  const payload = params.data ?? stripRoutingKeys(params)

  switch (action) {
    case 'devices':             return { path: '/devices', method: 'GET' }
    case 'device_trips':        return { path: `/devices/${p(params.device_id)}/trips`, method: 'GET' }
    case 'device_alerts':       return { path: `/devices/${p(params.device_id)}/alerts`, method: 'GET' }
    case 'device_geofences':    return { path: `/devices/${p(params.device_id)}/geofences`, method: 'GET' }
    case 'device_engine_logs':  return { path: `/devices/${p(params.device_id)}/engine_change_logs`, method: 'GET' }
    case 'update_device':       return { path: `/devices/${p(params.device_id)}`, method: 'PUT', body: JSON.stringify(payload) }

    case 'alerts':              return { path: '/alerts', method: 'GET' }

    case 'geofences':           return { path: '/geofences', method: 'GET' }
    case 'create_geofence':     return { path: '/geofences', method: 'POST', body: JSON.stringify(payload) }
    case 'update_geofence':     return { path: `/geofences/${p(params.geofence_id)}`, method: 'PUT', body: JSON.stringify(payload) }
    case 'delete_geofence':     return { path: `/geofences/${p(params.geofence_id)}`, method: 'DELETE' }
    case 'geofence_logs':       return { path: `/geofences/${p(params.geofence_id)}/logs`, method: 'GET' }

    case 'trips':               return { path: '/trips', method: 'GET' }
    case 'trips_in_progress':   return { path: '/trips/in_progress', method: 'GET' }
    case 'trips_completed':     return { path: '/trips/completed', method: 'GET' }
    case 'trips_between': {
      const qs = new URLSearchParams()
      if (params.start_date) qs.set('start_date', params.start_date)
      if (params.end_date) qs.set('end_date', params.end_date)
      return { path: `/trips/between?${qs}`, method: 'GET' }
    }
    case 'trip_detail':         return { path: `/trips/${p(params.trip_id)}`, method: 'GET' }
    case 'trip_locations':      return { path: `/trips/${p(params.trip_id)}/locations`, method: 'GET' }

    case 'analytics':           return { path: '/analytics', method: 'GET' }
    case 'webhook_analytics':   return { path: '/webhooks/analytics', method: 'GET' }

    default: return null
  }
}

const ROUTING_KEYS = new Set(['action', 'auth_token', 'params', 'device_id', 'geofence_id', 'trip_id'])
function stripRoutingKeys(params: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(params).filter(([k]) => !ROUTING_KEYS.has(k)))
}

async function viaPartner(action: string, params: Record<string, any>, token: string): Promise<Response> {
  const route = partnerRoute(action, params)
  if (!route) return json({ error: `Unknown action: ${action}` }, 400)

  const res = await partnerFetch(route.path, token, {
    method: route.method,
    ...(route.body && route.method !== 'GET' && route.method !== 'DELETE' ? { body: route.body } : {}),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return json({
      error: data?.message || data?.error || 'Watchdog API error',
      status: res.status,
      details: data,
    }, res.status)
  }
  return json(data)
}

// ---------------------------------------------------------------------
// Mirror cache
//
// Reads come out of the fleet_* tables and get reshaped into the same
// envelopes the partner API returns, so the Freddy pages can't tell the
// difference. Field names here match what those pages actually read
// (FreddyTracking looks for lat/latitude, engine_on/ignition, and so on)
// — emit both spellings rather than betting on one.
// ---------------------------------------------------------------------

async function viaMirror(
  action: string,
  params: Record<string, any>,
  companyId: number,
  lastSyncAt: string | null | undefined,
): Promise<Response> {
  const meta = { source: 'mirror', last_sync_at: lastSyncAt ?? null }

  switch (action) {
    case 'devices': {
      const rows = await pg(`fleet_latest_positions?company_id=eq.${companyId}&select=*`)
      return json({ ...meta, devices: (rows || []).map(toDevice) })
    }

    case 'trips':
    case 'trips_completed':
    case 'trips_in_progress':
    case 'trips_between': {
      const filters = [`company_id=eq.${companyId}`]
      if (params.start_date) filters.push(`started_at=gte.${new Date(params.start_date).toISOString()}`)
      if (params.end_date) {
        // end_date is a calendar day and callers mean it inclusively.
        const end = new Date(params.end_date)
        end.setUTCHours(23, 59, 59, 999)
        filters.push(`started_at=lte.${end.toISOString()}`)
      }
      if (params.device_id) filters.push(`device_id=eq.${params.device_id}`)
      if (action === 'trips_in_progress') filters.push('ended_at=is.null')
      if (action === 'trips_completed') filters.push('ended_at=not.is.null')

      const rows = await pg(`fleet_trips?${filters.join('&')}&select=*&order=started_at.desc&limit=2000`)
      return json({ ...meta, trips: (rows || []).map(toTrip) })
    }

    case 'trip_detail': {
      const rows = await pg(`fleet_trips?company_id=eq.${companyId}&external_id=eq.${params.trip_id}&select=*&limit=1`)
      if (!rows?.length) return json({ error: 'Trip not found' }, 404)
      return json({ ...meta, ...toTrip(rows[0]) })
    }

    case 'trip_locations': {
      // The client passes the provider's trip id; breadcrumbs hang off our
      // row id, so resolve one to the other first.
      const trip = await pg(`fleet_trips?company_id=eq.${companyId}&external_id=eq.${params.trip_id}&select=id&limit=1`)
      if (!trip?.length) return json({ ...meta, locations: [] })
      const rows = await pg(`fleet_trip_locations?trip_id=eq.${trip[0].id}&select=*&order=sequence.asc&limit=5000`)
      return json({
        ...meta,
        locations: (rows || []).map((r: any) => ({
          sequence: r.sequence,
          timestamp: r.recorded_at,
          lat: numeric(r.latitude), latitude: numeric(r.latitude),
          lng: numeric(r.longitude), longitude: numeric(r.longitude),
          speed: numeric(r.speed_mph),
        })),
      })
    }

    case 'alerts':
    case 'device_alerts': {
      const filters = [`company_id=eq.${companyId}`]
      if (params.device_id) filters.push(`device_id=eq.${params.device_id}`)
      const rows = await pg(`fleet_alerts?${filters.join('&')}&select=*&order=occurred_at.desc&limit=1000`)
      return json({ ...meta, alerts: (rows || []).map(toAlert) })
    }

    case 'geofences':
    case 'device_geofences': {
      const rows = await pg(`fleet_geofences?company_id=eq.${companyId}&select=*&order=name.asc`)
      return json({ ...meta, geofences: (rows || []).map(toGeofence) })
    }

    case 'device_trips': {
      const rows = await pg(
        `fleet_trips?company_id=eq.${companyId}&device_id=eq.${params.device_id}&select=*&order=started_at.desc&limit=500`,
      )
      return json({ ...meta, trips: (rows || []).map(toTrip) })
    }

    // Not mirrored. Say so plainly rather than returning an empty list
    // that reads as "you have no geofence activity".
    case 'geofence_logs':
    case 'device_engine_logs':
      return json({ ...meta, logs: [], unsupported: true,
        error: 'History for this view is only available with a Watchdog partner token.' })

    case 'analytics':
    case 'webhook_analytics':
      return json({ ...meta, unsupported: true,
        error: 'Provider analytics require a Watchdog partner token.' })

    // Writes would mean pushing changes into the customer's own Watchdog
    // account through a mirrored session. Reading their data on their
    // behalf is one thing; writing to it is a bigger step that should be
    // a deliberate decision, not a side effect of this refactor.
    case 'create_geofence':
    case 'update_geofence':
    case 'delete_geofence':
    case 'update_device':
      return json({
        error: 'Changes have to be made in the Moto Watchdog app. JobScout has read-only access to your account.',
        readOnly: true,
      }, 501)

    default:
      return json({ error: `Unknown action: ${action}` }, 400)
  }
}

const numeric = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

function toDevice(row: any) {
  return {
    id: row.device_id,
    device_id: row.device_id,
    fleet_id: row.fleet_id,
    lat: numeric(row.latitude), latitude: numeric(row.latitude),
    lng: numeric(row.longitude), longitude: numeric(row.longitude),
    speed: numeric(row.speed_mph) ?? 0,
    heading: numeric(row.heading),
    address: row.address || null,
    location: row.address || null,
    fuel_percent: numeric(row.fuel_percent),
    battery_percent: numeric(row.battery_percent),
    odometer: numeric(row.odometer),
    engine_on: row.ignition ?? false,
    ignition: row.ignition ?? false,
    online: row.online ?? false,
    last_update: row.recorded_at,
    timestamp: row.recorded_at,
  }
}

function toTrip(row: any) {
  return {
    id: row.external_id,
    trip_id: row.external_id,
    device_id: row.device_id,
    fleet_id: row.fleet_id,
    start_time: row.started_at, started_at: row.started_at,
    end_time: row.ended_at, ended_at: row.ended_at,
    start_latitude: numeric(row.start_latitude), start_longitude: numeric(row.start_longitude),
    end_latitude: numeric(row.end_latitude), end_longitude: numeric(row.end_longitude),
    start_address: row.start_address, end_address: row.end_address,
    distance_miles: numeric(row.distance_miles), distance: numeric(row.distance_miles),
    duration_seconds: row.duration_seconds,
    idle_time_seconds: row.idle_seconds, idle_duration: row.idle_seconds,
    max_speed: numeric(row.max_speed_mph), avg_speed: numeric(row.avg_speed_mph),
    harsh_brake_count: row.harsh_brake_count,
    harsh_accel_count: row.harsh_accel_count,
    speeding_count: row.speeding_count,
  }
}

function toAlert(row: any) {
  return {
    id: row.external_id,
    alert_id: row.external_id,
    device_id: row.device_id,
    fleet_id: row.fleet_id,
    type: row.alert_type, alert_type: row.alert_type,
    severity: row.severity,
    timestamp: row.occurred_at, occurred_at: row.occurred_at, created_at: row.occurred_at,
    lat: numeric(row.latitude), latitude: numeric(row.latitude),
    lng: numeric(row.longitude), longitude: numeric(row.longitude),
    speed: numeric(row.speed_mph),
    message: row.message, description: row.message,
  }
}

function toGeofence(row: any) {
  return {
    id: row.external_id ?? row.id,
    name: row.name,
    latitude: numeric(row.latitude), lat: numeric(row.latitude),
    longitude: numeric(row.longitude), lng: numeric(row.longitude),
    radius: numeric(row.radius_meters),
    active: row.active,
  }
}
