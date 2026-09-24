// Server-side address geocoding for the geocode-leads cron.
//
// Same approach that pinned the initial 869 leads (scripts/_geocode_leads*.mjs):
// US Census geocoder first (free, no key, good with Utah grid addresses), then
// Nominatim (OpenStreetMap) as a paced fallback. Addresses are normalized the
// way the cleanup pass learned to: suite/building fragments stripped, local
// shorthand expanded, and the state added only when the address names a city
// that pins it.
//
// A city-less address ("1495 mountain view dr") is read the way the person who
// typed it meant it: near the tenant's home. The cron hands in the company's
// home (see homeFor) and the address is tried with the home city appended;
// a hit counts only within HOME_KM of home, because grid numbers repeat per
// town and a pin 60 km off is worse than no pin. With no home known, the
// legacy Salt Lake County box applies.

// A state is a two-letter code sitting where a state sits — before the ZIP or
// at the end — or a spelled-out name. Any US state: JobScout is not a Utah app.
const STATE_RE = /(?:,|\s)\s*(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b(?=\s*\d{5}(?:-\d{4})?\s*$|\s*$)|\b(Utah|Arizona|Idaho|California|Colorado|Wyoming|Nevada|New Mexico|Texas|Oregon|Washington|Montana|Florida|Georgia|Tennessee|Ohio|Massachusetts|North Carolina|Arkansas)\b/i
const AZ_CITY_RE = /\b(tempe|mesa|phoenix|gilbert|chandler|scottsdale|apache junction|queen creek|peoria|glendale|goodyear|avondale|surprise|buckeye|san tan valley|maricopa|casa grande|tucson)\b/i
const UT_CITY_RE = /\b(salt lake|west valley|ogden|provo|orem|lehi|draper|sandy|murray|holladay|riverton|bluffdale|farmington|vernal|richfield|cedar city|south jordan|west jordan|layton|bountiful|magna|taylorsville|midvale|kearns|herriman|american fork|pleasant grove|spanish fork|springville|logan|st\.? george|tooele|park city|heber|roy|clearfield|syracuse|kaysville|centerville|west haven|alpine|eagle mountain|saratoga springs|millcreek|cottonwood|lindon|payson|nephi|price|moab|vineyard|mapleton|salem|santaquin|highland|cedar hills|elk ridge|woodland hills)\b/i

const hasState = a => STATE_RE.test(a)
const hasZip = a => /\b\d{5}(?:-\d{4})?\b/.test(a)
const hasCity = a => UT_CITY_RE.test(a) || AZ_CITY_RE.test(a) || hasZip(a)
// The Mountain West box only applies to addresses whose ONLY evidence is a
// Utah/Arizona city name; anything with a state or ZIP is trusted wherever
// the geocoder puts it (both sources are already limited to the US).
const inRegion = r => !!r && r.lat >= 31 && r.lat <= 45.5 && r.lng >= -120.5 && r.lng <= -104
const inUS = r => !!r && r.lat >= 17 && r.lat <= 72 && r.lng >= -180 && r.lng <= -64
// Legacy anchor for a city-less address when the tenant's home is unknown:
// Salt Lake County (HHH's turf before homes existed).
const onWasatch = r => !!r && r.lat >= 40.41 && r.lat <= 40.92 && r.lng >= -112.30 && r.lng <= -111.55
// How far from the tenant's home a city-less address may land. Highland to
// Provo is 20 km; Highland to Ogden (same grid numbers, wrong town) is 80.
const HOME_KM = 60
const KM_PER_DEG = 111
const kmBetween = (a, b) => Math.hypot((a.lat - b.lat) * KM_PER_DEG, (a.lng - b.lng) * KM_PER_DEG * Math.cos(b.lat * Math.PI / 180))
const nearHome = (r, home, km = HOME_KM) => !!r && !!home && Number.isFinite(home.lat) && Number.isFinite(home.lng) && kmBetween(r, home) <= km
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Anything a geocoder could place needs a street number.
const looksGeocodable = a => !!a && a.trim().length >= 8 && /\d/.test(a) && !/^\s*p\.?o\.? box/i.test(a)

// Only when the address itself says so: a known Utah or Arizona city. A ZIP
// already pins the state for the geocoders, and an address with neither is
// left alone; it used to be stamped ', UT', which sent every other state's
// addresses to Utah ("Tampa, FL 33606" became "Tampa, UT").
function inferState(a) {
  if (AZ_CITY_RE.test(a)) return 'AZ'
  if (UT_CITY_RE.test(a)) return 'UT'
  return null
}

// ", FL 33606" / " NC" at the end of an address is the state, not a floor or
// a unit. Set it aside before the fragment stripping below and put it back.
const TAIL_RE = /(?:,|\s)\s*((?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b(?:\s*\d{5}(?:-\d{4})?)?)\s*$/i

function normalize(a) {
  let s = String(a).replace(/\s+/g, ' ').trim()
  s = s.replace(/\bUnited States\b/gi, '')
  let tail = ''
  const tm = s.match(TAIL_RE)
  if (tm) { tail = tm[1].toUpperCase().replace(/^([A-Z]{2})\s*(\d)/, '$1 $2'); s = s.slice(0, tm.index).replace(/[,\s]+$/, '') }
  s = s.replace(/[,\s-]*\b(bldg|building)\b\.?\s*[A-Za-z0-9-]+/gi, '')
  s = s.replace(/[,\s-]*\b(ste|suite|unit|apt|apartment|office|rm|room|floor|fl)\b\.?\s*#?\s*[A-Za-z0-9-]+/gi, '')
  s = s.replace(/\s*#\s*[A-Za-z0-9-]+/g, '')
  s = s.replace(/,\s*\d{1,4}\s*(-\s*\d{1,4})?\s*,/g, ',')
  s = s.replace(/\bSLC\b/gi, 'Salt Lake City').replace(/\bNSLC\b/gi, 'North Salt Lake').replace(/\bWVC\b/gi, 'West Valley City')
    .replace(/\bWV\b/g, 'West Valley City').replace(/\bPHX\b/gi, 'Phoenix').replace(/\bAJ\b/g, 'Apache Junction')
  s = s.replace(/\bUt\b/g, 'UT').replace(/,\s*UT\s*,\s*UT\b/gi, ', UT')
  s = s.replace(/\s*,\s*,+/g, ',').replace(/^\s*,|,\s*$/g, '').replace(/\s+,/g, ',').trim()
  if (tail) s += ', ' + tail
  if (!hasState(s) && !hasZip(s)) { const st = inferState(s); if (st) s += ', ' + st }
  return s
}

// Town shorthand that only means something near a Utah home ("1467 e dover
// drive sf" is Spanish Fork to a Spanish Fork lawn crew and San Francisco to
// nobody). Applied only to a city-less address for a Utah tenant.
const UT_SHORTHAND = { sf: 'Spanish Fork', pg: 'Pleasant Grove', af: 'American Fork', sj: 'South Jordan', wj: 'West Jordan', em: 'Eagle Mountain', ss: 'Saratoga Springs' }

// A city-less address read from the tenant's home: shorthand expanded, home
// city and state appended. Null when the address already says where it is.
function localize(addr, home) {
  if (!home?.city || !home?.state) return null
  if (hasState(addr) || hasCity(addr)) return null
  if (home.state === 'UT') {
    const m = addr.match(/[,\s]+(sf|pg|af|sj|wj|em|ss)\s*$/i)
    if (m) return `${addr.slice(0, m.index)}, ${UT_SHORTHAND[m[1].toLowerCase()]}, UT`
  }
  return `${addr}, ${home.city}, ${home.state}`
}

const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())

async function census(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const m = (await res.json())?.result?.addressMatches?.[0]
  if (!m) return null
  const c = m.addressComponents || {}
  return { lat: m.coordinates.y, lng: m.coordinates.x, source: 'census', city: titleCase(c.city), state: c.state ? String(c.state).toUpperCase() : '' }
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

// Is this hit believable for this address? State or ZIP: anywhere in the US.
// A Utah/Arizona city name alone: the Mountain West. Bare grid numbers with
// no city: near the tenant's home, or Salt Lake County when no home is known.
function plausibleFor(addr, r, home = null) {
  if (!r) return false
  if (hasState(addr) || hasZip(addr)) return inUS(r)
  if (hasCity(addr)) return inRegion(r)
  return home ? nearHome(r, home) : onWasatch(r)
}

// The tenant's home from its companies row: { lat, lng, city, state } or null.
// The Census match names the city, so "6395 W 10400 N Highland, UT 84003"
// with an empty city column still comes back as Highland, UT.
async function homeFor(company) {
  if (!company) return null
  const text = [company.address, company.city, company.state, company.zip].map(v => String(v || '').trim()).filter(Boolean).join(', ')
  if (!looksGeocodable(text)) return null
  try {
    const m = await census(normalize(text))
    if (!m || !m.city || !m.state) return null
    return { lat: m.lat, lng: m.lng, city: m.city, state: m.state }
  } catch { return null }
}

// Returns { lat, lng, source } or null. Never throws.
async function geocodeAddress(rawAddress, { allowNominatim = true, home = null } = {}) {
  if (!looksGeocodable(rawAddress)) return null
  const addr = normalize(rawAddress)
  const local = localize(addr, home)
  if (local) {
    let r = null
    try { r = await census(local) } catch { /* miss */ }
    if (nearHome(r, home)) return { lat: r.lat, lng: r.lng, source: 'census+home' }
  }
  const plausible = r => plausibleFor(addr, r, home)
  let r = null
  try { r = await census(addr) } catch { /* miss */ }
  if (!plausible(r) && allowNominatim) {
    try { r = await nominatim(addr) } catch { /* miss */ }
  }
  return plausible(r) ? { lat: r.lat, lng: r.lng, source: r.source } : null
}

module.exports = { geocodeAddress, homeFor, normalize, localize, looksGeocodable, plausibleFor, nearHome, HOME_KM }
