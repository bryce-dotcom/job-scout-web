#!/usr/bin/env node
// Deploy Arnie's edge functions — but only what bundles.
//
// `supabase functions deploy` uploads whatever is on disk and reports
// success; the first request then fails to compile and every reply comes
// back empty. That happened on 2026-09-14: a duplicate `const words` in
// arnieFollowup.ts went out, and Arnie answered nothing for about a minute
// until the fix was deployed. A person could not have caught it faster; a
// bundler catches it in five milliseconds.
//
//   npm run arnie:deploy                       all four
//   npm run arnie:deploy -- arnie-chat         one
//
// Bundles each function with esbuild first (externalising the imports the
// Deno runtime resolves itself) and stops at the first that does not build.
// Nothing is deployed unless everything asked for builds.

import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ALL = ['arnie-chat', 'arnie-config', 'arnie-brief-push', 'arnie-nudge']
const PROJECT = 'tzrhfhisdeahrrmeksif'
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const fns = wanted.length ? wanted : ALL

for (const fn of fns) {
  const entry = resolve(root, 'supabase/functions', fn, 'index.ts')
  if (!existsSync(entry)) { console.error(`arnie:deploy — no such function: ${fn}`); process.exit(2) }
  try {
    await build({ entryPoints: [entry], bundle: true, write: false, platform: 'neutral', format: 'esm', logLevel: 'silent',
      external: ['jsr:*', 'npm:*', 'https://*', 'node:*'] })
    console.log(`bundles  ${fn}`)
  } catch (e) {
    console.error(`\narnie:deploy — ${fn} does not build. Nothing was deployed.\n`)
    for (const err of e.errors || [{ text: e.message }]) console.error(`  ${err.location ? err.location.file + ':' + err.location.line + '  ' : ''}${err.text}`)
    process.exit(1)
  }
}

for (const fn of fns) {
  console.log(`\ndeploying ${fn} …`)
  execSync(`npx supabase functions deploy ${fn} --project-ref ${PROJECT}`, { cwd: root, stdio: 'inherit' })
}
console.log(`\ndeployed: ${fns.join(', ')}`)
