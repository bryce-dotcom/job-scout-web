// Google Places, for "what am I standing in front of".
//
// google-place-search already does TEXT search — you type a business name and
// it finds the Place ID. This is the other half: you have coordinates and no
// name, which is the actual field case. A rep pulls into a car park and wants
// the business, the address and the phone number without typing anything.
//
// Kept separate from google-place-search rather than folded into it: that
// function is wired into company setup and works, and the two calls want
// different request shapes, different field masks and different billing
// tiers. Nothing is gained by making one function do both.
//
// COST. The field mask is what Google bills on, and phone + website push a
// request out of the cheapest tier into Place Details Pro. That is the point
// of the call — a business name with no phone number does not save anybody a
// trip — but it is why maxResultCount is small and why the tool that calls
// this is not something Arnie reaches for unprompted.
//
// Needs GOOGLE_PLACES_API_KEY (Places API (New) enabled on the project), the
// same secret google-place-search and chris-streetview already use.

export interface NearbyPlace {
  place_id: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  types: string[]
  business_status: string | null
  /** Metres from the coordinates given. */
  distance_m: number | null
}

const EARTH_M = 6371000
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_M * Math.asin(Math.sqrt(s)))
}

/** Rough sanity check — a swapped lat/lng or a stale zero lands in the ocean. */
export function validCoords(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0)
}

/**
 * Businesses within `radius` metres, nearest first.
 *
 * Throws with Google's own message, because "Places returned 403
 * PERMISSION_DENIED: Places API (New) has not been used" is a secret that is
 * not switched on, and that is worth saying out loud rather than reporting as
 * "nothing nearby".
 */
export async function nearbyPlaces(
  apiKey: string, lat: number, lng: number, radius = 120, max = 6,
): Promise<NearbyPlace[]> {
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id', 'places.displayName', 'places.formattedAddress',
        'places.types', 'places.businessStatus',
        'places.nationalPhoneNumber', 'places.websiteUri', 'places.location',
      ].join(','),
    },
    body: JSON.stringify({
      // Clamped to Google's own limits: under 1m is rejected, and a radius
      // bigger than a car park stops answering "where am I" and starts
      // answering "what is in this town".
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(500, Math.max(10, radius)) } },
      maxResultCount: Math.min(10, Math.max(1, max)),
      rankPreference: 'DISTANCE',
    }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(`Places: ${body?.error?.message || `Google ${r.status}`}`)
  }
  return (body.places || []).map((p: Record<string, any>) => {
    const pl = p.location || {}
    return {
      place_id: String(p.id || ''),
      name: p.displayName?.text || '(unnamed)',
      address: p.formattedAddress || null,
      phone: p.nationalPhoneNumber || null,
      website: p.websiteUri || null,
      types: p.types || [],
      business_status: p.businessStatus || null,
      distance_m: validCoords(pl.latitude, pl.longitude)
        ? metresBetween(lat, lng, pl.latitude, pl.longitude) : null,
    }
  })
}

/**
 * The word to match a business on, for checking it against the tenant's own
 * customers. "Desert Ridge Dental Group, LLC" → "desert". Company suffixes
 * and the filler words every third business shares are dropped, because
 * matching on "the" or "llc" finds everybody.
 */
const NOISE = new Set([
  'the', 'and', 'of', 'at', 'a', 'an', 'llc', 'inc', 'co', 'corp', 'ltd', 'lp', 'llp',
  'company', 'group', 'services', 'service', 'solutions', 'enterprises', 'holdings',
  'center', 'centre', 'store', 'shop', 'north', 'south', 'east', 'west', 'new',
])
export function matchWord(name: string): string | null {
  const words = String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  for (const w of words) {
    if (w.length >= 4 && !NOISE.has(w)) return w
  }
  // Nothing distinctive — better to match nothing than to match everything.
  return null
}
