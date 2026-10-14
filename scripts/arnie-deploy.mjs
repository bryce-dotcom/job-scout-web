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
const ALL = ['arnie-chat', 'arnie-config', 'arnie-brief-push', 'arnie-nudge', 'convert-estimate', 'approve-document']
const PROJECT = 'tzrhfhisdeahrrmeksif'
// Any flag stops here. Flags used to be silently dropped, so
// `arnie-deploy --help` meant "deploy all six" — and on 2026-10-14 it did,
// from a worktree 27 commits behind main, briefly reverting a conversion fix.
if (process.argv.slice(2).some((a) => a.startsWith('-'))) {
  console.log('usage: npm run arnie:deploy [-- <function> ...]   (no flags; no names = all of: ' + ['arnie-chat', 'arnie-config', 'arnie-brief-push', 'arnie-nudge', 'convert-estimate', 'approve-document'].join(', ') + ')')
  process.exit(2)
}
const wanted = process.argv.slice(2)
const fns = wanted.length ? wanted : ALL

// Never deploy over newer code. A deploy uploads THIS checkout, so a worktree
// that is behind main on supabase/functions quietly reverts whatever landed
// since — for every tenant, with no commit to show for it.
try {
  execSync('git fetch -q origin main', { cwd: root, stdio: 'ignore' })
  const behind = execSync('git log --oneline HEAD..origin/main -- supabase/functions', { cwd: root, encoding: 'utf8' }).trim()
  if (behind) {
    console.error('\narnie:deploy — main has edge-function commits this checkout does not. Nothing was deployed.\n')
    console.error(behind.split('\n').map((l) => '  ' + l).join('\n'))
    console.error('\n  Rebase onto origin/main first, then deploy.\n')
    process.exit(1)
  }
} catch {
  console.warn('arnie:deploy — could not compare with origin/main (offline?). Deploying anyway.')
}

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
