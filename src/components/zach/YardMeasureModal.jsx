import { useEffect, useRef, useState } from 'react'
import { X, MapPin, Trash2, Save, AlertTriangle, Search } from 'lucide-react'
import { loadGoogleMaps, hasMapsKey } from '../../lib/googleMaps'

const SQM_PER_SQFT = 0.09290304

// Click-to-trace polygon over a satellite tile.
// Props:
//   address       — initial address to geocode and center on
//   initialCenter — { lat, lng } if already known
//   initialPolygon — existing polygon to edit
//   onClose
//   onSave({ polygon, sqft, lat, lng })
export default function YardMeasureModal({ address, initialCenter, initialPolygon, onClose, onSave }) {
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const polyRef = useRef(null)
  const markersRef = useRef([])
  const searchInputRef = useRef(null)

  const [pointsCount, setPointsCount] = useState((initialPolygon || []).length)
  const [sqft, setSqft] = useState(0)
  const [error, setError] = useState(null)
  const [center, setCenter] = useState(initialCenter || null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasMapsKey()) {
      setError('Google Maps API key is not configured. Add VITE_GOOGLE_MAPS_API_KEY to .env.local and rebuild.')
      setLoading(false)
      return
    }
    let cancelled = false
    loadGoogleMaps().then(google => {
      if (cancelled) return
      initMap(google)
      setLoading(false)
    }).catch(e => {
      if (cancelled) return
      setError(e.message || 'Failed to load Google Maps')
      setLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line
  }, [])

  const initMap = async (google) => {
    let c = center
    if (!c && address) {
      try {
        const geocoder = new google.maps.Geocoder()
        const { results } = await geocoder.geocode({ address })
        if (results && results[0]) {
          const loc = results[0].geometry.location
          c = { lat: loc.lat(), lng: loc.lng() }
          setCenter(c)
        }
      } catch (_) { /* user can search manually */ }
    }
    if (!c) c = { lat: 40.76078, lng: -111.89105 } // SLC fallback

    const map = new google.maps.Map(mapElRef.current, {
      center: c,
      zoom: 20,
      mapTypeId: 'satellite',
      tilt: 0,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: true,
      mapTypeControlOptions: { mapTypeIds: ['satellite', 'hybrid', 'roadmap'] },
    })
    mapRef.current = map

    // Hook up the address search input (Autocomplete).
    if (searchInputRef.current) {
      const ac = new google.maps.places.Autocomplete(searchInputRef.current, {
        fields: ['geometry', 'formatted_address'],
        types: ['address'],
      })
      ac.bindTo('bounds', map)
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place?.geometry?.location) {
          map.panTo(place.geometry.location)
          map.setZoom(20)
          setCenter({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
        }
      })
    }

    // Click handler — add a vertex
    map.addListener('click', (e) => {
      addVertex({ lat: e.latLng.lat(), lng: e.latLng.lng() })
    })

    // Seed with existing polygon
    if (initialPolygon && initialPolygon.length >= 3) {
      initialPolygon.forEach(p => addVertex(p, true))
      finalizePolygon()
    }
  }

  const addVertex = (latLng, suppressFinalize = false) => {
    const google = window.google
    if (!google) return
    const map = mapRef.current
    const path = polyRef.current ? polyRef.current.getPath().getArray().map(ll => ({ lat: ll.lat(), lng: ll.lng() })) : []
    path.push(latLng)

    if (polyRef.current) polyRef.current.setMap(null)
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    polyRef.current = new google.maps.Polygon({
      paths: path,
      strokeColor: '#22c55e',
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: '#22c55e',
      fillOpacity: 0.25,
      editable: true,
      draggable: false,
      map,
    })

    // Marker dots so users see each vertex they placed.
    path.forEach((p, i) => {
      const marker = new google.maps.Marker({
        position: p,
        map,
        label: { text: String(i + 1), color: '#fff', fontSize: '10px' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      })
      markersRef.current.push(marker)
    })

    // Recompute when the path changes (drag a vertex)
    google.maps.event.addListener(polyRef.current.getPath(), 'set_at', recompute)
    google.maps.event.addListener(polyRef.current.getPath(), 'insert_at', recompute)
    google.maps.event.addListener(polyRef.current.getPath(), 'remove_at', recompute)

    setPointsCount(path.length)
    if (!suppressFinalize) recompute()
  }

  const recompute = () => {
    const google = window.google
    if (!google || !polyRef.current) return
    const path = polyRef.current.getPath()
    if (path.getLength() < 3) { setSqft(0); return }
    const m2 = google.maps.geometry.spherical.computeArea(path)
    setSqft(Math.round(m2 / SQM_PER_SQFT))
  }

  const finalizePolygon = () => {
    setTimeout(recompute, 50)
  }

  const undoLast = () => {
    if (!polyRef.current) return
    const path = polyRef.current.getPath()
    if (path.getLength() === 0) return
    path.removeAt(path.getLength() - 1)
    // refresh markers
    const arr = path.getArray().map(ll => ({ lat: ll.lat(), lng: ll.lng() }))
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    arr.forEach((p, i) => {
      const marker = new window.google.maps.Marker({
        position: p, map: mapRef.current,
        label: { text: String(i + 1), color: '#fff', fontSize: '10px' },
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      })
      markersRef.current.push(marker)
    })
    setPointsCount(arr.length)
    recompute()
  }

  const clearAll = () => {
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null }
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    setPointsCount(0)
    setSqft(0)
  }

  const save = () => {
    if (!polyRef.current) { setError('Trace the lawn first — click points around the perimeter.'); return }
    const path = polyRef.current.getPath().getArray().map(ll => ({ lat: ll.lat(), lng: ll.lng() }))
    if (path.length < 3) { setError('Need at least 3 points.'); return }
    onSave({ polygon: path, sqft, lat: center?.lat, lng: center?.lng })
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 1100 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 900, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #d6cdb8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapPin size={20} style={{ color: '#5a6349' }} />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#2c3530' }}>Measure the lawn</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#7d8a7f' }}><X size={22} /></button>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid #d6cdb8', background: '#f7f5ef' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7d8a7f' }} />
            <input ref={searchInputRef} type="text" defaultValue={address || ''} placeholder="Search address (or pan the map)" style={{ width: '100%', padding: '10px 12px 10px 38px', border: '1px solid #d6cdb8', borderRadius: 8, background: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#7d8a7f' }}>Click around the perimeter of the turf. Drag vertices to refine. Skip driveways, beds, and the house.</p>
        </div>

        <div style={{ position: 'relative', flex: 1, minHeight: 380 }}>
          {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f5ef', color: '#4d5a52' }}>Loading map…</div>}
          {error && (
            <div style={{ position: 'absolute', inset: 0, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f7f5ef', textAlign: 'center', gap: 12 }}>
              <AlertTriangle size={32} style={{ color: '#eab308' }} />
              <div style={{ color: '#2c3530', fontWeight: 600 }}>Map unavailable</div>
              <div style={{ color: '#4d5a52', fontSize: 13, maxWidth: 480 }}>{error}</div>
            </div>
          )}
          <div ref={mapElRef} style={{ position: 'absolute', inset: 0 }} />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 18px', borderTop: '1px solid #d6cdb8', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 12, color: '#7d8a7f', textTransform: 'uppercase', fontWeight: 600 }}>Measured turf</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#2c3530' }}>{sqft.toLocaleString()} <span style={{ fontSize: 13, color: '#7d8a7f', fontWeight: 500 }}>sqft · {pointsCount} pts</span></div>
          </div>
          <button onClick={undoLast} disabled={pointsCount === 0} style={{ padding: '10px 14px', background: '#fff', border: '1px solid #d6cdb8', borderRadius: 8, cursor: pointsCount ? 'pointer' : 'not-allowed', color: '#4d5a52', fontWeight: 500, opacity: pointsCount ? 1 : 0.5 }}>Undo</button>
          <button onClick={clearAll} disabled={pointsCount === 0} style={{ padding: '10px 14px', background: '#fff', border: '1px solid #d6cdb8', borderRadius: 8, cursor: pointsCount ? 'pointer' : 'not-allowed', color: '#ef4444', fontWeight: 500, opacity: pointsCount ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 4 }}><Trash2 size={14} /> Clear</button>
          <button onClick={save} disabled={pointsCount < 3} style={{ padding: '10px 18px', background: '#5a6349', color: '#fff', border: 'none', borderRadius: 8, cursor: pointsCount >= 3 ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: pointsCount >= 3 ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 6 }}><Save size={16} /> Save measurement</button>
        </div>
      </div>
    </div>
  )
}
