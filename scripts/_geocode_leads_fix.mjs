// One-off, pass 2 after _geocode_leads.mjs: clean up what the first pass got
// wrong or missed.
//
//   node scripts/_geocode_leads_fix.mjs --company 3 [--dry]
//
// 1. Misses: strip suite/building/unit fragments, expand local abbreviations
//    (SLC, WVC, PHX), and append ", UT" when no state is present, then retry
//    Census → Nominatim.
// 2. Wrong-state hits: a lead whose address names no state but geocoded
//    outside Utah (the company's home state) is re-run with ", UT" appended.
//    If that resolves inside Utah it is overwritten; otherwise the pin is
//    cleared, because a pin in the wrong state is worse than no pin.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: join(here, '..', '.env') })
config({ path: 'C:/JobScout/job-scout-web/.env' })
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const companyArg = argv.indexOf('--company') !== -1 ? Number(argv[argv.indexOf('--company') + 1]) : 3
const sleep = ms => new Promise(r => setTimeout(r, ms))

const STATE_RE = /\b(UT|AZ|ID|CA|CO|WY|NV|NM|TX|OR|WA|MT|Utah|Arizona|Idaho|California|Colorado|Wyoming|Nevada|Texas)\b/i
// The company works Utah and the Phoenix valley. Anything outside the
// Mountain West box is a wrong-state hit for an address that names no state.
const inRegion = r => r && r.lat >= 31 && r.lat <= 45.5 && r.lng >= -120.5 && r.lng <= -104
const hasState = a => STATE_RE.test(a)
const AZ_CITY_RE = /\b(tempe|mesa|phoenix|gilbert|chandler|scottsdale|apache junction|queen creek|peoria|glendale|goodyear|avondale|surprise|buckeye|san tan valley|maricopa|casa grande|tucson)\b/i
// An address with no city ("2047 S Painter Lane") is ambiguous: Utah grid
// numbers repeat in every town. Only trust a hit if it lands on the Wasatch
// Front, where nearly all of this company's work is.
const CITY_RE = /\b(salt lake|west valley|ogden|provo|orem|lehi|draper|sandy|murray|holladay|riverton|bluffdale|farmington|vernal|richfield|cedar city|south jordan|west jordan|layton|bountiful|magna|taylorsville|midvale|kearns|herriman|american fork|pleasant grove|spanish fork|springville|logan|st\.? george|tooele|park city|heber|roy|clearfield|syracuse|kaysville|centerville|west haven|alpine|eagle mountain|saratoga springs|millcreek|cottonwood|lindon|payson|nephi|price|moab)\b/i
const hasCity = a => CITY_RE.test(a) || AZ_CITY_RE.test(a) || /\b\d{5}\b/.test(a)
const onWasatch = r => r && r.lat >= 40.0 && r.lat <= 41.4 && r.lng >= -112.4 && r.lng <= -111.4
const plausible = (a, r) => r && (hasCity(a) ? inRegion(r) : onWasatch(r))
function inferState(a) {
  const zip = a.match(/\b(\d{5})\b/)?.[1]
  if (zip) {
    if (/^8[56]/.test(zip)) return 'AZ'
    if (/^84/.test(zip)) return 'UT'
    if (/^83/.test(zip)) return 'ID'
    if (/^8[9]/.test(zip)) return 'NV'
  }
  if (AZ_CITY_RE.test(a)) return 'AZ'
  return 'UT'
}

