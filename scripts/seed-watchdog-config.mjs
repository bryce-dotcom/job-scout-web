#!/usr/bin/env node
/**
 * Seed the extractor config from the VERIFIED Moto Watchdog partner API.
 *
 * Every field name below was read off real responses from a live account on
 * 2026-08-18 (probe output in scripts/.watchdog-capture/api-probe.json), not
 * guessed from documentation. Where the API surprised us, the surprise is
 * written down next to the mapping rather than smoothed over.
 *
 *   node scripts/seed-watchdog-config.mjs
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

// Responses are wrapped: { data: { devices: [...] } }. Every list endpoint
// nests under `data`, keyed by resource name — except trip breadcrumbs, which
// come back as `data.trip_locations` rather than `data.locations`.
const ENDPOINTS = {
  devices:        { path: '/devices',                        result: 'data.devices' },
  // Trips MUST be fetched per device. GET /trips returns trips with no device
  // reference of any kind — verified against the union of keys across every
  // row, not just the first. There is no way to attribute a globally-fetched
  // trip to a vehicle, so the per-device path is the only correct source.
  device_trips:   { path: '/devices/{device_id}/trips',      result: 'data.trips' },
  trip_detail:    { path: '/trips/{trip_id}',                result: 'data.trip' },
  trip_locations: { path: '/trips/{trip_id}/locations',      result: 'data.trip_locations' },
  // in_progress and completed 400 with "Missing date" unless ?date= is sent.
  trips_in_progress: { path: '/trips/in_progress?date={date}', result: 'data.trips' },
  trips_completed:   { path: '/trips/completed?date={date}',   result: 'data.trips' },
  alerts:         { path: '/alerts',                         result: 'data.alerts' },
  device_alerts:  { path: '/devices/{device_id}/alerts',      result: 'data.alerts' },
  geofences:      { path: '/geofences',                      result: 'data.geofences' },
}

const FIELD_MAP = {
  // total_mileage arrives in miles and last_speed in mph — no conversion.
  units: { system: ['imperial'] },

  position: {
    device_id:       ['external_id'],
    recorded_at:     ['location_last_updated', 'last_seen'],
    latitude:        ['last_latitude'],
    longitude:       ['last_longitude'],
    speed:           ['last_speed'],
    // last_direction is a compass letter ("N"), not degrees, so numeric
    // heading stays null. Freddy's map draws a dot, not an arrow, so nothing
    // downstream needs it — noted here so it reads as known, not broken.
    heading:         ['last_direction'],
    ignition:        ['engine_on', 'type.payload.engine_on'],
    fuel_percent:    ['fuel_percent'],
    battery_percent: ['battery_percent', 'battery_level'],
    odometer:        ['total_miles', 'type.payload.total_miles'],
    address:         ['last_address'],
  },

  trip: {
    external_id:    ['external_id'],
    // Deliberately empty: the trip payload carries no device field. The sync
    // stamps device_id from the device it fetched the trip for.
    device_id:      [],
    started_at:     ['start_time', 'summary.start_time'],
    ended_at:       ['end_time', 'summary.end_time'],
    start_latitude: ['starting_latitude', 'summary.start_latitude'],
    start_longitude:['starting_longitude', 'summary.start_longitude'],
    end_latitude:   ['summary.end_latitude'],
    end_longitude:  ['summary.end_longitude'],
    start_address:  ['summary.start_address'],
    end_address:    ['summary.end_address'],
    distance_miles: ['summary.total_mileage'],
    // Watchdog already grades trips A-F and counts the events Freddy's driver
    // scorecard was recomputing by hand from raw alerts.
    harsh_brake_count: ['summary.harsh_brake_alarm_count'],
    harsh_accel_count: ['summary.acceleration_alarm_count'],
    speeding_count:    ['summary.speeding_data_points'],
    grade:             ['summary.grade'],
  },

  // Unverified: the test account returned zero alerts from every alert
  // endpoint because the device has movement_alerts and speeding_alerts both
  // switched off. These names are the documented shape, and the first account
  // with alerts enabled will confirm or correct them.
  alert: {
    external_id: ['external_id', 'id'],
    device_id:   ['device_external_id', 'device_id'],
    alert_type:  ['type', 'alert_type'],
    severity:    ['severity'],
    occurred_at: ['occurred_at', 'createdAt', 'timestamp'],
    latitude:    ['latitude'],
    longitude:   ['longitude'],
    speed:       ['speed'],
    message:     ['message', 'description'],
  },
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { error } = await supabase.from('fleet_extractor_config').insert({
  provider: 'moto_watchdog',
  version: 2,
  active: true,
  source: 'capture',
  confidence: 1.0,
  notes: 'Field names read off live partner-API responses on 2026-08-18 via scripts/watchdog-api-probe.mjs. Alert mapping is the one unverified block — the test account had alerts disabled.',
  endpoints: ENDPOINTS,
  field_map: FIELD_MAP,
})

if (error) { console.error('Seed failed:', error.message); process.exit(1) }

await supabase.from('fleet_extractor_config')
  .update({ active: false })
  .eq('provider', 'moto_watchdog')
  .neq('version', 2)

console.log('Seeded verified Watchdog config (version 2, active).')
