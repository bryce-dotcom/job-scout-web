import { useEffect, useRef, useState } from 'react'
import { X, MapPin, Trash2, Save, AlertTriangle, Search, Sparkles, Loader } from 'lucide-react'
import { loadGoogleMaps, hasMapsKey, GOOGLE_MAPS_API_KEY } from '../../lib/googleMaps'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'

const SQM_PER_SQFT = 0.09290304
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Click-to-trace polygon over a satellite tile.
// Props:
//   address       — initial address to geocode and center on
//   initialCenter — { lat, lng } if already known
//   initialPolygon — existing polygon to edit
//   onClose
//   onSave({ polygon, sqft, lat, lng })
export default function YardMeasureModal({ address, propertyId, initialCenter, initialPolygon, onClose, onSave }) {
  const companyId = useStore(s => s.companyId)
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

  // AI auto-measure state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)   // { ai_sqft, raw_sqft, confidence, obstacles, reasoning, calibration_factor_applied, image_footprint_sqft }
  const [aiError, setAiError] = useState(null)

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

  // ============ AI Auto-Measure ============
  // Browser fetches the Static Maps tile (referrer-restricted public key),
  // converts to base64, posts to zach-yard-ai.
  const runAi = async () => {
    setAiError(null)
    if (!center?.lat || !center?.lng) { setAiError('Pan/search to the property first.'); return }
    if (!companyId) { setAiError('Missing company.'); return }
    if (!GOOGLE_MAPS_API_KEY) { setAiError('Maps key missing.'); return }
    setAiLoading(true)
    try {
      const zoom = 20
      const width = 640, height = 640, scale = 2
      const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=${zoom}&size=${width}x${height}&scale=${scale}&maptype=satellite&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`
      const tileRes = await fetch(url)
      if (!tileRes.ok) throw new Error('Failed to fetch satellite tile')
      const blob = await tileRes.blob()
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onloadend = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(blob)
      })
      const base64 = String(dataUrl).split(',')[1] || ''
      const mediaType = blob.type || 'image/png'

      const fnUrl = `${SUPABASE_URL}/functions/v1/zach-yard-ai`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          company_id: companyId,
          image_base64: base64,
          media_type: mediaType,
          lat: center.lat,
          lng: center.lng,
          address,
          zoom,
          image_width: width,
          image_height: height,
          scale,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'AI failed')
      setAiResult(json)
    } catch (e) {
      setAiError(e.message || String(e))
    } finally {
      setAiLoading(false)
    }
  }

  const acceptAi = () => {
    if (!aiResult?.ai_sqft) return
    onSave({
      polygon: null,
      sqft: aiResult.ai_sqft,
      lat: center?.lat,
      lng: center?.lng,
      ai: aiResult,
    })
  }

  // ============ Save (manual polygon, possibly correcting AI) ============
  const save = async () => {
    if (!polyRef.current) { setError('Trace the lawn first — click points around the perimeter.'); return }
    const path = polyRef.current.getPath().getArray().map(ll => ({ lat: ll.lat(), lng: ll.lng() }))
    if (path.length < 3) { setError('Need at least 3 points.'); return }

    // If the AI produced a guess and the user's traced sqft differs by >5%,
    // log a correction and bump the company's calibration factor.
    if (aiResult?.ai_sqft && companyId) {
      const aiSqft = aiResult.ai_sqft
      const actual = sqft
      const deltaPct = aiSqft > 0 ? ((actual - aiSqft) / aiSqft) * 100 : 0
      if (Math.abs(deltaPct) >= 5) {
        try {
          await supabase.from('lawn_ai_corrections').insert({
            company_id: companyId,
            property_id: propertyId || null,
            ai_sqft: aiSqft,
            actual_sqft: actual,
            delta_pct: Number(deltaPct.toFixed(2)),
            ai_obstacles: aiResult.obstacles || null,
            ai_confidence: aiResult.confidence || null,
            latitude: center?.lat,
            longitude: center?.lng,
            source: 'measure_modal',
          })
          // Pull current calibration + sample count, recompute running average
          const { data: pricing } = await supabase
            .from('lawn_pricing')
            .select('ai_calibration_factor, ai_sample_n')
            .eq('company_id', companyId)
            .maybeSingle()
          const oldFactor = Number(pricing?.ai_calibration_factor) || 1
          const oldN = Number(pricing?.ai_sample_n) || 0
          const sampleRatio = aiSqft > 0 ? actual / aiSqft : 1
          const newN = oldN + 1
          const newFactor = Math.max(0.5, Math.min(2.0, ((oldFactor * oldN) + sampleRatio) / newN))
          await supabase
            .from('lawn_pricing')
            .update({ ai_calibration_factor: Number(newFactor.toFixed(3)), ai_sample_n: newN })
            .eq('company_id', companyId)
        } catch (e) {
          console.warn('[YardMeasureModal] correction log failed:', e)
        }
      }
    }

    onSave({ polygon: path, sqft, lat: center?.lat, lng: center?.lng, ai: aiResult || null })
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 1100 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#7d8a7f', flex: 1, minWidth: 200 }}>Click around the perimeter of the turf. Drag vertices to refine. Skip driveways, beds, and the house.</p>
            <button onClick={runAi} disabled={aiLoading || !center} style={{ padding: '8px 12px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: 8, cursor: (aiLoading || !center) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: (aiLoading || !center) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {aiLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
              {aiLoading ? 'Zach is looking…' : 'AI Auto-Measure'}
            </button>
          </div>
          {aiError && (
            <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 6, color: '#b91c1c', fontSize: 12 }}>{aiError}</div>
          )}
          {aiResult && (
            <div style={{ marginTop: 8, padding: 10, background: 'rgba(168,85,247,0.08)', border: '1px solid #a855f7', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#7d8a7f', textTransform: 'uppercase', fontWeight: 700 }}>Zach's estimate</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#2c3530' }}>{aiResult.ai_sqft?.toLocaleString()} <span style={{ fontSize: 12, color: '#7d8a7f', fontWeight: 500 }}>sqft · {Math.round((aiResult.confidence || 0) * 100)}% conf</span></div>
                  {aiResult.calibration_factor_applied && aiResult.calibration_factor_applied !== 1 && (
                    <div style={{ fontSize: 11, color: '#7d8a7f' }}>Raw {aiResult.raw_sqft?.toLocaleString()} × calibration {aiResult.calibration_factor_applied}</div>
                  )}
                </div>
                <button onClick={acceptAi} style={{ padding: '8px 12px', background: '#5a6349', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Use this</button>
              </div>
              {aiResult.reasoning && <div style={{ fontSize: 12, color: '#4d5a52', marginTop: 6, fontStyle: 'italic' }}>{aiResult.reasoning}</div>}
              {Array.isArray(aiResult.obstacles) && aiResult.obstacles.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {aiResult.obstacles.map((o, i) => <span key={i} style={{ fontSize: 11, padding: '2px 6px', background: '#fff', border: '1px solid #d6cdb8', borderRadius: 4, color: '#4d5a52' }}>{o}</span>)}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#7d8a7f', marginTop: 6 }}>Trace your own polygon below if Zach got it wrong — that correction trains him for next time.</div>
            </div>
          )}
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
