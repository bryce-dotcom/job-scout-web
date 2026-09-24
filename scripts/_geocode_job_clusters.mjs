// One-off follow-up to _geocode_jobs.mjs: the misses are dominated by a few
// commercial sites that repeat hundreds of times with building/suite
// fragments the geocoders choke on ("3300 N Running Creek Way, Bldg B Suite
// 150, Lehi"). Geocode each site's street+city ONCE and pin every job that
// shares it. Reversible: only rows with latitude null are touched.
//
//   node scripts/_geocode_job_clusters.mjs --company 3 [--dry] [--min 3]

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: join(here, '..', '.env') })
const { geocodeAddress } = createRequire(import.meta.url)('../api/_lib/geocodeAddress.js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const company = Number(argv[argv.indexOf('--company') + 1])
const MIN = argv.includes('--min') ? Number(argv[argv.indexOf('--min') + 1]) : 3
if (!company) { console.error('--company <id> required'); process.exit(1) }

const CITY = /\b(salt lake city|west valley city|ogden|provo|orem|lehi|draper|sandy|murray|holladay|riverton|bluffdale|farmington|vernal|richfield|cedar city|south jordan|west jordan|layton|bountiful|magna|taylorsville|midvale|kearns|herriman|american fork|pleasant grove|spanish fork|springville|logan|st\.? george|tooele|park city|heber( city)?|roy|clearfield|syracuse|kaysville|centerville|west haven|alpine|eagle mountain|saratoga springs|millcreek|cottonwood heights|lindon|payson|nephi|price|moab|north salt lake|woods cross|south salt lake|highland|cedar hills|mapleton|santaquin|salem|vineyard|hyrum|smithfield|brigham city|tremonton|washington|hurricane|ivins|santa clara|mesa|tempe|phoenix|gilbert|chandler|scottsdale|queen creek|apache junction|peoria|glendale|goodyear|avondale|surprise|buckeye|san tan valley|maricopa|casa grande|tucson)\b/i
const clean = s => String(s || '').replace(/\s+/g, ' ').trim()
// Street = up to the first comma, with building/suite/unit fragments cut off.
const street = a => clean(a).split(',')[0].replace(/\s+(bldg|building|suite|ste|unit|#|apt)\b.*$/i, '').trim()
const cityOf = a => (clean(a).match(CITY) || [])[0] || ''
const stateOf = a => /\b(az|arizona)\b/i.test(a) || /\b8[56]\d{3}\b/.test(a) ? 'AZ' : 'UT'

const jobs = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('jobs').select('id, job_address').eq('company_id', company).is('latitude', null).not('job_address', 'is', null).neq('job_address', '').order('id').range(from, from + 999)
  if (error) throw error
  if (!data?.length) break
  jobs.push(...data); if (data.length < 1000) break
}
const clusters = new Map()
for (const j of jobs) {
  const st = street(j.job_address), city = cityOf(j.job_address)
  if (!/\d/.test(st) || !city) continue
  const key = `${st.toLowerCase()}|${city.toLowerCase()}`
  const c = clusters.get(key) || { query: `${st}, ${city}, ${stateOf(j.job_address)}`, ids: [] }
  c.ids.push(j.id); clusters.set(key, c)
}
const big = [...clusters.values()].filter(c => c.ids.length >= MIN).sort((a, b) => b.ids.length - a.ids.length)
console.log(`${jobs.length} jobs still unpinned; ${big.length} sites repeat ${MIN}+ times (${big.reduce((s, c) => s + c.ids.length, 0)} jobs)${DRY ? ' [dry run]' : ''}`)
let pinned = 0, sites = 0
for (const c of big) {
  let hit = null
  try { hit = await geocodeAddress(c.query, { allowNominatim: true }) } catch { hit = null }
  console.log(`${String(c.ids.length).padStart(4)} × ${c.query} → ${hit ? `${hit.lat.toFixed(5)},${hit.lng.toFixed(5)} (${hit.source})` : 'no match'}`)
  if (!hit || DRY) continue
  for (let i = 0; i < c.ids.length; i += 200) {
    const { error, count } = await sb.from('jobs').update({ latitude: hit.lat, longitude: hit.lng, geocoded_at: new Date().toISOString(), geocode_failed_at: null }, { count: 'exact' }).in('id', c.ids.slice(i, i + 200)).is('latitude', null)
    if (error) console.error('  write failed', error.message); else pinned += count || 0
  }
  sites += 1
}
console.log(`\nDone: ${pinned} jobs pinned across ${sites} sites.`)
