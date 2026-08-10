// Keep source maps OUT of the public deploy, and keep them where a crash can
// still be symbolicated.
//
// vite.config had sourcemap: true, so every build published its .map files.
// https://jobscout.appsannex.com/assets/index-<hash>.js.map returned 200 and
// 25.6 MB — the complete original source of a product being sold, on a public
// URL, and the map filename is just the bundle name plus ".map", so nothing
// was obscure about it.
//
// This runs after every build and ALWAYS deletes the maps from dist, so the
// exposure closes whether or not anything else is configured.
//
// If SUPABASE_SERVICE_ROLE_KEY is present in the build environment it first
// uploads them to a PRIVATE bucket keyed by the bundle hash — which is the
// hash client_errors.app_build records — so stacks can be turned back into
// real file and line numbers. Without the key it just deletes them: privacy is
// not conditional on the nice-to-have being set up.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.resolve(HERE, '../dist/assets')
const BUCKET = 'sourcemaps'

if (!fs.existsSync(ASSETS)) {
  console.log('[sourcemaps] no dist/assets — nothing to do')
  process.exit(0)
}

const maps = fs.readdirSync(ASSETS).filter(f => f.endsWith('.js.map'))
if (maps.length === 0) {
  console.log('[sourcemaps] none emitted')
  process.exit(0)
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (url && key) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    // Private by default — createBucket's public flag defaults to false.
    await sb.storage.createBucket(BUCKET, { public: false }).catch(() => {})
    for (const name of maps) {
      const body = fs.readFileSync(path.join(ASSETS, name))
      const { error } = await sb.storage.from(BUCKET).upload(name, body, {
        contentType: 'application/json', upsert: true,
      })
      if (error) console.warn(`[sourcemaps] upload failed for ${name}: ${error.message}`)
    }
    console.log(`[sourcemaps] stashed ${maps.length} map(s) privately`)
  } catch (e) {
    // Never fail a deploy over this. The delete below still runs.
    console.warn('[sourcemaps] upload skipped:', e?.message || e)
  }
} else {
  console.log('[sourcemaps] no service key in this environment — maps will be deleted, not stashed')
}

for (const name of maps) {
  fs.rmSync(path.join(ASSETS, name), { force: true })
}
console.log(`[sourcemaps] removed ${maps.length} map(s) from dist — not published`)
