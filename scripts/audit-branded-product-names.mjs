// Which products would leak the manufacturer through their NAME?
//
// The scrub cleans the specs, but the product's own name is printed as the
// sheet title and on the proposal card. The extraction run turned up products
// literally named "MES 220/280/320/260/400W Highbay" — MES is the maker. No
// amount of spec scrubbing fixes a name.
//
// Report only. Renaming a product is a business decision, not a script's.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDenyTerms, findLeaks } from '../supabase/functions/_shared/specScrub.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let all = []
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from('products_services')
    .select('id, name, active, manufacturer, model_number, dlc_listing_number, datasheet_json')
    .eq('company_id', 3).order('id').range(from, from + 999)
  if (!data?.length) break
  all = all.concat(data)
  if (data.length < 1000) break
}

const withSpecs = all.filter(p => p?.datasheet_json?.specs?.length)
console.log(`\n${all.length} products · ${withSpecs.length} now carry specifications\n`)

// A name leaks if the shared scrub would flag it — same rule the sheet uses.
const leaking = []
for (const p of all) {
  const deny = buildDenyTerms(p, p?.datasheet_json?.brand_terms || [])
  const hits = findLeaks({ name: p.name }, deny)
  if (hits.length) leaking.push({ p, hits })
}

console.log(`Product NAMES that would reveal the manufacturer: ${leaking.length}`)
if (leaking.length) {
  console.log('(the sheet is withheld for these rather than sent — they need renaming)\n')
  for (const { p, hits } of leaking.slice(0, 40)) {
    console.log(`  ${String(p.id).padEnd(6)}${String(p.name).slice(0, 50).padEnd(52)}${p.active ? '' : '(inactive) '}-> ${hits.join(', ')}`)
  }
  if (leaking.length > 40) console.log(`  ... and ${leaking.length - 40} more`)
}

// Products with a photo but no specs, and vice versa — worth knowing before a
// rep discovers it mid-send.
const noSpecs = all.filter(p => !p?.datasheet_json?.specs?.length && p.active)
console.log(`\nActive products with NO specifications yet: ${noSpecs.length}`)
console.log('\nNOTE: product photos may show a logo on the fixture itself. Text')
console.log('scrubbing cannot fix that — the images still need a human eye.\n')
