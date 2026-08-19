// =====================================================================
// watchdog-sync — pull fleet telemetry once per company and cache it.
//
// This function is the reason the mirror is cheap.
//
// Before: FreddyTracking polled watchdog-proxy every 60 seconds from
// every open browser tab, and stored nothing. Ten dispatchers watching
// the map meant ten times the provider traffic, ten times the chance of
// getting rate-limited, and still no trip history — every page visit
// re-fetched the world.
//
// After: one server-side pull per company per interval writes to
// Postgres, and every client reads from there. Traffic stops scaling
// with the number of people looking at it.
//
// Invocation:
//   { cron: true }              every due company (pg_cron calls this)
//   { company_id: 123 }         one company, ignoring the interval
//                               ("Sync now" in Freddy Settings)
// =====================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  loadExtractorConfig, loadIntegration, updateIntegration, markError,
  ensureSession, tier0WithRetry, SessionExpired,
  normalizePosition, normalizeTrip, normalizeAlert,
  attachFleetIds, upsert, pg, partnerFetch, partnerConfigured,
  type ExtractorConfig, type Integration,
} from '../_shared/watchdog.ts'
import { computeMeters, tripsToIntervals, odometerFromTrips } from '../_shared/fleetMeters.ts'

// When every tenant's trackers live in one JobScout-owned Watchdog company,
// there is exactly one account to poll no matter how many customers there are.
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

interface SyncResult {
  company_id: number
  ok: boolean
  tier: number | null
  devices: number
  positions: number
  trips: number
  alerts: number
  browser_used: boolean
  error?: string
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const config = await loadExtractorConfig()
    if (!config) {
      return json({ error: 'no active fleet_extractor_config — run scripts/watchdog-capture.mjs and seed one' }, 503)
    }

    // Platform mode: one pull covers everyone.
    //
    // Per-company syncing is right when each tenant has their own provider
    // account, but wrong here — every company's sync would fetch the whole
    // platform account (10,000 devices) just to keep its own five. That's
    // O(tenants x fleet) API calls to move O(fleet) data.
    //
    // One global pull, fanned out by the device -> company map, is O(1) in
    // tenant count. That's what makes ten thousand trackers viable.
    if (PLATFORM_TOKEN && partnerConfigured()) {
      return json(await syncPlatform())
    }

    const targets: number[] = body.company_id
      ? [Number(body.company_id)]
      : await dueCompanies()

    if (!targets.length) return json({ ok: true, synced: 0, results: [] })

    // Sequential on purpose. These are third-party calls against one
    // provider; firing every tenant at them concurrently is how you get
    // rate-limited into a ban. The whole point is that this runs rarely.
    const results: SyncResult[] = []
    for (const companyId of targets) {
      results.push(await syncCompany(companyId, config, Boolean(body.company_id)))
    }

    return json({ ok: true, synced: results.length, results })
  } catch (err) {
    console.error('[watchdog-sync]', err)
    return json({ error: (err as Error).message || 'internal error' }, 500)
  }
})

// ---------------------------------------------------------------------
// Platform mode
// ---------------------------------------------------------------------

/**
 * The device -> company map. This is the only thing that says which tenant a
 * tracker belongs to; Watchdog's API carries no account field at all, so a
 * device that isn't linked to a fleet row here is genuinely unattributable.
 *
 * Unlinked devices are counted and reported rather than silently skipped —
 * a tracker sending telemetry that lands nowhere is usually a vehicle someone
 * forgot to link, and it looks identical to "GPS is broken" from the UI.
 */
async function deviceOwnerMap(): Promise<Map<string, { companyId: number; fleetId: number }>> {
  const map = new Map<string, { companyId: number; fleetId: number }>()
  // Paged: one company's fleet is small, but the platform account's is not,
  // and PostgREST caps rows per request.
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const rows = await pg(
      `fleet?gps_device_id=not.is.null&select=id,company_id,gps_device_id&limit=${PAGE}&offset=${offset}`,
    )
    if (!rows?.length) break
    for (const r of rows) {
      map.set(String(r.gps_device_id), { companyId: r.company_id, fleetId: r.id })
    }
    if (rows.length < PAGE) break
  }
  return map
}

async function platformGet(path: string): Promise<any[]> {
  const res = await partnerFetch(path, PLATFORM_TOKEN)
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  // Every list endpoint nests under `data`, keyed by resource name. Trip
  // breadcrumbs are the one exception — `data.trip_locations`, not
  // `data.locations` — so the array is found by shape, not by a guessed key.
  const d = body?.data ?? body
  if (Array.isArray(d)) return d
  for (const value of Object.values(d ?? {})) if (Array.isArray(value)) return value
  return []
}

