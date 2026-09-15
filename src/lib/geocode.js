// Geocoding for the Liahona map.
//
// Uses the Google Geocoder when VITE_GOOGLE_MAPS_API_KEY is set (same loader
// as YardMeasure / Zach), and falls back to Nominatim otherwise. Results are
// persisted onto leads.latitude / longitude so a lead is only geocoded once.
//
// Nominatim's usage policy is ~1 request/second, so the batch helper paces
// itself when it is on the fallback path.

import { supabase } from './supabase'
import { hasMapsKey, loadGoogleMaps } from './googleMaps'

const memCache = new Map()

// The Maps script never calls back when the key is referrer-restricted for
// this origin, so cap the wait and fall through to Nominatim instead of hanging.
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Google Maps timed out')), ms))])

// Once the Maps script fails to load (bad or restricted key), stop trying for
// the rest of the session so every geocode/route doesn't wait out the timeout.
let googleBroken = false
export const googleMapsUsable = () => hasMapsKey() && !googleBroken
export const markGoogleMapsBroken = () => {
  googleBroken = true
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('google-maps-broken'))
}

// The Maps script calls window.gm_authFailure when the key is rejected for
// this origin (InvalidKeyMapError). Hook it so every consumer falls back at
// once instead of each waiting out its own timeout.
if (typeof window !== 'undefined') {
  const prev = window.gm_authFailure
  window.gm_authFailure = () => { markGoogleMapsBroken(); if (typeof prev === 'function') prev() }
}

async function googleGeocoder() {
  try {
    const google = await withTimeout(loadGoogleMaps(), 8000)
    return { google, geocoder: new google.maps.Geocoder() }
  } catch (e) {
    googleBroken = true
    throw e
  }
}

export async function geocodeAddress(address) {
  const key = (address || '').trim()
  if (!key) return null
  if (memCache.has(key)) return memCache.get(key)

  let result = null
  if (googleMapsUsable()) {
    try {
      const { geocoder } = await googleGeocoder()
      const { results } = await withTimeout(geocoder.geocode({ address: key }), 10000)
      const loc = results?.[0]?.geometry?.location
      if (loc) result = { lat: loc.lat(), lng: loc.lng(), formatted: results[0].formatted_address }
    } catch {
      // fall through to Nominatim
    }
  }
  if (!result) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(key)}`
      )
      const data = await res.json()
      if (data?.[0]) result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), formatted: data[0].display_name }
    } catch { /* offline or rate-limited */ }
  }

  memCache.set(key, result)
  return result
}

export async function reverseGeocode(lat, lng) {
  if (googleMapsUsable()) {
    try {
      const { geocoder } = await googleGeocoder()
      const { results } = await withTimeout(geocoder.geocode({ location: { lat, lng } }), 10000)
      if (results?.[0]) return results[0].formatted_address
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`)
    const data = await res.json()
    const a = data?.address
    if (a) {
      // "980 E Park Ave, Gilbert, AZ 85234" instead of Nominatim's 8-part display_name
      const street = [a.house_number, a.road].filter(Boolean).join(' ')
      const city = a.city || a.town || a.village || a.hamlet || a.county
      const short = [street, city, [a.state, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      if (short) return short
    }
    return data?.display_name || null
  } catch {
    return null
  }
}

// Geocode one lead and store the result. Returns the coords or null.
export async function geocodeLead(lead) {
  if (!lead?.address) return null
  const coords = await geocodeAddress(lead.address)
  if (!coords) return null
  const patch = { latitude: coords.lat, longitude: coords.lng, geocoded_at: new Date().toISOString() }
  const { error } = await supabase.from('leads').update(patch).eq('id', lead.id)
  if (error) {
    console.warn('[geocode] could not save coords for lead', lead.id, error.message)
    return null
  }
  return coords
}

// Geocode every lead that has an address but no coordinates.
// onProgress(done, total) is called after each lead.
export async function geocodeMissingLeads(leads, onProgress) {
  const todo = leads.filter(l => l.address && (l.latitude == null || l.longitude == null))
  const paced = !googleMapsUsable()
  let done = 0
  const results = {}
  for (const lead of todo) {
    results[lead.id] = await geocodeLead(lead)
    done += 1
    onProgress?.(done, todo.length)
    if (paced) await new Promise(r => setTimeout(r, 1100))
  }
  return results
}
