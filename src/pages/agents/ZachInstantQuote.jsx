// Public instant-quote landing page for a lawn-care company.
// Route:  /quote/:slug
//
// Flow:
//   1. Visitor types address → Google Places autocomplete → lat/lng
//   2. We fetch the satellite tile via Static Maps (referrer-restricted public key)
//   3. POST { company_slug, address, lat, lng, image_base64, contact_* } to zach-instant-quote
//   4. Display the per-visit + annual price + AI confidence + lead capture confirmation
//
// No auth required. Edge function rate-limits by IP hash.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Sparkles, MapPin, Loader, Check, AlertTriangle, Calculator } from 'lucide-react'
import { loadGoogleMaps, hasMapsKey, GOOGLE_MAPS_API_KEY, staticMapUrl } from '../../lib/googleMaps'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export default function ZachInstantQuote() {
  const { slug } = useParams()
  const inputRef = useRef(null)

  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState(null)  // { lat, lng }
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)  // edge function response
  const [mapsReady, setMapsReady] = useState(false)

  useEffect(() => {
    if (!hasMapsKey()) { setError('Maps key not configured.'); return }
    let cancelled = false
    loadGoogleMaps().then(google => {
      if (cancelled) return
      setMapsReady(true)
      if (inputRef.current) {
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ['geometry', 'formatted_address'],
          types: ['address'],
        })
        ac.addListener('place_changed', () => {
          const place = ac.getPlace()
          if (place?.geometry?.location && place.formatted_address) {
            setAddress(place.formatted_address)
            setCoords({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
          }
        })
      }
    }).catch(e => setError(e.message || 'Failed to load Maps'))
    return () => { cancelled = true }
  }, [])

  const submit = async () => {
    setError(null)
    if (!address || !coords) { setError('Pick an address from the suggestions.'); return }
    if (!slug) { setError('Missing company slug.'); return }
    setLoading(true)
    try {
      // Fetch the satellite tile as base64
      const zoom = 20, width = 640, height = 640, scale = 2
      const tileUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=${zoom}&size=${width}x${height}&scale=${scale}&maptype=satellite&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`
      const tileRes = await fetch(tileUrl)
      if (!tileRes.ok) throw new Error('Failed to fetch satellite imagery.')
      const blob = await tileRes.blob()
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onloadend = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(blob)
      })
      const base64 = String(dataUrl).split(',')[1] || ''

      const fnUrl = `${SUPABASE_URL}/functions/v1/zach-instant-quote`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_slug: slug,
          address,
          lat: coords.lat,
          lng: coords.lng,
          image_base64: base64,
          media_type: blob.type || 'image/png',
          contact_name: contact.name || null,
          contact_email: contact.email || null,
          contact_phone: contact.phone || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Quote failed')
      setResult(json)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const tileUrl = coords ? staticMapUrl({ lat: coords.lat, lng: coords.lng, width: 600, height: 360, zoom: 20 }) : null

  return (
    <div style={{ minHeight: '100vh', background: '#f7f5ef', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#5a6349', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#2c3530' }}>{result?.company_name || 'Get an instant lawn-care quote'}</div>
            <div style={{ fontSize: 13, color: '#7d8a7f' }}>Powered by Zach the Yard Yeti — satellite-AI estimate in seconds.</div>
          </div>
        </div>

        {!result && (
          <div style={{ background: '#fff', border: '1px solid #d6cdb8', borderRadius: 14, padding: 22, boxShadow: '0 1px 3px rgba(44,53,48,0.06)' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4d5a52', marginBottom: 6 }}>Property address</label>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <MapPin size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7d8a7f' }} />
              <input
                ref={inputRef}
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder={mapsReady ? 'Start typing your address…' : 'Loading map…'}
                disabled={!mapsReady}
                style={{ width: '100%', padding: '12px 12px 12px 38px', border: '1px solid #d6cdb8', borderRadius: 10, background: '#f7f5ef', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {tileUrl && (
              <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid #d6cdb8' }}>
                <img src={tileUrl} alt="Satellite preview" style={{ width: '100%', display: 'block' }} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="Your name (optional)" value={contact.name} onChange={v => setContact(c => ({ ...c, name: v }))} />
              <Field label="Phone (optional)" value={contact.phone} onChange={v => setContact(c => ({ ...c, phone: v }))} />
            </div>
            <Field label="Email (optional, to send your quote)" value={contact.email} onChange={v => setContact(c => ({ ...c, email: v }))} />

            {error && (
              <div style={{ display: 'flex', gap: 8, padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginTop: 12 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading || !coords}
              style={{ marginTop: 16, width: '100%', padding: '14px 18px', background: '#5a6349', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: (loading || !coords) ? 'not-allowed' : 'pointer', opacity: (loading || !coords) ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Calculator size={18} />}
              {loading ? 'Zach is measuring your yard…' : 'Get my instant quote'}
            </button>
            <div style={{ fontSize: 11, color: '#7d8a7f', marginTop: 10, textAlign: 'center' }}>
              No obligation. We'll only use your contact info to follow up about your quote.
            </div>
          </div>
        )}

        {result && (
          <div style={{ background: '#fff', border: '1px solid #d6cdb8', borderRadius: 14, padding: 22, boxShadow: '0 1px 3px rgba(44,53,48,0.06)' }}>
            <div style={{ display: 'flex', gap: 10, padding: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, marginBottom: 18 }}>
              <Check size={20} style={{ color: '#15803d', flexShrink: 0 }} />
              <div style={{ fontSize: 14, color: '#15803d', fontWeight: 600 }}>Your quote is ready! We've also sent it to the {result.company_name} team.</div>
            </div>

            {tileUrl && (
              <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid #d6cdb8' }}>
                <img src={tileUrl} alt="Satellite preview" style={{ width: '100%', display: 'block' }} />
              </div>
            )}

            <div style={{ fontSize: 13, color: '#7d8a7f' }}>{result.address}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 14, marginBottom: 18, flexWrap: 'wrap' }}>
              <Stat label="Measured turf" value={`${(result.ai?.sqft || 0).toLocaleString()} sqft`} hint={`${Math.round((result.ai?.confidence || 0) * 100)}% confidence`} />
              <Stat label="Per visit" value={`$${(result.quote?.per_visit || 0).toFixed(2)}`} hint={`${result.quote?.predicted_minutes || 0} min`} />
              <Stat label="Mows / season" value={String(result.quote?.mows_per_season || 0)} hint={`$${(result.quote?.mows_total || 0).toFixed(2)} total`} />
            </div>

            <div style={{ padding: 16, background: '#5a6349', color: '#fff', borderRadius: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, opacity: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>Annual program total</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>${(result.quote?.annual_program_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Includes weekly mowing + 6-round treatment program.</div>
            </div>

            {result.ai?.reasoning && (
              <div style={{ fontSize: 12, color: '#4d5a52', fontStyle: 'italic', marginBottom: 14 }}>"{result.ai.reasoning}"</div>
            )}

            <button onClick={() => { setResult(null); setError(null) }} style={{ width: '100%', padding: 12, background: 'transparent', border: '1px solid #d6cdb8', borderRadius: 10, color: '#4d5a52', cursor: 'pointer', fontWeight: 500 }}>Quote another address</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4d5a52', marginBottom: 4 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d6cdb8', borderRadius: 8, background: '#f7f5ef', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div style={{ flex: 1, minWidth: 140, padding: 12, background: '#f7f5ef', border: '1px solid #d6cdb8', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: '#7d8a7f', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#2c3530', marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: '#7d8a7f', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}
