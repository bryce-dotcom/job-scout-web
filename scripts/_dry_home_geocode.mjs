// Dry run: how many of a tenant's failed job addresses does home-anchoring
// pin? Reads the DB, calls Census for real, WRITES NOTHING.
//   node scripts/_dry_home_geocode.mjs 9
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'
import fs from 'node:fs'
const { geocodeAddress, homeFor, normalize, localize } = createRequire(import.meta.url)('../api/_lib/geocodeAddress.js')
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const cid = Number(process.argv[2] || 9)
const { data: co } = await sb.from('companies').select('id, address, city, state, zip').eq('id', cid).single()
const home = await homeFor(co)
console.log('home', JSON.stringify(home))
const { data } = await sb.from('jobs').select('job_address').eq('company_id', cid).not('geocode_failed_at', 'is', null).is('latitude', null).limit(60)
const uniq = [...new Set((data || []).map(r => r.job_address))]
let hits = 0
for (const a of uniq) {
  const n = normalize(a)
  const r = await geocodeAddress(a, { allowNominatim: false, home })
  if (r) hits += 1
  console.log(r ? 'HIT ' : 'miss', JSON.stringify(a), '=>', JSON.stringify(localize(n, home) || n), r ? `${r.lat.toFixed(4)},${r.lng.toFixed(4)} ${r.source}` : '')
}
console.log(`${hits} of ${uniq.length} distinct addresses pinned (census only, no writes)`)
