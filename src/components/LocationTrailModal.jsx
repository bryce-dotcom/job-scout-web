import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { X, MapPin, Truck } from 'lucide-react'
import L from 'leaflet'
import { useStore } from '../lib/store'
import { shiftOnSite, onSiteColor } from '../lib/onSite'

export default function LocationTrailModal({ entry, employeeName, onClose, theme }) {
  const companyId = useStore(s => s.companyId)
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [pings, setPings] = useState([])
  const [loading, setLoading] = useState(true)
  // The job this shift was booked to. Without it the map is dots on a street
  // with nothing to measure against — which is why "I can't really tell where
  // he is" was the honest answer when HR went looking.
  const [job, setJob] = useState(null)
  // The truck assigned to this person, and wherever it went during the shift.
  // A phone takes no fix while suspended, so a field tech's shift records
  // about five; the tracker's own breadcrumbs run one every ~45 seconds while
  // moving. Where a vehicle is assigned, it is the better witness — of the
  // truck, which is not quite the same claim, and the verdict says so.
  const [vehicle, setVehicle] = useState(null)
  const [vehiclePoints, setVehiclePoints] = useState([])

  // Load Leaflet CSS
  useEffect(() => {
    const id = 'leaflet-css'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
  }, [])

  // Fetch pings
  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('location_pings')
        .select('lat, lng, accuracy, pinged_at')
        .eq('time_clock_id', entry.id)
        .order('pinged_at', { ascending: true })
      setPings(data || [])
      if (entry.job_id) {
        const { data: j } = await supabase
          .from('jobs')
          .select('id, job_id, job_title, job_address, latitude, longitude')
          .eq('id', entry.job_id)
          .maybeSingle()
        setJob(j || null)
      } else {
        setJob(null)
      }

      // ---- the assigned truck, over the same window -------------------
      // fleet.assigned_to is the driver link (AssignedOperator writes it). No
      // assignment means no vehicle evidence, and the verdict falls back to
      // the phone exactly as before.
      const startIso = entry.clock_in
      const endIso = entry.clock_out || new Date().toISOString()
      let truck = null
      let truckPoints = []
      if (entry.employee_id && companyId) {
        const { data: trucks } = await supabase
          .from('fleet')
          .select('id, name, asset_id, gps_device_id')
          .eq('company_id', companyId)
          .eq('assigned_to', entry.employee_id)
          .limit(1)
        truck = trucks?.[0] || null

        if (truck?.gps_device_id) {
          // Trips that overlap the shift at all — one may have started before
          // the clock-in or run past the clock-out. The points themselves are
          // then clipped to the shift window, so a trip home afterwards is
          // never read as time on the job.
          const { data: trips } = await supabase
            .from('fleet_trips')
            .select('id')
            .eq('company_id', companyId)
            .eq('fleet_id', truck.id)
            .lte('started_at', endIso)
            .or(`ended_at.gte.${startIso},ended_at.is.null`)
          const tripIds = (trips || []).map(t => t.id)

          if (tripIds.length) {
            const { data: crumbs } = await supabase
              .from('fleet_trip_locations')
              .select('latitude, longitude, recorded_at, speed_mph')
              .in('trip_id', tripIds)
              .gte('recorded_at', startIso)
              .lte('recorded_at', endIso)
              .order('recorded_at', { ascending: true })
              .limit(2000)
            truckPoints = (crumbs || []).map(c => ({
              lat: c.latitude, lng: c.longitude, at: c.recorded_at, speed: c.speed_mph, kind: 'trip',
            }))
          }

          // The coarse latest-position polls as well: they are sparse, but
          // they are what exists for the parked stretches between trips.
          const { data: pos } = await supabase
            .from('fleet_positions')
            .select('latitude, longitude, recorded_at, speed_mph')
            .eq('company_id', companyId)
            .eq('fleet_id', truck.id)
            .gte('recorded_at', startIso)
            .lte('recorded_at', endIso)
            .order('recorded_at', { ascending: true })
            .limit(500)
          truckPoints = [...truckPoints, ...(pos || []).map(p => ({
            lat: p.latitude, lng: p.longitude, at: p.recorded_at, speed: p.speed_mph, kind: 'position',
          }))].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
        }
      }
      setVehicle(truck)
      setVehiclePoints(truckPoints)

      setLoading(false)
    })()
  }, [entry.id, entry.job_id, entry.employee_id, entry.clock_in, entry.clock_out, companyId])

  // Build map
  useEffect(() => {
    if (loading || !mapRef.current) return
    if (mapInstance.current) {
      // Same reason as the cleanup below: this effect re-runs on object deps,
      // so it tears down a map that may still be mid-animation.
      try { mapInstance.current.stop() } catch { /* older Leaflet: nothing to stop */ }
      mapInstance.current.remove()
      mapInstance.current = null
    }

    // Build all points: clock-in + pings + clock-out
    const points = []

    if (entry.clock_in_lat && entry.clock_in_lng) {
      points.push({
        lat: Number(entry.clock_in_lat),
        lng: Number(entry.clock_in_lng),
        type: 'clock_in',
        time: entry.clock_in,
        label: 'Clock In',
      })
    }

    pings.forEach(p => {
      points.push({
        lat: Number(p.lat),
        lng: Number(p.lng),
        type: 'ping',
        time: p.pinged_at,
        label: new Date(p.pinged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        accuracy: p.accuracy,
      })
    })

    if (entry.clock_out_lat && entry.clock_out_lng) {
      points.push({
        lat: Number(entry.clock_out_lat),
        lng: Number(entry.clock_out_lng),
        type: 'clock_out',
        time: entry.clock_out,
        label: 'Clock Out',
      })
    }

    // Nothing to draw only if NEITHER the phone nor the truck reported. A
    // sleeping phone with a tracked truck is the case this whole thing is
    // for, so it must not bail here.
    if (points.length === 0 && vehiclePoints.length === 0) {
      return
    }

    // Create map
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false })
    mapInstance.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    // Custom icon creators
    const makeIcon = (color, size = 12) => L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })

    const clockInIcon = makeIcon('#22c55e', 18)
    const clockOutIcon = makeIcon('#ef4444', 18)
    const pingIcon = makeIcon('#3b82f6', 10)

    // Add markers
    points.forEach(pt => {
      let icon = pingIcon
      if (pt.type === 'clock_in') icon = clockInIcon
      if (pt.type === 'clock_out') icon = clockOutIcon

      const marker = L.marker([pt.lat, pt.lng], { icon }).addTo(map)
      let popup = `<b>${pt.label}</b><br>${new Date(pt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      if (pt.accuracy) popup += `<br><small>Accuracy: ${pt.accuracy}m</small>`
      marker.bindPopup(popup)
    })

    // Draw trail line
    if (points.length > 1) {
      const latlngs = points.map(p => [p.lat, p.lng])
      L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.6,
        dashArray: '8, 6',
      }).addTo(map)
    }

    // The truck's trail, drawn solid and in its own colour beneath the
    // phone's. It is usually the denser of the two by an order of magnitude,
    // so it goes on first and thin, and the phone's dashed line stays
    // readable on top of it.
    const truckLatLngs = vehiclePoints
      .filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
      .map(p => [Number(p.lat), Number(p.lng)])
    if (truckLatLngs.length > 1) {
      L.polyline(truckLatLngs, { color: '#a855f7', weight: 3, opacity: 0.55 }).addTo(map)
    }
    truckLatLngs.forEach((ll, i) => {
      const p = vehiclePoints[i]
      L.circleMarker(ll, {
        radius: 3, color: '#a855f7', weight: 1, fillColor: '#a855f7', fillOpacity: 0.7,
      }).addTo(map).bindPopup(
        `<b>${vehicle?.name || 'Vehicle'}</b><br>${p.at ? new Date(p.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}` +
        (p.speed != null ? `<br><small>${Number(p.speed).toFixed(0)} mph</small>` : ''),
      )
    })

    // The job itself — a square, so it reads as a place rather than another
    // fix, with a ring at the quarter mile that counts as "at the job".
    const jobLat = job && job.latitude != null ? Number(job.latitude) : null
    const jobLng = job && job.longitude != null ? Number(job.longitude) : null
    const hasJobPin = Number.isFinite(jobLat) && Number.isFinite(jobLng)
    if (hasJobPin) {
      L.marker([jobLat, jobLng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:16px;height:16px;background:#5a6349;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.4)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(map).bindPopup(`<b>${job.job_title || 'Job'}</b><br><small>${job.job_address || ''}</small>`)
      L.circle([jobLat, jobLng], { radius: 402, color: '#5a6349', weight: 1, opacity: 0.5, fillOpacity: 0.06 }).addTo(map)
    }

    // Fit bounds — including the job. Fitting the dots alone is what made a
    // tech twenty miles away look like he was standing on the site: the map
    // just zoomed until his dots filled the frame.
    const boundPoints = [...points.map(p => [p.lat, p.lng]), ...truckLatLngs]
    if (hasJobPin) boundPoints.push([jobLat, jobLng])
    const bounds = L.latLngBounds(boundPoints)
    // animate: false is the fix for Alayda's white screen on /payroll.
    //
    // fitBounds ANIMATES by default: it queues a pan and returns. This effect
    // re-runs on `entry`, `job`, `vehicle` and `vehiclePoints` — all objects,
    // all new references on most renders — and the first thing it does is
    // map.remove(). Remove the map mid-pan and the queued frame still calls
    // panBy, which reaches for a map pane that no longer exists:
    //
    //   TypeError: Cannot read properties of undefined (reading 'classList')
    //       at cn (…) at K.panBy (…)
    //
    // Nothing to animate, nothing left to fire after the map is gone. The
    // frame still lands where it should — fitBounds without animation sets
    // the same view, it just arrives instead of gliding.
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: false })

    return () => {
      if (mapInstance.current) {
        // Belt and braces: stop() cancels any pan or zoom still in flight
        // (a user's own drag, inertia, a double-click zoom) before the
        // container goes. Leaflet provides it for exactly this.
        try { mapInstance.current.stop() } catch { /* older Leaflet: nothing to stop */ }
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [loading, pings, entry, job, vehicle, vehiclePoints])

  const clockIn = new Date(entry.clock_in)
  const clockOut = entry.clock_out ? new Date(entry.clock_out) : null
  // The truck counts. A shift where the phone reported nothing but the
  // tracker ran all day is the case this exists for, and gating the map on
  // the phone alone would hide exactly that.
  const hasAnyLocation = entry.clock_in_lat || entry.clock_out_lat || pings.length > 0 || vehiclePoints.length > 0

  // The answer in words, above the map. Everything the shift reported — the
  // clock-in, every ping, the clock-out — measured against the job's own pin
  // (lib/onSite). It says "cannot tell" rather than "away" when the job's
  // address is too thin to have geocoded properly.
  const verdict = shiftOnSite({
    job,
    points: [
      ...(entry.clock_in_lat ? [{ lat: entry.clock_in_lat, lng: entry.clock_in_lng }] : []),
      ...pings.map(p => ({ lat: p.lat, lng: p.lng })),
      ...(entry.clock_out_lat ? [{ lat: entry.clock_out_lat, lng: entry.clock_out_lng }] : []),
    ],
    vehiclePoints,
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={onClose}>
      <div style={{
        background: theme.bgCard, borderRadius: '16px', width: '100%', maxWidth: '600px',
        maxHeight: '85vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={18} style={{ color: '#3b82f6' }} />
              Location Trail
            </h3>
            <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>
              {employeeName} — {clockIn.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' '}{clockIn.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              {clockOut ? ` to ${clockOut.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ' (still clocked in)'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '4px',
          }}><X size={20} /></button>
        </div>

        {/* The answer, before the map. Reading a verdict off dots is what
            nobody could do. */}
        {!loading && (
          <div style={{
            padding: '10px 20px',
            borderBottom: `1px solid ${theme.border}`,
            backgroundColor: `${onSiteColor(verdict.status, theme)}14`,
            borderLeft: `3px solid ${onSiteColor(verdict.status, theme)}`,
          }}>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: onSiteColor(verdict.status, theme) }}>
              {verdict.headline}
            </div>
            <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px', lineHeight: 1.45 }}>
              {verdict.detail}
              {job?.job_title ? ` — ${job.job_title}` : ''}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{
          padding: '8px 20px', display: 'flex', gap: '16px', fontSize: '11px', color: theme.textMuted,
          borderBottom: `1px solid ${theme.border}`,
        }}>
          {job && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 10, height: 10, background: '#5a6349', display: 'inline-block' }} /> Job site
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Clock In
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /> Clock Out
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> Location Ping
          </span>
          <span>{pings.length} pings</span>
          {vehiclePoints.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 14, height: 3, background: '#a855f7', display: 'inline-block' }} />
              {vehicle?.name || 'Vehicle'} — {vehiclePoints.length} tracker points
            </span>
          )}
        </div>

        {/* Why the phone trail is thin, and what would fix it. A browser takes
            no position while suspended, so this is not a setting anybody can
            turn up — it is the reason the truck's own trail matters. */}
        {!loading && !vehicle && (
          <div style={{
            padding: '8px 20px', fontSize: '11.5px', color: theme.textMuted,
            borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1.45,
          }}>
            <Truck size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span>
              No vehicle is assigned to {employeeName}. A phone cannot report its position while the app
              is closed, so a field shift records only a handful of fixes — assign the truck they drive
              on its Fleet page and its tracker fills in the rest.
            </span>
          </div>
        )}
        {!loading && vehicle && !vehicle.gps_device_id && (
          <div style={{
            padding: '8px 20px', fontSize: '11.5px', color: theme.textMuted,
            borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1.45,
          }}>
            <Truck size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span>{vehicle.name} is assigned to {employeeName} but has no tracker linked, so only the phone is reporting.</span>
          </div>
        )}

        {/* Map */}
        <div style={{ height: '400px', position: 'relative' }}>
          {loading ? (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: theme.textMuted, fontSize: '14px',
            }}>Loading location data...</div>
          ) : !hasAnyLocation ? (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '8px', color: theme.textMuted, fontSize: '14px',
            }}>
              <MapPin size={32} style={{ opacity: 0.3 }} />
              No location data for this entry
            </div>
          ) : (
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>
      </div>
    </div>
  )
}
