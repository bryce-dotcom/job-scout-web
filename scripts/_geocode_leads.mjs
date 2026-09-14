// One-off: geocode every lead that has an address but no coordinates, so the
// Liahona map has pins on day one. Safe to re-run — it only touches rows
// where latitude is null.
//
//   node scripts/_geocode_leads.mjs            # all companies
//   node scripts/_geocode_leads.mjs --company 3
//   node scripts/_geocode_leads.mjs --dry      # resolve, don't write
//
// Sources, in order:
//   1. US Census Bureau geocoder — free, no key, handles Utah grid addresses,
//      tolerates a few parallel requests.
//   2. Nominatim (OpenStreetMap) — fallback for what Census misses, paced at
//      one request per second per its usage policy.
// Misses are written to geocode-misses.json next to this script for review.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: join(here, '..', '.env') })
config({ path: 'C:/JobScout/job-scout-web/.env' })

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const companyArg = argv.indexOf('--company') !== -1 ? Number(argv[argv.indexOf('--company') + 1]) : null

const sleep = ms => new Promise(r => setTimeout(r, ms))

// "UT", "UT, UT", "n/a" — nothing a geocoder can place. Require a digit.
const looksGeocodable = a => a && a.trim().length >= 8 && /\d/.test(a)

function clean(a) {
  return a.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').replace(/United States/i, '').replace(/,\s*$/, '').trim()
}

async function census(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`census HTTP ${res.status}`)
  const j = await res.json()
  const m = j?.result?.addressMatches?.[0]
  if (!m) return null
  return { lat: m.coordinates.y, lng: m.coordinates.x, source: 'census', matched: m.matchedAddress }
}

let lastNominatim = 0
async function nominatim(address) {
  const wait = 1100 - (Date.now() - lastNominatim)
  if (wait > 0) await sleep(wait)
  lastNominatim = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'JobScout/1.0 (Liahona lead geocoder)' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`nominatim HTTP ${res.status}`)
  const j = await res.json()
  if (!j?.[0]) return null
  return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), source: 'nominatim', matched: j[0].display_name }
}

async function main() {
  let q = sb.from('leads').select('id, company_id, address').is('latitude', null).not('address', 'is', null).neq('address', '').order('id')
  if (companyArg) q = q.eq('company_id', companyArg)
  const { data: leads, error } = await q.range(0, 4999)
  if (error) throw error

  const todo = leads.filter(l => looksGeocodable(l.address))
  const skipped = leads.length - todo.length
  console.log(`${leads.length} leads without coords, ${todo.length} geocodable, ${skipped} skipped (no street number)${DRY ? ' [dry run]' : ''}`)

  const misses = []
  let hits = { census: 0, nominatim: 0 }, done = 0, written = 0
  const censusMisses = []

  // Pass 1: Census, 4 at a time.
  const queue = [...todo]
  async function worker() {
    while (queue.length) {
      const lead = queue.shift()
      const addr = clean(lead.address)
      let r = null
      try { r = await census(addr) } catch (e) { /* treat as miss, Nominatim gets it */ }
      done += 1
      if (r) {
        hits.census += 1
        if (!DRY) {
          const { error: uerr } = await sb.from('leads').update({ latitude: r.lat, longitude: r.lng, geocoded_at: new Date().toISOString() }).eq('id', lead.id)
          if (uerr) console.error(`  write failed for lead ${lead.id}: ${uerr.message}`); else written += 1
        }
      } else {
        censusMisses.push(lead)
      }
      if (done % 50 === 0) console.log(`  census pass: ${done}/${todo.length} (${hits.census} found)`)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  console.log(`census pass done: ${hits.census} found, ${censusMisses.length} to retry via Nominatim (~${Math.round(censusMisses.length * 1.1 / 60)} min)`)

  // Pass 2: Nominatim, one per second.
  let n = 0
  for (const lead of censusMisses) {
    const addr = clean(lead.address)
    let r = null
    try { r = await nominatim(addr) } catch (e) { /* miss */ }
    n += 1
    if (r) {
      hits.nominatim += 1
      if (!DRY) {
        const { error: uerr } = await sb.from('leads').update({ latitude: r.lat, longitude: r.lng, geocoded_at: new Date().toISOString() }).eq('id', lead.id)
        if (uerr) console.error(`  write failed for lead ${lead.id}: ${uerr.message}`); else written += 1
      }
    } else {
      misses.push({ id: lead.id, company_id: lead.company_id, address: lead.address })
    }
    if (n % 25 === 0) console.log(`  nominatim pass: ${n}/${censusMisses.length} (${hits.nominatim} found)`)
  }

  writeFileSync(join(here, 'geocode-misses.json'), JSON.stringify(misses, null, 2))
  console.log(`\nDone. Census ${hits.census}, Nominatim ${hits.nominatim}, misses ${misses.length}, skipped ${skipped}, rows written ${written}.`)
  console.log(`Misses saved to scripts/geocode-misses.json`)
}

main().catch(e => { console.error(e); process.exit(1) })
