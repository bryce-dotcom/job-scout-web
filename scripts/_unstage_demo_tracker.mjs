import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 25
const { data: trip } = await s.from('fleet_trips').select('id').eq('company_id', CO).eq('external_id','demo-trip-1').maybeSingle()
if (trip) {
  const d1 = await s.from('fleet_trip_locations').delete().eq('trip_id', trip.id).select('id')
  const d2 = await s.from('fleet_trips').delete().eq('id', trip.id).select('id')
  console.log('removed points:', d1.data?.length, 'trip:', d2.data?.length)
}
const { data: tc } = await s.from('time_clock').select('id').eq('company_id', CO).eq('employee_id', 136).eq('clock_in','2026-10-13T14:00:00+00:00').maybeSingle()
if (tc) {
  const p = await s.from('location_pings').delete().eq('time_clock_id', tc.id).select('id')
  const t = await s.from('time_clock').delete().eq('id', tc.id).select('id')
  console.log('removed pings:', p.data?.length, 'shift:', t.data?.length)
}
await s.from('fleet').update({ gps_device_id: null }).eq('id', 34).eq('company_id', CO)
const left = await s.from('fleet_trip_locations').select('*', { count: 'exact', head: true }).eq('company_id', CO)
const f = await s.from('fleet').select('id, gps_device_id').eq('id', 34).single()
console.log('demo breadcrumbs left:', left.count, '| demo truck device:', f.data.gps_device_id)