async function syncPlatform(): Promise<Record<string, unknown>> {
  const startedAt = new Date().toISOString()
  const finishedAtIso = startedAt
  const owners = await deviceOwnerMap()

  const config = await loadExtractorConfig()
  const fieldMap = config?.field_map || {}
  const units = fieldMap?.units?.system?.[0]

  const touched = new Set<number>()
  let unattributed = 0
  const counts = { devices: 0, positions: 0, trips: 0, alerts: 0, engineEvents: 0, meterReadings: 0 }
  let apiCalls = 2 // /devices + /alerts; per-device trip calls added below
  let error: string | null = null

  try {
    // ---- devices / live positions ----
    const devices = await platformGet('/devices')
    counts.devices = devices.length

    const positions: any[] = []
    for (const d of devices) {
      const normalized = normalizePosition(d, fieldMap.position || {}, 0, units)
      if (!normalized) continue
      const owner = owners.get(normalized.device_id)
      if (!owner) { unattributed++; continue }
      touched.add(owner.companyId)
      positions.push({ ...normalized, company_id: owner.companyId, fleet_id: owner.fleetId })
    }
    counts.positions = await upsert('fleet_positions', positions, 'company_id,device_id,recorded_at')

    // ---- trips ----
    //
    // Two endpoints, each holding half the answer:
    //
    //   GET /trips                    every trip WITH its summary block
    //                                 (mileage, addresses, harsh-brake and
    //                                 speeding counts, A-F grade) but no
    //                                 device reference of any kind — verified
    //                                 against the union of keys across every
    //                                 row, not just the first.
    //   GET /devices/{id}/trips       the same trips, attributable, but with
    //                                 the summary block stripped out.
    //
    // Neither alone is usable: the first can't be assigned to a tenant, the
    // second arrives empty of everything Freddy's cost and driver pages read.
    // They overlap perfectly on external_id, so the fix is to fetch summaries
    // once globally and use the per-device lists purely as an ownership index.
    //
    // Cost is one call plus one per linked device. The per-device leg is the
    // only part of this sync that grows with fleet size; Watchdog can push
    // trip events to a webhook instead, which is the real answer at scale.
    const summaries = new Map<string, any>()
    for (const t of await platformGet('/trips')) {
      if (t?.external_id) summaries.set(String(t.external_id), t)
    }

    const linked = devices.filter((d: any) => owners.has(String(d.external_id)))
    const trips: any[] = []
    for (const device of linked) {
      const deviceId = String(device.external_id)
      const owner = owners.get(deviceId)!
      let rows: any[] = []
      try {
        rows = await platformGet(`/devices/${deviceId}/trips`)
      } catch (err) {
        // One device's trips failing must not abandon the rest of the fleet.
        console.error(`[watchdog-sync] trips for ${deviceId}:`, (err as Error).message)
        continue
      }
      for (const row of rows) {
        // Prefer the summary-bearing copy; fall back to the bare row so a
        // trip that finished between the two calls is still recorded, just
        // without its summary until the next sync fills it in.
        const full = summaries.get(String(row.external_id)) ?? row
        const normalized = normalizeTrip(full, fieldMap.trip || {}, 0, units)
        if (!normalized) continue
        touched.add(owner.companyId)
        // Stamped from the device we asked, since the payload carries none.
        trips.push({ ...normalized, device_id: deviceId, company_id: owner.companyId, fleet_id: owner.fleetId })
      }
    }
    apiCalls += 1 + linked.length
    counts.trips = await upsert('fleet_trips', trips, 'company_id,external_id')

    // ---- engine events -> meters ----
    //
    // Ignition events are the only hour source Watchdog exposes, and it
    // returns roughly the last 30. Whatever isn't captured before it rolls
    // off is gone for good, so the raw events are persisted first and the
    // hours are then recomputed from the STORED set — not from this poll's
    // slice. That makes a bug in the pairing maths a recompute rather than a
    // permanent hole in the machine's history.
    const tripsByDevice = new Map<string, any[]>()
    for (const t of trips) {
      const list = tripsByDevice.get(t.device_id) || []
      list.push(t.raw ?? t)
      tripsByDevice.set(t.device_id, list)
    }

    const events: any[] = []
    for (const device of linked) {
      const deviceId = String(device.external_id)
      const owner = owners.get(deviceId)!
      let rows: any[] = []
      try {
        rows = await platformGet(`/devices/${deviceId}/engine_change_logs`)
      } catch (err) {
        console.error(`[watchdog-sync] engine logs for ${deviceId}:`, (err as Error).message)
        continue
      }
      for (const e of rows) {
        if (!e?.external_id) continue
        events.push({
          company_id: owner.companyId, fleet_id: owner.fleetId, device_id: deviceId,
          external_id: String(e.external_id), engine_on: !!e.engine_on,
          occurred_at: e.createdAt ?? e.occurred_at,
          latitude: e.latitude ?? null, longitude: e.longitude ?? null,
          address: e.last_address ?? null, raw: e,
        })
      }
    }
    apiCalls += linked.length
    counts.engineEvents = await upsert('fleet_engine_events', events, 'company_id,external_id')

    // Recompute from everything on record for each asset.
    for (const device of linked) {
      const deviceId = String(device.external_id)
      const owner = owners.get(deviceId)!
      const stored = await pg(
        `fleet_engine_events?company_id=eq.${owner.companyId}&device_id=eq.${encodeURIComponent(deviceId)}` +
        `&select=engine_on,occurred_at&order=occurred_at.asc&limit=10000`,
      ).catch(() => [])
      if (!stored?.length) continue

      const deviceTrips = tripsByDevice.get(deviceId) || []
      const m = computeMeters(stored, tripsToIntervals(deviceTrips))
      const odometer = odometerFromTrips(deviceTrips)

      // Skip a reading that would say nothing — an asset with no ignition
      // history yet shouldn't get a row of zeroes that later reads as
      // 'this machine has never run'.
      if (m.engineHours <= 0 && odometer === null) continue

      await upsert('fleet_meter_readings', [{
        company_id: owner.companyId,
        fleet_id: owner.fleetId,
        recorded_at: finishedAtIso,
        engine_hours: m.engineHours,
        // Stored as a floor, never as total idle — see fleetMeters.ts.
        idle_hours: m.idleFloorHours,
        odometer_miles: odometer,
        source: 'telematics',
        // Observed window and unpaired count travel with the number so a
        // reader can tell a confident figure from a patchy one.
        notes: `observed ${m.observedFrom ?? '?'} .. ${m.observedTo ?? '?'}` +
               (m.unpaired ? ` | ${m.unpaired} unpaired event(s)` : '') +
               (m.openSince ? ` | running since ${m.openSince}` : ''),
      }], 'company_id,fleet_id,recorded_at,source')
      counts.meterReadings++
    }

    // ---- alerts ----
    const alerts: any[] = []
    for (const a of await platformGet('/alerts')) {
      const normalized = normalizeAlert(a, fieldMap.alert || {}, 0, units)
      if (!normalized?.device_id) continue
      const owner = owners.get(normalized.device_id)
      if (!owner) continue
      touched.add(owner.companyId)
      alerts.push({ ...normalized, company_id: owner.companyId, fleet_id: owner.fleetId })
    }
    counts.alerts = await upsert('fleet_alerts', alerts, 'company_id,external_id')
  } catch (err) {
    error = (err as Error).message
  }

  // One log row per company that actually received data, so the per-tenant
  // health view in Settings keeps working the same way it does in mirror mode.
  const finishedAt = new Date().toISOString()
  const logRows = [...touched].map(companyId => ({
    company_id: companyId,
    started_at: startedAt,
    finished_at: finishedAt,
    tier: 0,
    ok: !error,
    browser_used: false,
    error,
  }))
  if (logRows.length) {
    await pg('fleet_sync_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(logRows),
    }).catch(() => {})
  }

  // UPSERT, not PATCH.
  //
  // In platform mode nobody ever "connects an account" — the token is ours and
  // global — so no fleet_integrations row is created by any user action. A
  // PATCH against a row that doesn't exist silently does nothing, which left
  // useGpsIntegration() reporting 'disconnected' and every Freddy page stuck
  // on "Connect GPS in Settings" while the data flowed in perfectly.
  //
  // Writing the row here makes the invariant true by construction: a company
  // receiving telemetry is, by definition, connected.
  for (const companyId of touched) {
    await pg('fleet_integrations?on_conflict=company_id,provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        company_id: companyId,
        provider: 'moto_watchdog',
        auth_mode: 'partner',
        status: 'connected',
        last_sync_at: finishedAt,
        last_sync_tier: 0,
        last_error: null,
        last_error_at: null,
        updated_at: finishedAt,
      }),
    }).catch(err => console.error('[watchdog-sync] integration upsert', companyId, err))
  }

  return {
    ok: !error,
    mode: 'platform',
    apiCalls,
    companiesTouched: touched.size,
    unattributedDevices: unattributed,
    ...counts,
    ...(error ? { error } : {}),
  }
}

