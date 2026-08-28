#!/usr/bin/env node
// npm run claim [name]   — take this worktree, or find a free one
// npm run claim -- --release   — give it back
// npm run claim -- --list      — who holds what
//
// Why this exists.
//
// More directories on their own do not fix anything. On 27 Aug three sessions
// were working inside js-main-wt at the same time. One re-cut the branch under
// another. One staged its files while a second was about to commit. A third
// ran `git stash`, swept up a fourth's edit to .githooks/pre-push, and the pop
// then conflicted and reverted its own work. Nothing was corrupted, but only
// because someone noticed each time.
//
// Nothing in git prevents this. A worktree has no owner, so every session
// assumes an empty-looking directory is free. This gives it one.
//
// The claim is a file, not a lock. It cannot stop a determined process, and it
// is not trying to — it exists so a session ASKS before settling in, and so a
// human can see who is where. A stale claim expires on its own, because an
// agent that dies mid-task must not wedge a directory forever.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'

const STALE_MINUTES = 90
const MARK = '.worktree-claim.json'

const ROOT = (() => {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() }
  catch { console.error('\n  not inside a git repo\n'); process.exit(1) }
})()
const git = (args, cwd = ROOT) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim() } catch { return '' }
}

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const name = argv.find((a) => !a.startsWith('-'))

const worktrees = () => {
  const out = []
  let cur = null
  for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9).trim(), branch: null }
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace('refs/heads/', '')
    else if (line === '' && cur) { out.push(cur); cur = null }
  }
  if (cur) out.push(cur)
  return out
}

const readClaim = (p) => {
  const f = join(p, MARK)
  if (!existsSync(f)) return null
  try {
    const c = JSON.parse(readFileSync(f, 'utf8'))
    const ageMin = (Date.now() - new Date(c.at).getTime()) / 60000
    return { ...c, ageMin, stale: ageMin > STALE_MINUTES }
  } catch { return null }
}

const dirtyCount = (p) => git(['status', '--porcelain'], p).split('\n').filter(Boolean).length

// A directory is free when nobody holds it, or the holder has gone quiet AND
// left nothing behind. Uncommitted work means someone's task is still open
// there, however long ago they last spoke.
const isFree = (w) => {
  const c = readClaim(w.path)
  if (dirtyCount(w.path) > 0) return false
  return !c || c.stale
}

if (has('--list')) {
  console.log('')
  for (const w of worktrees()) {
    const c = readClaim(w.path)
    const d = dirtyCount(w.path)
    const who = c
      ? `${c.who}${c.stale ? ` (stale, quiet ${Math.round(c.ageMin)}m)` : ` (${Math.round(c.ageMin)}m ago)`}`
      : (d ? 'unclaimed but DIRTY' : 'free')
    console.log(`  ${basename(w.path).padEnd(24)} ${String(w.branch || '-').padEnd(28)} ${d ? String(d).padStart(4) + ' dirty  ' : '          '}${who}`)
  }
  console.log('')
  process.exit(0)
}

if (has('--release')) {
  const f = join(ROOT, MARK)
  if (existsSync(f)) { rmSync(f); console.log(`\n  released ${basename(ROOT)}\n`) }
  else console.log(`\n  ${basename(ROOT)} was not claimed\n`)
  process.exit(0)
}

// ── claim the worktree we are standing in ────────────────────────────────
const who = name || process.env.CLAUDE_AGENT || `session-${process.pid}`
const mine = readClaim(ROOT)

if (mine && !mine.stale && mine.who !== who) {
  console.error(`\n  ${basename(ROOT)} is already claimed by "${mine.who}" (${Math.round(mine.ageMin)} minutes ago).`)
  console.error(`  Working here means two sessions editing the same files — that has already`)
  console.error(`  cost reverted work in this repo.\n`)
  const free = worktrees().filter((w) => w.path !== ROOT && isFree(w))
  if (free.length) {
    console.error(`  Free directories to launch in instead:`)
    for (const w of free.slice(0, 8)) console.error(`    ${w.path}`)
  } else {
    console.error(`  No free worktree right now. Add one:`)
    console.error(`    git worktree add -b work/agent-N /c/JobScout/js-agent-N origin/main`)
  }
  console.error(`\n  If "${mine.who}" is definitely gone:  npm run claim -- --release\n`)
  process.exit(1)
}

writeFileSync(join(ROOT, MARK), JSON.stringify({
  who,
  pid: process.pid,
  at: new Date().toISOString(),
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
}, null, 2) + '\n')

const behind = git(['rev-list', '--count', 'HEAD..origin/main'])
console.log(`\n  ${basename(ROOT)} is yours — claimed as "${who}".`)
console.log(`  branch ${git(['rev-parse', '--abbrev-ref', 'HEAD'])}${behind && behind !== '0' ? `, ${behind} behind main` : ''}`)

// A brand-new worktree is missing everything git does not track. Both of these
// are gitignored, so `git worktree add` produces a directory that looks
// complete and then fails in a way that reads like a code bug: with no .env,
// vitest dies on "supabaseUrl is required" while collecting, and five test
// FILES fail to load with zero failing assertions. Say it plainly here instead.
const missing = []
if (!existsSync(join(ROOT, '.env'))) missing.push('.env')
if (!existsSync(join(ROOT, 'node_modules'))) missing.push('node_modules')
if (missing.length) {
  console.log(`\n  this worktree is missing ${missing.join(' and ')} — neither is tracked by git.`)
  if (missing.includes('.env')) console.log(`    cp ../js-main-wt/.env .`)
  if (missing.includes('node_modules')) console.log(`    npm install`)
  console.log(`  until then tests fail on load, not on logic.`)
}

if (behind && behind !== '0') console.log(`\n  start clean:  npm run fresh -- <short-name>`)
console.log(`  when done:    npm run claim -- --release\n`)
