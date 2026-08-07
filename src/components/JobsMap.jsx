import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin } from 'lucide-react'

// Jobs plotted on a map, for dispatch.
//
// This lived on the Jobs page, which is a directory — you go there to find a
// job and see what stage it is at. Seeing where the work IS belongs with
// creating and dispatching it, so it lives on the Job Board now.
//
// Self-contained on purpose: it owns Leaflet loading, geocoding, the cache and
// the markers, so a host page adds it with one tag and nothing leaks back out.
// Everything is inert until `show` is true — no CDN fetch, no geocoding, no
// map instance — because geocoding is rate-limited to roughly one address a
// second and must never run for a page nobody opened.

export default function JobsMap({ jobs = [], theme, navigate, statusColumns = [], show = false, height = 420 }) {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [jobCoords, setJobCoords] = useState({})
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const geocodeCacheRef = useRef({})

  // Leaflet from CDN, only once the map is actually asked for.
  useEffect(() => {
    if (!show) return
    if (document.getElementById('leaflet-css')) { setMapLoaded(true); return }
    const link = document.createElement('link')
    link.id = 'leaflet-css'; link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.id = 'leaflet-js'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [show])

  const geocodeAddress = useCallback(async (address) => {
    if (!address) return null
    if (geocodeCacheRef.current[address]) return geocodeCacheRef.current[address]
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`)
      const data = await res.json()
      if (data?.[0]) {
        const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
        geocodeCacheRef.current[address] = coords
        return coords
      }
    } catch { /* a failed lookup just means no pin for that job */ }
    return null
  }, [])

  const parseGpsLocation = useCallback((gpsStr) => {
    if (!gpsStr) return null
    const parts = String(gpsStr).split(',').map(s => parseFloat(s.trim()))
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && (Math.abs(parts[0]) > 0.01 || Math.abs(parts[1]) > 0.01)) {
      return { lat: parts[0], lng: parts[1] }
    }
    return null
  }, [])

  // A recorded GPS fix beats geocoding an address string — it is where the
  // crew actually was. Only addresses fall through to the lookup, one a
  // second, and the cache means the same site is never looked up twice.
  useEffect(() => {
    if (!show || jobs.length === 0) return
    let cancelled = false
    const geocodeAll = async () => {
      const newCoords = {}
      for (const job of jobs) {
        if (cancelled) break
        const gps = parseGpsLocation(job.gps_location)
        if (gps) { newCoords[job.id] = gps; continue }
        const addr = job.job_address || job.customer?.address
        if (!addr) continue
        if (geocodeCacheRef.current[addr]) { newCoords[job.id] = geocodeCacheRef.current[addr]; continue }
        await new Promise(r => setTimeout(r, 1100))
        if (cancelled) break
        const coords = await geocodeAddress(addr)
        if (coords) newCoords[job.id] = coords
      }
      if (!cancelled) setJobCoords(prev => ({ ...prev, ...newCoords }))
    }
    geocodeAll()
    return () => { cancelled = true }
  }, [show, jobs.length, jobs, geocodeAddress, parseGpsLocation])

  useEffect(() => {
    if (!show || !mapLoaded || !mapRef.current || typeof window.L === 'undefined') return
    const coordEntries = Object.entries(jobCoords)

    const timer = setTimeout(() => {
      if (!mapRef.current) return
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }

      const L = window.L
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false })
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
      mapInstanceRef.current = map

      const bounds = []
      coordEntries.forEach(([jobId, coords]) => {
        const job = jobs.find(j => String(j.id) === String(jobId))
        if (!job) return
        const col = statusColumns.find(c => c.id === job.status)
        const color = col?.color || theme?.accent || '#5a6349'
        const marker = L.circleMarker([coords.lat, coords.lng], { radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 }).addTo(map)
        marker.bindTooltip(
          `<b>${job.job_title || 'Job'}</b><br/>${job.customer?.name || job.customer_name || ''}<br/><small>${job.status || ''}</small>`,
          { direction: 'top', offset: [0, -10] },
        )
        marker.on('click', () => navigate?.(`/jobs/${job.id}`))
        bounds.push([coords.lat, coords.lng])
      })

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
      else map.setView([40.76, -111.89], 10)   // Salt Lake, when nothing resolved
      map.invalidateSize()
    }, 100)

    return () => { clearTimeout(timer); if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [show, mapLoaded, jobCoords, jobs, statusColumns, theme?.accent, navigate])

  if (!show) return null

  const locatable = jobs.filter(j => j.job_address || j.customer?.address || j.gps_location).length

  return (
    <div style={{
      marginTop: '16px', backgroundColor: theme?.bgCard || '#fff',
      borderRadius: '14px', border: `1px solid ${theme?.border || '#d6cdb8'}`, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: `1px solid ${theme?.border || '#d6cdb8'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={15} style={{ color: theme?.accent }} />
          <span style={{ fontSize: '13px', fontWeight: '600', color: theme?.text }}>Job locations</span>
        </div>
        {/* Say how many pins to expect. Geocoding takes about a second per
            address, so a half-drawn map is normal for a few seconds and
            silence looks like breakage. */}
        <span style={{ fontSize: '11px', color: theme?.textMuted }}>
          {Object.keys(jobCoords).length} of {locatable} located
          {Object.keys(jobCoords).length < locatable ? ' — still looking up addresses' : ''}
        </span>
      </div>
      <div ref={mapRef} style={{ height: `${height}px`, width: '100%' }} />
    </div>
  )
}
