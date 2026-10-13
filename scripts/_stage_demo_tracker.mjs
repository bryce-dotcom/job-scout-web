import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 25, EMP = 136, FLEET = 34, JOB = 23513
const DEV = 'demo-tracker-f150'

// the job, and a yard ~6 miles away to set off from
const job = { lat: 39.751222612997, lng: -105.002578205576 }
const yard = { lat: 39.798453131256, lng: -104.968641209304 }

await s.from('fleet').update({ gps_device_id: DEV }).eq('id', FLEET).eq('company_id', CO)

const clockIn = '2026-10-13T14:00:00Z'
const clockOut = '2026-10-13T22:30:00Z'
await s.from('time_clock').delete().eq('company_id', CO).eq('employee_id', EMP).eq('clock_in', clockIn)
const { data: tc, error: tcErr } = await s.from('time_clock').insert({
  company_id: CO, employee_id: EMP, job_id: JOB,
  clock_in: clockIn, clock_out: clockOut, total_hours: 8.5,
  clock_in_lat: yard.lat, clock_in_lng: yard.lng,
}).select('id').single()
if (tcErr) { console.error('time_clock:', tcErr.message); process.exit(1) }
console.log('shift', tc.id)

// the phone: one fix as he leaves the yard, then it sleeps — which is the
// whole problem HR ran into
await s.from('location_pings').delete().eq('time_clock_id', tc.id)
await s.from('location_pings').insert([
  { company_id: CO, employee_id: EMP, time_clock_id: tc.id, lat: yard.lat, lng: yard.lng, pinged_at: '2026-10-13T14:05:00Z', reason: 'clock_in' },
])

// the truck: a drive to the job, then parked on site all afternoon
await s.from('fleet_trips').delete().eq('company_id', CO).eq('external_id', 'demo-trip-1')
const { data: trip, error: trErr } = await s.from('fleet_trips').insert({
  company_id: CO, fleet_id: FLEET, device_id: DEV, external_id: 'demo-trip-1',
  started_at: '2026-10-13T14:10:00Z', ended_at: '2026-10-13T21:40:00Z',
  start_latitude: yard.lat, start_longitude: yard.lng,
  end_latitude: job.lat, end_longitude: job.lng,
  start_address: '5600 Franklin St, Denver, CO', end_address: '1750 15th St, Denver, CO',
  distance_miles: 6.2, duration_seconds: 27000, idle_seconds: 23400,
  breadcrumbs_at: new Date().toISOString(),
}).select('id').single()
if (trErr) { console.error('trip:', trErr.message); process.exit(1) }

const rows = []
let seq = 0
const t0 = new Date('2026-10-13T14:10:00Z').getTime()
for (let i = 0; i <= 28; i++) {            // the drive, a point every 45s
  const f = i / 28
  rows.push({
    company_id: CO, trip_id: trip.id, sequence: seq++,
    recorded_at: new Date(t0 + i * 45000).toISOString(),
    latitude: yard.lat + (job.lat - yard.lat) * f + (Math.sin(i) * 0.0004),
    longitude: yard.lng + (job.lng - yard.lng) * f + (Math.cos(i) * 0.0004),
    speed_mph: i === 28 ? 0 : 24 + Math.round(Math.sin(i) * 10),
  })
}
const tPark = t0 + 29 * 45000
for (let i = 0; i < 52; i++) {             // parked on site, every 8 minutes
  rows.push({
    company_id: CO, trip_id: trip.id, sequence: seq++,
    recorded_at: new Date(tPark + i * 480000).toISOString(),
    latitude: job.lat + (Math.sin(i * 7) * 0.00025),
    longitude: job.lng + (Math.cos(i * 7) * 0.00025),
    speed_mph: 0,
  })
}
const { error: locErr } = await s.from('fleet_trip_locations').insert(rows)
console.log(locErr ? 'points: ' + locErr.message : `points: ${rows.length} stored`)
