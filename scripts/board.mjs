#!/usr/bin/env node
// npm run board — what changed across the whole system since last time.
//
// WHY THIS EXISTS. On 2026-10-22 twelve commits landed on main in three
// hours, from nine sessions working at once, and the session that had spent
// the morning on the money ledgers did not know a whole feature ("Rooms",
// "CampFire") had shipped. Nobody was doing anything wrong. There was just no
// surface on which the system's state was written down, so every session knew
// its own corner and nothing else — and the standing complaint about this
// repository is that we fix one thing and break another.
//
// This is that surface. It answers four questions from ground truth, not from
// anybody's account of what they are doing:
//
//   what shipped          git log on origin/main
//   what is in flight     branches with unshipped commits
//   who is in whose way   the same file changed on two unshipped branches
//   what is broken        scripts/morning-sweep.mjs, run for the same window
//
// It reports DELTAS. The first run prints the picture; later runs print what
// moved, because a report that reprints everything every hour gets skimmed and
// then ignored. State lives beside the checkouts, not inside one, so every
// worktree shares it:
//
//   node scripts/board.mjs                 since the last run (default)
//   node scripts/board.mjs --full          everything, ignore stored state
//   node scripts/board.mjs --hours 3       an explicit window
//   node scripts/board.mjs --flight-hours 48
//
// Exits 0 always. Like the sweep, the text is the product.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}
const FULL = argv.includes('--full')
// How far back to look for branch activity when deciding what is "in flight".
// Wider than the delta window on purpose: two sessions can commit four hours
// apart and still be standing in the same file right now.
const FLIGHT_HOURS = Number(argOf('--flight-hours', 24))

const git = (args, opts = {}) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim()
  } catch { return '' }
}

// ── state ─────────────────────────────────────────────────────────────
// Beside the checkouts (C:\JobScout\.bboss), so every worktree and every
// session reads and writes the same file. BBOSS_STATE overrides it.
const STATE_PATH = process.env.BBOSS_STATE || join(ROOT, '..', '.bboss', 'state.json')
const readState = () => {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')) } catch { return {} }
}
const writeState = (s) => {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify(s, null, 2))
  } catch (e) { notes.push(`could not save board state: ${e.message}`) }
}

const notes = []
const prev = FULL ? {} : readState()

// --hours wins; then stored state; then a default. --full means "the whole
// picture", so its default window is a day, not the hour a plain first run
// assumes — asking for everything and being shown one hour is a lie by
// omission in a report whose only job is to be looked at once.
const HOURS = Number(argOf('--hours', 0)) || (FULL ? 24 : null)
const since = HOURS
  ? new Date(Date.now() - HOURS * 3600 * 1000).toISOString()
  : (prev.lastRunAt || new Date(Date.now() - 3600 * 1000).toISOString())
const windowHours = Math.max(1, Math.round((Date.now() - new Date(since).getTime()) / 36e5))
const firstRun = !prev.lastRunAt && !HOURS

// ── 1. what shipped ───────────────────────────────────────────────────
git(['fetch', 'origin', 'main'])
const mainSha = git(['rev-parse', '--short', 'origin/main'])

// format-local so commit times read in the same clock as the header below.
// A board that mixes UTC and local is a board you have to do arithmetic on.
const shipped = git(['log', 'origin/main', `--since=${since}`, '--format=%h\t%ad\t%an\t%s', '--date=format-local:%H:%M'])
  .split('\n').filter(Boolean)
  .map((l) => { const [sha, at, who, ...rest] = l.split('\t'); return { sha, at, who, subject: rest.join('\t') } })

