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
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// This script runs from two places and must resolve the same paths from both:
// scripts/ inside a worktree, and the synced deployment in <parent>/.jstools.
// Assuming the first (ROOT = script/..) makes the synced copy compute ROOT as
// the parent folder itself and PARENT as its parent — which put .githooks and
// .jstools at C:\ and pointed nothing at them. Detect which copy is running.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SYNCED = basename(SCRIPT_DIR) === '.jstools'
const PARENT = SYNCED ? resolve(SCRIPT_DIR, '..') : resolve(SCRIPT_DIR, '..', '..')

// Git commands need a real checkout to run in. The synced copy has none of its
// own, so borrow the first worktree under PARENT; it is only ever used to reach
// origin/main, so any of them will do.
const findCheckout = () => {
  for (const d of readdirSync(PARENT)) {
    const cand = join(PARENT, d)
    try { if (existsSync(join(cand, '.git'))) return cand } catch { /* not readable */ }
  }
  return null
}
const ROOT = SYNCED ? findCheckout() : resolve(SCRIPT_DIR, '..')
if (!ROOT) {
  console.error(`no git checkout found under ${PARENT} — cannot resolve origin/main`)
  process.exit(1)
}
const HOOKS_SRC = join(ROOT, '.githooks')
const HOOKS_DST = join(PARENT, '.githooks')

const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

// ── 1. hooks at a stable path ────────────────────────────────────────────
// Everything deployed below is read from origin/main, NOT from this worktree.
// Setup gets run from whichever checkout a session happens to be sitting in,
// and those run 28-319 commits behind. Deploying that tree's copy quietly
// downgrades the shared hooks and tools for all eight worktrees — the same
// staleness bug this tooling exists to prevent, pointed at itself. Reading
// from the remote ref makes the installer independent of its caller's branch.
try { git(['fetch', 'origin', 'main']) } catch { console.log('(offline — deploying from the local tree)') }

const fromMain = (p) => {
  try { return execFileSync('git', ['show', `origin/main:${p}`], { cwd: ROOT, encoding: 'utf8' }) }
  catch { return null }
}
const listMain = (dir) => {
  try {
    return execFileSync('git', ['ls-tree', '--name-only', `origin/main:${dir}`], { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  } catch { return [] }
}

mkdirSync(HOOKS_DST, { recursive: true })
const hookNames = listMain('.githooks')
const hooks = hookNames.length ? hookNames : readdirSync(HOOKS_SRC)
for (const f of hooks) {
  const body = hookNames.length ? fromMain(`.githooks/${f}`) : null
  if (body !== null) writeFileSync(join(HOOKS_DST, f), body)
  else copyFileSync(join(HOOKS_SRC, f), join(HOOKS_DST, f))
  try { chmodSync(join(HOOKS_DST, f), 0o755) } catch { /* windows */ }
}
console.log(`hooks installed -> ${HOOKS_DST}  [${hooks.join(', ')}] from ${hookNames.length ? 'origin/main' : 'local tree'}`)

// ── 1b. the tools, at the same stable path ───────────────────────────────
// A worktree sitting on a branch that predates these scripts gets blocked from
// pushing to main by the hook but has no `npm run ship` to use instead — all it
// can do is give up or work around the guard. Syncing the tools somewhere every
// worktree can reach, whatever branch it is on, keeps the sanctioned path
// available. The repo copy stays the source of truth; this is a deployment of
// it, refreshed every time setup runs.
const TOOLS_DST = join(PARENT, '.jstools')
mkdirSync(TOOLS_DST, { recursive: true })
// setup-sessions.mjs deploys itself too. Without that, a stale worktree runs
// its own stale installer and re-deploys stale tools — the bootstrap hole.
// The synced copy re-reads from origin/main on every run, so it cannot rot.
for (const f of ['ship.mjs', 'where.mjs', 'deployed.mjs', 'fresh.mjs', 'setup-sessions.mjs']) {
  const body = fromMain(`scripts/${f}`)
  if (body !== null) writeFileSync(join(TOOLS_DST, f), body)
  else if (existsSync(join(ROOT, 'scripts', f))) copyFileSync(join(ROOT, 'scripts', f), join(TOOLS_DST, f))
}
console.log(`tools installed -> ${TOOLS_DST}  (usable from any worktree, any branch)`)

// ── 1c. no local `main` branch ───────────────────────────────────────────
// `git push origin main` pushes the local `main` REF. When that ref exists and
// matches the remote, the push is a no-op that prints "Everything up-to-date"
// and exits 0 — and git skips pre-push entirely for a no-op, so no hook can
// catch it. With no local `main`, the same command fails loudly with "src
// refspec main does not match any". Recreated by some fetch/worktree
// operations, so it is removed on every setup run.
try {
  const checkedOut = git(['worktree', 'list']).split('\n').some(l => /\[main\]/.test(l))
  const exists = git(['branch', '--list', 'main']).trim().length > 0
  if (exists && !checkedOut) {
    git(['branch', '-D', 'main'])
    console.log('removed the local `main` branch (use origin/main; land work with npm run ship)')
  }
} catch { /* nothing to remove */ }

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
