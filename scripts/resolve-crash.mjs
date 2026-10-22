#!/usr/bin/env node
// Turn a production stack frame back into a file and a line.
//
// A crash in a built bundle reads "Cannot access 'Gr' before initialization"
// at index-BX-koiVH.js:1487:37317, which tells nobody anything — and by the
// time somebody looks, Vercel is serving a newer bundle and the old one is a
// 404. The SOURCEMAPS survive: scripts/stash-sourcemaps.mjs puts every build's
// maps in the private `sourcemaps` bucket (5,390 of them, back to August), so
// the frame can still be resolved weeks later.
//
//   node scripts/resolve-crash.mjs <client_errors.id>
//   node scripts/resolve-crash.mjs --build index-BX-koiVH --at 1487:37317
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
config()

const argv = process.argv.slice(2)
const argOf = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let frames = []
let header = ''
const explicitBuild = argOf('--build')
if (explicitBuild) {
  const [line, col] = String(argOf('--at') || '0:0').split(':').map(Number)
  frames = [{ file: explicitBuild + '.js', line, col, fn: '' }]
  header = `${explicitBuild} @ ${line}:${col}`
} else {
  const id = argv.find((a) => /^\d+$/.test(a))
  if (!id) { console.error('usage: resolve-crash.mjs <client_errors.id>   |   --build index-XXXX --at line:col'); process.exit(1) }
  const { data, error } = await db.from('client_errors').select('message, route, app_build, stack, component, last_seen_at').eq('id', id).maybeSingle()
  if (error || !data) { console.error('no such crash:', error?.message || id); process.exit(1) }
  header = `${data.message}\n  ${data.route}   build ${data.app_build}   ${String(data.last_seen_at).slice(0, 16).replace('T', ' ')}`
  const text = `${data.stack || ''}\n${data.component || ''}`
  const seen = new Set()
  for (const m of text.matchAll(/([A-Za-z0-9_$]*)@?https?:\/\/[^/]+\/assets\/(index-[A-Za-z0-9_-]+)\.js:(\d+):(\d+)/g)) {
    const key = `${m[2]}|${m[3]}|${m[4]}`
    if (seen.has(key)) continue      // React's reconciler repeats the same frame dozens of times
    seen.add(key)
    frames.push({ fn: m[1], file: m[2] + '.js', line: +m[3], col: +m[4] })
  }
}

const maps = new Map()
async function mapFor(file) {
  if (maps.has(file)) return maps.get(file)
  const { data, error } = await db.storage.from('sourcemaps').download(`${file}.map`)
  if (error || !data) { maps.set(file, null); return null }
  const tm = new TraceMap(JSON.parse(await data.text()))
  maps.set(file, tm)
  return tm
}

console.log(`\n${header}\n${'='.repeat(70)}`)
let resolved = 0
for (const f of frames.slice(0, 25)) {
  const tm = await mapFor(f.file)
  if (!tm) { console.log(`  ${f.fn || '(anon)'}  —  no map kept for ${f.file}`); continue }
  const pos = originalPositionFor(tm, { line: f.line, column: f.col })
  if (!pos.source) { console.log(`  ${f.fn || '(anon)'}  —  ${f.line}:${f.col} not in the map`); continue }
  resolved++
  const src = pos.source.replace(/^.*\/src\//, 'src/').replace(/^.*node_modules\//, 'node_modules/')
  console.log(`  ${String(f.fn || '(anon)').padEnd(6)}  ${src}:${pos.line}${pos.name ? `  (${pos.name})` : ''}`)
}
if (!resolved) console.log('\nNothing resolved — the maps for that build may have been pruned.')
console.log('')