function normalize(a) {
  let s = a.replace(/\s+/g, ' ').trim()
  s = s.replace(/\bUnited States\b/gi, '')
  // "Bldg B Suite 150", "Building F Suite 101", "Ste C", "Suite a", "Unit 4", "#800", ", 8,", ", 255,", "700 -1300"
  s = s.replace(/[,\s-]*\b(bldg|building)\b\.?\s*[A-Za-z0-9-]+/gi, '')
  s = s.replace(/[,\s-]*\b(ste|suite|unit|apt|apartment|office|rm|room|floor|fl)\b\.?\s*#?\s*[A-Za-z0-9-]+/gi, '')
  s = s.replace(/\s*#\s*[A-Za-z0-9-]+/g, '')
  s = s.replace(/,\s*\d{1,4}\s*(-\s*\d{1,4})?\s*,/g, ',')          // ", 8," / ", 700 -1300,"
  s = s.replace(/\bSLC\b/gi, 'Salt Lake City').replace(/\bNSLC\b/gi, 'North Salt Lake').replace(/\bWVC\b/gi, 'West Valley City')
    .replace(/\bWV\b/g, 'West Valley City').replace(/\bPHX\b/gi, 'Phoenix').replace(/\bAJ\b/g, 'Apache Junction')
  s = s.replace(/\bUt\b/g, 'UT')
  s = s.replace(/,\s*UT\s*,\s*UT\b/gi, ', UT')
  s = s.replace(/\s*,\s*,+/g, ',').replace(/^\s*,|,\s*$/g, '').replace(/\s+,/g, ',').trim()
  if (!hasState(s)) s += ', ' + inferState(s)
  return s
}

async function census(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) return null
  const m = (await res.json())?.result?.addressMatches?.[0]
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x, source: 'census' } : null
}
let lastN = 0
async function nominatim(address) {
  const wait = 1100 - (Date.now() - lastN); if (wait > 0) await sleep(wait); lastN = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'JobScout/1.0 (Liahona lead geocoder)' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) return null
  const j = await res.json()
  return j?.[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), source: 'nominatim' } : null
}
async function resolve(addr) {
  let r = null
  try { r = await census(addr) } catch { /* miss */ }
  if (!r) { try { r = await nominatim(addr) } catch { /* miss */ } }
  return r
}
async function write(id, r) {
  if (DRY) return true
  const patch = r ? { latitude: r.lat, longitude: r.lng, geocoded_at: new Date().toISOString() } : { latitude: null, longitude: null, geocoded_at: null }
  const { error } = await sb.from('leads').update(patch).eq('id', id)
  if (error) { console.error(`  write failed for ${id}: ${error.message}`); return false }
  return true
}

async function main() {
  console.log(DRY ? '[dry run]' : '')
  // ---- 1. misses
  const { data: missed, error: e1 } = await sb.from('leads').select('id, address').eq('company_id', companyArg).is('latitude', null).not('address', 'is', null).neq('address', '')
  if (e1) throw e1
  const todo = missed.filter(l => /\d/.test(l.address) && l.address.trim().length >= 8)
  console.log(`misses to retry: ${todo.length}`)
  let fixed = 0, still = []
  for (const l of todo) {
    const addr = normalize(l.address)
    const r = await resolve(addr)
    if (plausible(l.address, r)) { fixed += 1; await write(l.id, r); console.log(`  ok   ${l.address}  ->  ${addr}  [${r.source}]`) }
    else { still.push(l.address); console.log(`  ${r ? 'doubt' : 'miss '} ${l.address}  ->  ${addr}${r ? `  (hit at ${r.lat.toFixed(2)},${r.lng.toFixed(2)} not trusted)` : ''}`) }
  }

  // ---- 2. wrong-state hits
  const { data: placed, error: e2 } = await sb.from('leads').select('id, address, latitude, longitude').eq('company_id', companyArg).not('latitude', 'is', null)
  if (e2) throw e2
  const suspects = placed.filter(l => !hasState(l.address) && !inRegion({ lat: l.latitude, lng: l.longitude }))
  console.log(`\nstate-less addresses placed outside the Mountain West: ${suspects.length}`)
  let moved = 0, cleared = 0
  for (const l of suspects) {
    const addr = normalize(l.address)
    const r = await resolve(addr)
    if (plausible(l.address, r)) { moved += 1; await write(l.id, r); console.log(`  moved   ${l.address}  ->  ${addr}  [${r.source}] (${r.lat.toFixed(2)},${r.lng.toFixed(2)})`) }
    else { cleared += 1; await write(l.id, null); console.log(`  cleared ${l.address}  (was ${l.latitude.toFixed(2)},${l.longitude.toFixed(2)})`) }
  }

  console.log(`\nDone. Misses fixed ${fixed}, still missing ${still.length}; wrong-state moved ${moved}, cleared ${cleared}.`)
}
main().catch(e => { console.error(e); process.exit(1) })
