// Server-side address geocoding for the geocode-leads cron.
//
// Same approach that pinned the initial 869 leads (scripts/_geocode_leads*.mjs):
// US Census geocoder first (free, no key, good with Utah grid addresses), then
// Nominatim (OpenStreetMap) as a paced fallback. Addresses are normalized the
// way the cleanup pass learned to: suite/building fragments stripped, local
// shorthand expanded, state inferred from ZIP or city, and a city-less hit is
// only trusted on the Wasatch Front because Utah grid numbers repeat per town.

const STATE_RE = /\b(UT|AZ|ID|CA|CO|WY|NV|NM|TX|OR|WA|MT|Utah|Arizona|Idaho|California|Colorado|Wyoming|Nevada|Texas)\b/i
const AZ_CITY_RE = /\b(tempe|mesa|phoenix|gilbert|chandler|scottsdale|apache junction|queen creek|peoria|glendale|goodyear|avondale|surprise|buckeye|san tan valley|maricopa|casa grande|tucson)\b/i
const UT_CITY_RE = /\b(salt lake|west valley|ogden|provo|orem|lehi|draper|sandy|murray|holladay|riverton|bluffdale|farmington|vernal|richfield|cedar city|south jordan|west jordan|layton|bountiful|magna|taylorsville|midvale|kearns|herriman|american fork|pleasant grove|spanish fork|springville|logan|st\.? george|tooele|park city|heber|roy|clearfield|syracuse|kaysville|centerville|west haven|alpine|eagle mountain|saratoga springs|millcreek|cottonwood|lindon|payson|nephi|price|moab)\b/i

const hasState = a => STATE_RE.test(a)
const hasCity = a => UT_CITY_RE.test(a) || AZ_CITY_RE.test(a) || /\b\d{5}\b/.test(a)
const inRegion = r => !!r && r.lat >= 31 && r.lat <= 45.5 && r.lng >= -120.5 && r.lng <= -104
// City-less addresses are only trusted inside Salt Lake County (the company's
// home turf). Ogden and Provo have the same grid numbers, and a pin 60 km off
// is worse than no pin.
const onWasatch = r => !!r && r.lat >= 40.41 && r.lat <= 40.92 && r.lng >= -112.30 && r.lng <= -111.55
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Anything a geocoder could place needs a street number.
const looksGeocodable = a => !!a && a.trim().length >= 8 && /\d/.test(a) && !/^\s*p\.?o\.? box/i.test(a)

function inferState(a) {
  const zip = a.match(/\b(\d{5})\b/)?.[1]
  if (zip) {
    if (/^8[56]/.test(zip)) return 'AZ'
    if (/^84/.test(zip)) return 'UT'
    if (/^83/.test(zip)) return 'ID'
    if (/^89/.test(zip)) return 'NV'
  }
  if (AZ_CITY_RE.test(a)) return 'AZ'
  return 'UT'
}

function normalize(a) {
  let s = String(a).replace(/\s+/g, ' ').trim()
  s = s.replace(/\bUnited States\b/gi, '')
  s = s.replace(/[,\s-]*\b(bldg|building)\b\.?\s*[A-Za-z0-9-]+/gi, '')
  s = s.replace(/[,\s-]*\b(ste|suite|unit|apt|apartment|office|rm|room|floor|fl)\b\.?\s*#?\s*[A-Za-z0-9-]+/gi, '')
  s = s.replace(/\s*#\s*[A-Za-z0-9-]+/g, '')
  s = s.replace(/,\s*\d{1,4}\s*(-\s*\d{1,4})?\s*,/g, ',')
  s = s.replace(/\bSLC\b/gi, 'Salt Lake City').replace(/\bNSLC\b/gi, 'North Salt Lake').replace(/\bWVC\b/gi, 'West Valley City')
    .replace(/\bWV\b/g, 'West Valley City').replace(/\bPHX\b/gi, 'Phoenix').replace(/\bAJ\b/g, 'Apache Junction')
  s = s.replace(/\bUt\b/g, 'UT').replace(/,\s*UT\s*,\s*UT\b/gi, ', UT')
  s = s.replace(/\s*,\s*,+/g, ',').replace(/^\s*,|,\s*$/g, '').replace(/\s+,/g, ',').trim()
  if (!hasState(s)) s += ', ' + inferState(s)
  return s
}

async function census(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const m = (await res.json())?.result?.addressMatches?.[0]
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x, source: 'census' } : null
}

let lastNominatim = 0
async function nominatim(address) {
  const wait = 1100 - (Date.now() - lastNominatim)
  if (wait > 0) await sleep(wait)
  lastNominatim = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'JobScout/1.0 (Liahona lead geocoder)' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const j = await res.json()
  return j?.[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), source: 'nominatim' } : null
}

// Returns { lat, lng, source } or null. Never throws.
async function geocodeAddress(rawAddress, { allowNominatim = true } = {}) {
  if (!looksGeocodable(rawAddress)) return null
  const addr = normalize(rawAddress)
  const plausible = r => r && (hasCity(addr) ? inRegion(r) : onWasatch(r))
  let r = null
  try { r = await census(addr) } catch { /* miss */ }
  if (!plausible(r) && allowNominatim) {
    try { r = await nominatim(addr) } catch { /* miss */ }
  }
  return plausible(r) ? r : null
}

module.exports = { geocodeAddress, normalize, looksGeocodable }
