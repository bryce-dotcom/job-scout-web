import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { X, MapPin } from 'lucide-react'
import L from 'leaflet'

export default function LocationTrailModal({ entry, employeeName, onClose, theme }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [pings, setPings] = useState([])
  const [loading, setLoading] = useState(true)

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
      setLoading(false)
    })()
  }, [entry.id])

  // Build map
  useEffect(() => {
    if (loading || !mapRef.current) return
    if (mapInstance.current) {
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

    if (points.length === 0) {
      // No location data at all
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

    // Fit bounds
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [loading, pings, entry])

  const clockIn = new Date(entry.clock_in)
  const clockOut = entry.clock_out ? new Date(entry.clock_out) : null
  const hasAnyLocation = entry.clock_in_lat || entry.clock_out_lat || pings.length > 0

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

        {/* Legend */}
        <div style={{
          padding: '8px 20px', display: 'flex', gap: '16px', fontSize: '11px', color: theme.textMuted,
          borderBottom: `1px solid ${theme.border}`,
        }}>
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
        </div>

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
