// One-off: geocode every job that has an address but no coordinates, so the
// Liahona map can show finished work and cloverleaf around it. Safe to re-run,
// it only touches rows where latitude is null. The cron keeps it current
// afterwards (/api/cron/geocode-leads handles jobs too).
//
//   node scripts/_geocode_jobs.mjs --company 3
//   node scripts/_geocode_jobs.mjs --company 3 --dry
//
// Uses the cron's own geocoder (api/_lib/geocodeAddress: Census first with
// Utah-aware normalisation, Nominatim as a paced fallback) so the backfill and
// the cron agree on what an address resolves to.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: join(here, '..', '.env') })
const require = createRequire(import.meta.url)
const { geocodeAddress, looksGeocodable } = require('../api/_lib/geocodeAddress.js')

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const companyArg = argv.indexOf('--company') !== -1 ? Number(argv[argv.indexOf('--company') + 1]) : null
if (!companyArg) { console.error('--company <id> is required'); process.exit(1) }

const jobs = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('jobs').select('id, job_id, job_address').eq('company_id', companyArg).is('latitude', null).not('job_address', 'is', null).neq('job_address', '').order('id').range(from, from + 999)
  if (error) throw error
  if (!data?.length) break
  jobs.push(...data); if (data.length < 1000) break
}
const todo = jobs.filter(j => looksGeocodable(j.job_address))
console.log(`${jobs.length} jobs without coords, ${todo.length} geocodable, ${jobs.length - todo.length} skipped (no street number)${DRY ? ' [dry run]' : ''}`)

const now = () => new Date().toISOString()
let done = 0, pinned = 0, failed = 0, nominatim = 0
const misses = []
const queue = [...todo]
// Census tolerates a few parallel requests; Nominatim is paced inside the
// geocoder, so only one worker is allowed to fall back to it.
async function worker(allowNominatim) {
  while (queue.length) {
    const job = queue.shift()
    let hit = null
    try { hit = await geocodeAddress(job.job_address, { allowNominatim }) } catch { hit = null }
    done += 1
    if (hit) {
      pinned += 1; if (hit.source === 'nominatim') nominatim += 1
      if (!DRY) { const { error } = await sb.from('jobs').update({ latitude: hit.lat, longitude: hit.lng, geocoded_at: now(), geocode_failed_at: null }).eq('id', job.id).is('latitude', null); if (error) console.error('  write failed', job.id, error.message) }
    } else {
      failed += 1; misses.push({ id: job.id, job_id: job.job_id, address: job.job_address })
      if (!DRY) await sb.from('jobs').update({ geocode_failed_at: now() }).eq('id', job.id).is('latitude', null)
    }
    if (done % 100 === 0) console.log(`  ${done}/${todo.length} — pinned ${pinned} (nominatim ${nominatim}), missed ${failed}`)
  }
}
await Promise.all([worker(true), worker(false), worker(false), worker(false)])
writeFileSync(join(here, 'geocode-job-misses.json'), JSON.stringify(misses, null, 2))
console.log(`\nDone. Pinned ${pinned} (Nominatim ${nominatim}), missed ${failed}, skipped ${jobs.length - todo.length}. Misses in scripts/geocode-job-misses.json`)