/** Companies whose last sync is older than their configured interval. */
async function dueCompanies(): Promise<number[]> {
  const rows = await pg(
    'fleet_integrations?status=eq.connected&revoked_at=is.null&select=company_id,last_sync_at,sync_interval_seconds',
  )
  const now = Date.now()
  return (rows || [])
    .filter((r: any) => {
      if (!r.last_sync_at) return true
      return now - new Date(r.last_sync_at).getTime() >= (r.sync_interval_seconds || 300) * 1000
    })
    .map((r: any) => r.company_id)
}

async function syncCompany(companyId: number, config: ExtractorConfig, manual: boolean): Promise<SyncResult> {
  const startedAt = new Date().toISOString()
  const result: SyncResult = {
    company_id: companyId, ok: false, tier: null,
    devices: 0, positions: 0, trips: 0, alerts: 0, browser_used: false,
  }

  let integration: Integration | null = null
  try {
    integration = await loadIntegration(companyId)
    if (!integration) throw new Error('no connected integration')
    if (integration.status === 'disconnected') throw new Error('integration is disconnected')

    const session = await ensureSession(integration, config)
    result.browser_used = session.refreshed
    result.tier = 0

    let live = session

    // ---- devices / live positions -----------------------------------
    const devicesRun = await tier0WithRetry('devices', integration, config, live)
    live = devicesRun.session
    result.browser_used ||= devicesRun.relogged
    const devices = devicesRun.rows
    result.devices = devices.length

    const units = config.field_map?.units?.system?.[0]
    const positions = devices
      .map(d => normalizePosition(d, config.field_map?.position || {}, companyId, units))
      .filter(Boolean) as any[]

    if (positions.length) {
      result.positions = await upsert(
        'fleet_positions',
        await attachFleetIds(positions, companyId),
        'company_id,device_id,recorded_at',
      )
    }

    // ---- trips ------------------------------------------------------
    // Re-request a window that overlaps what we already have rather than
    // only "since last sync": trips finalize late (the provider fills in
    // distance and idle time after the engine stops), so a strict
    // watermark would freeze half-written rows forever. Upserting on the
    // natural key makes the overlap free.
    if (config.endpoints?.trips) {
      const since = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10)
      const until = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
      const tripsRun = await tier0WithRetry('trips', integration, config, live, { start_date: since, end_date: until })
      live = tripsRun.session
      result.browser_used ||= tripsRun.relogged

      const trips = tripsRun.rows
        .map(t => normalizeTrip(t, config.field_map?.trip || {}, companyId, units))
        .filter(Boolean) as any[]

      if (trips.length) {
        result.trips = await upsert(
          'fleet_trips',
          await attachFleetIds(trips, companyId),
          'company_id,external_id',
        )
      }
    }

    // ---- alerts -----------------------------------------------------
    if (config.endpoints?.alerts) {
      const alertsRun = await tier0WithRetry('alerts', integration, config, live)
      live = alertsRun.session
      result.browser_used ||= alertsRun.relogged

      const alerts = alertsRun.rows
        .map(a => normalizeAlert(a, config.field_map?.alert || {}, companyId, units))
        .filter(Boolean) as any[]

      if (alerts.length) {
        result.alerts = await upsert(
          'fleet_alerts',
          await attachFleetIds(alerts, companyId),
          'company_id,external_id',
        )
      }
    }

    await updateIntegration(integration.id, {
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      last_sync_tier: 0,
      last_error: null,
      last_error_at: null,
    })

    result.ok = true
  } catch (err) {
    const message = (err as Error).message || 'sync failed'
    result.error = message

    if (integration) {
      const needsReauth = err instanceof SessionExpired || /credential|reconnect|login failed/i.test(message)
      await markError(integration.id, message, needsReauth).catch(() => {})

      // A structural break — the endpoint moved, the response shape
      // changed — is what tier 2 exists for. Don't fire it for auth
      // problems (the customer has to reconnect; no amount of vision
      // fixes a wrong password) and don't fire it on manual runs, so a
      // user mashing "Sync now" can't spend money in a loop.
      if (!needsReauth && !manual && await repairIsWarranted()) {
        await triggerRepair(companyId, message).catch(e => console.error('[watchdog-sync] repair trigger failed', e))
      }
    }
  }

  await pg('fleet_sync_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      company_id: companyId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      tier: result.tier,
      ok: result.ok,
      devices_synced: result.devices,
      positions_written: result.positions,
      trips_written: result.trips,
      alerts_written: result.alerts,
      browser_used: result.browser_used,
      error: result.error?.slice(0, 500) ?? null,
    }]),
  }).catch(() => { /* logging must never sink a sync */ })

  return result
}

/**
 * Rate-limit the vision tier.
 *
 * The repair loop rewrites a GLOBAL config, so one successful run fixes
 * every tenant. Without this gate, a provider outage would have every
 * company's failed sync independently paying for the same repair — the
 * exact runaway the tier ladder is supposed to prevent.
 */
async function repairIsWarranted(): Promise<boolean> {
  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString()
  const recent = await pg(
    `fleet_extractor_config?source=eq.vision&created_at=gte.${sixHoursAgo}&select=id&limit=1`,
  ).catch(() => [])
  return !(recent?.length)
}

async function triggerRepair(companyId: number, reason: string): Promise<void> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/watchdog-repair`
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ company_id: companyId, reason }),
  })
}