// ── 2. what is in flight, and 3. who is in whose way ──────────────────
// A worktree whose branch has commits origin/main does not, with activity
// inside FLIGHT_HOURS. Most of the 26 branches in this repo are finished work
// whose branch was never deleted; `ship` cherry-picks, so those keep reading
// as "1 ahead" forever. Recency is what separates live work from litter.
const flightCutoff = Date.now() - FLIGHT_HOURS * 3600 * 1000
const inFlight = []
const worktrees = git(['worktree', 'list', '--porcelain'])
let cur = null
for (const line of worktrees.split('\n')) {
  if (line.startsWith('worktree ')) cur = { path: line.slice(9).trim() }
  else if (line.startsWith('branch ') && cur) {
    cur.ref = line.slice(7).trim()
    cur.branch = cur.ref.replace(/^refs\/heads\//, '')
    const ahead = Number(git(['rev-list', '--count', `origin/main..${cur.ref}`]) || 0)
    if (ahead > 0) {
      const lastAt = git(['log', '-1', '--format=%cI', cur.ref])
      if (lastAt && new Date(lastAt).getTime() >= flightCutoff) {
        const files = git(['diff', '--name-only', `origin/main...${cur.ref}`]).split('\n').filter(Boolean)
        const dirty = git(['status', '--porcelain'], { cwd: cur.path }).split('\n').filter(Boolean).length
        inFlight.push({ ...cur, ahead, lastAt, files, dirty, name: cur.path.split(/[\\/]/).pop() })
      }
    }
    cur = null
  }
}

// The same file on two unshipped branches. This is the shape of nearly every
// "you broke what I just fixed" in this repo's history: two sessions edit one
// file from the same base, and whichever ships second silently reverts or
// conflicts with the first.
const byFile = new Map()
for (const b of inFlight) for (const f of b.files) {
  if (!byFile.has(f)) byFile.set(f, [])
  byFile.get(f).push(b.branch)
}
const collisions = [...byFile.entries()].filter(([, bs]) => bs.length > 1)

// ── 4. is what is on main actually being served ───────────────────────
// client_errors.app_build is this same hash (lib/crashReport), so it is also
// what lets the sweep tell a live crash from one a deploy already fixed.
let liveBuild = null
try {
  const html = await (await fetch('https://jobscout.appsannex.com', { redirect: 'follow' })).text()
  liveBuild = html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)?.[1] || null
  if (!liveBuild) notes.push('could not read the live build hash from the site')
} catch (e) {
  notes.push(`could not reach jobscout.appsannex.com: ${e.message}`)
}
// main moved but the served bundle did not — a deploy is in flight, or failed.
const deployLagging = !!(prev.lastMainSha && prev.lastLiveBuild && liveBuild
  && mainSha !== prev.lastMainSha && liveBuild === prev.lastLiveBuild)

// ── 5. what is broken, said and owed ──────────────────────────────────
// Shelled out rather than reimplemented: morning-sweep.mjs is the tested
// source of the crash, feedback and money-ledger checks, and a second copy of
// money logic is exactly the fault this repo keeps paying for.
let sweepText = ''
try {
  sweepText = execFileSync(process.execPath, [join(ROOT, 'scripts', 'morning-sweep.mjs'), '--hours', String(windowHours)],
    { cwd: ROOT, encoding: 'utf8', timeout: 240000 })
} catch (e) {
  sweepText = ''
  notes.push(`the sweep could not run: ${String(e.message).split('\n')[0]}`)
}
// Keep only its findings — its own banner would double this report's header.
const sweepBody = sweepText.split('\n')
  .slice(sweepText.split('\n').findIndex((l) => l.startsWith('=====')) + 1)
  .join('\n').trim()

// ── report ────────────────────────────────────────────────────────────
// Local clock throughout — this is read by a person in Mountain Time, not by
// a log aggregator. 'sv-SE' is the shortest way to get YYYY-MM-DD HH:MM.
const local = (d) => new Date(d).toLocaleString('sv-SE').slice(0, 16)
console.log(`\nBoard — ${local(Date.now())}   main ${mainSha}${liveBuild ? `   serving ${liveBuild}` : ''}`)
console.log(`${firstRun ? 'first run — full picture' : `since ${local(since)} (${windowHours}h)`}`)
console.log('='.repeat(72))

if (deployLagging) {
  console.log(`\nDEPLOY NOT LANDED`)
  console.log(`  - main moved to ${mainSha} but the site still serves ${liveBuild}. A deploy is`)
  console.log(`    in flight or it failed. Anything shipped since is NOT live.`)
}

console.log(`\nSHIPPED TO MAIN  (${shipped.length})`)
if (!shipped.length) console.log('  - nothing')
for (const c of shipped) console.log(`  - ${c.at}  ${c.sha}  ${c.subject}`)

console.log(`\nIN FLIGHT  (${inFlight.length} branch${inFlight.length === 1 ? '' : 'es'}, active in the last ${FLIGHT_HOURS}h)`)
if (!inFlight.length) console.log('  - nothing unshipped')
for (const b of inFlight.sort((a, z) => z.lastAt.localeCompare(a.lastAt))) {
  const when = local(b.lastAt).slice(11, 16)
  console.log(`  - ${b.branch}  (${b.name}, ${b.ahead} unshipped, ${b.files.length} file${b.files.length === 1 ? '' : 's'}${b.dirty ? `, ${b.dirty} uncommitted` : ''}, last ${when})`)
}

if (collisions.length) {
  console.log(`\nTWO SESSIONS IN ONE FILE  (${collisions.length}) — whoever ships second overwrites or conflicts`)
  for (const [f, bs] of collisions) console.log(`  - ${f}\n      ${bs.join('  +  ')}`)
}

if (sweepBody) {
  console.log('')
  console.log(sweepBody)
}

if (notes.length) {
  console.log('\nCOULD NOT CHECK')
  for (const n of notes) console.log(`  - ${n}`)
}
console.log('')

writeState({ lastRunAt: new Date().toISOString(), lastMainSha: mainSha, lastLiveBuild: liveBuild })
process.exit(0)
