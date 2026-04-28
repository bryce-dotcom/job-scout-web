// Lazy loader for the Google Maps JavaScript API.
// Loads once, returns the same promise on subsequent calls.
//
// Requires VITE_GOOGLE_MAPS_API_KEY in .env (or .env.local).
// The key should be HTTP-referrer restricted to your app's domains.
//
// Libraries loaded: places (autocomplete), drawing (polygon tool), geometry (area calc).

let loaderPromise = null

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

export function hasMapsKey() {
  return !!GOOGLE_MAPS_API_KEY
}

export function loadGoogleMaps() {
  if (loaderPromise) return loaderPromise
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))

  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY not set'))
  }

  if (window.google && window.google.maps) {
    loaderPromise = Promise.resolve(window.google)
    return loaderPromise
  }

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = '__zachGoogleMapsCb_' + Math.random().toString(36).slice(2)
    window[cbName] = () => {
      delete window[cbName]
      resolve(window.google)
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places,drawing,geometry&callback=${cbName}&loading=async`
    script.async = true
    script.defer = true
    script.onerror = () => {
      delete window[cbName]
      loaderPromise = null
      reject(new Error('Failed to load Google Maps JS'))
    }
    document.head.appendChild(script)
  })
  return loaderPromise
}

// Build a Google Static Maps URL for a property snapshot (used in the property card).
export function staticMapUrl({ lat, lng, polygon, width = 400, height = 240, zoom = 19 }) {
  if (!GOOGLE_MAPS_API_KEY || (!lat && !polygon?.length)) return null
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    maptype: 'satellite',
    zoom: String(zoom),
    key: GOOGLE_MAPS_API_KEY,
  })
  if (lat && lng) params.set('center', `${lat},${lng}`)
  let url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
  if (polygon && polygon.length >= 3) {
    const path = polygon.map(p => `${p.lat},${p.lng}`).join('|')
    url += `&path=color:0x22c55eff|weight:3|fillcolor:0x22c55e55|${path}`
  }
  return url
}
