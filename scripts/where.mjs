#!/usr/bin/env node
// npm run where — answer "which checkout am I in and is it safe to commit here?"
//
// Run this BEFORE committing. Four sessions share these worktrees and switch
// their branches mid-flight; "js-main-wt tracks main" was true when it was
// written down and false an hour later. Every assumption below has already
// been wrong at least once:
//
//   - "I am on main"            -> was on feat/company-map-and-watchdog-api
//   - "the tree is mine"        -> 483 uncommitted files from another session
//   - "my dev server is mine"   -> was serving a different worktree entirely

import { execFileSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved from the CURRENT directory, not from where this file lives, so a
// session whose branch predates these scripts can still run the copy that
// setup-sessions syncs to a stable path outside the worktrees.
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const git = (args, cwd = ROOT) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim() } catch { return '' } }

const here = ROOT.split(/[\\/]/).pop()
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
const head = git(['rev-parse', '--short', 'HEAD'])
const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean)
const hooks = git(['config', 'core.hooksPath']) || '(NOT SET — run npm run setup:sessions)'

git(['fetch', '--quiet', 'origin'])
const originMain = git(['rev-parse', '--short', 'origin/main'])
const ahead = git(['rev-list', '--count', 'origin/main..HEAD'])
const behind = git(['rev-list', '--count', 'HEAD..origin/main'])

console.log(`\nYOU ARE IN   ${here}`)
console.log(`branch       ${branch} @ ${head}`)
console.log(`origin/main  ${originMain}   (you are ${ahead} ahead, ${behind} behind)`)
console.log(`hooksPath    ${hooks}`)

if (dirty.length) {
  console.log(`\nUNCOMMITTED  ${dirty.length} file(s) — check these are YOURS before committing:`)
  for (const l of dirty.slice(0, 10)) console.log(`  ${l}`)
  if (dirty.length > 10) console.log(`  …and ${dirty.length - 10} more`)
} else {
  console.log('\nUNCOMMITTED  none — clean')
}

if (branch !== 'main') {
  console.log(`\nNOTE: you are NOT on main. \`git push origin main\` from here pushes nothing`)
  console.log(`      and exits 0. Land work with:  npm run ship`)
}

// ── the other sessions ───────────────────────────────────────────────────
const blocks = git(['worktree', 'list', '--porcelain']).split('\n\n')
console.log('\nOTHER CHECKOUTS')
for (const b of blocks) {
  const p = (b.match(/^worktree (.+)$/m) || [])[1]
  if (!p) continue
  const abs = resolve(p)
  if (abs === ROOT) continue
  const br = (b.match(/^branch refs\/heads\/(.+)$/m) || [])[1] || '(detached)'
  const n = git(['status', '--porcelain'], abs).split('\n').filter(Boolean).length
  console.log(`  ${abs.split(/[\\/]/).pop().padEnd(18)} ${br.padEnd(40)} ${n ? `${n} dirty — someone is working here` : 'clean'}`)
}
console.log('\nDo not commit in a checkout that is dirty with work you did not do.\n')
