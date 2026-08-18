#!/usr/bin/env node
// npm run setup:sessions — make four concurrent sessions safe to run.
//
// Nothing here changes what anyone is working on. It installs the guard rails
// that stop sessions from silently ruining each other's work:
//
//   1. Shared git hooks at a path OUTSIDE every worktree. Pointing hooksPath at
//      a worktree's own .githooks fails the moment that worktree switches to a
//      branch that predates the hook — which is exactly when it is needed.
//   2. A dev-server port per worktree, so four `npm run dev` processes coexist
//      instead of silently serving each other's code. A session once verified a
//      fix against a dev server running the WRONG worktree, on a branch two
//      months stale, and believed the result.
//
// Safe to re-run.

import { execFileSync } from 'node:child_process'
import { mkdirSync, copyFileSync, readdirSync, chmodSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const PARENT = resolve(ROOT, '..')
const HOOKS_SRC = join(ROOT, '.githooks')
const HOOKS_DST = join(PARENT, '.githooks')

const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

// ── 1. hooks at a stable path ────────────────────────────────────────────
mkdirSync(HOOKS_DST, { recursive: true })
for (const f of readdirSync(HOOKS_SRC)) {
  copyFileSync(join(HOOKS_SRC, f), join(HOOKS_DST, f))
  try { chmodSync(join(HOOKS_DST, f), 0o755) } catch { /* windows */ }
}
console.log(`hooks installed -> ${HOOKS_DST}`)

// ── 2. every worktree uses them ──────────────────────────────────────────
const worktrees = git(['worktree', 'list', '--porcelain'])
  .split('\n\n')
  .map(block => {
    const path = (block.match(/^worktree (.+)$/m) || [])[1]
    const branch = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1] || '(detached)'
    return path ? { path: resolve(path), branch } : null
  })
  .filter(Boolean)

// Deterministic port per worktree so a session always gets the same one and two
// sessions can never be handed the same port.
const BASE_PORT = 5180
const withPorts = worktrees
  .slice()
  .sort((a, b) => a.path.localeCompare(b.path))
  .map((w, i) => ({ ...w, port: BASE_PORT + i }))

for (const w of withPorts) {
  try {
    execFileSync('git', ['config', 'core.hooksPath', HOOKS_DST.replace(/\\/g, '/')], { cwd: w.path })
    console.log(`  ${w.path.split(/[\\/]/).pop().padEnd(18)} ${w.branch.padEnd(40)} port ${w.port}`)
  } catch (e) {
    console.log(`  ${w.path} — could not set hooksPath: ${e.message.split('\n')[0]}`)
  }
}

// ── 3. one launch config per worktree, each on its own port ──────────────
const launchPath = join(PARENT, '.claude', 'launch.json')
let launch = { version: '0.0.1', configurations: [] }
if (existsSync(launchPath)) {
  try { launch = JSON.parse(readFileSync(launchPath, 'utf8')) } catch { /* rewrite it */ }
}
// Keep any config that isn't one of ours (other projects live in here too).
const mine = new Set(withPorts.map(w => `wt-${w.path.split(/[\\/]/).pop()}`))
launch.configurations = (launch.configurations || []).filter(c => !mine.has(c.name))
for (const w of withPorts) {
  launch.configurations.push({
    name: `wt-${w.path.split(/[\\/]/).pop()}`,
    runtimeExecutable: 'npm',
    runtimeArgs: ['--prefix', w.path.replace(/\\/g, '/'), 'run', 'dev', '--', '--port', String(w.port), '--strictPort'],
    port: w.port,
  })
}
mkdirSync(dirname(launchPath), { recursive: true })
writeFileSync(launchPath, JSON.stringify(launch, null, 2) + '\n')
console.log(`\nlaunch configs written -> ${launchPath}`)
console.log('start YOUR worktree with the config named  wt-<worktree-folder>')
console.log('--strictPort means it fails loudly instead of drifting onto a neighbour\'s port.')
