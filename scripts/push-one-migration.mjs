#!/usr/bin/env node
// Apply ONE migration file to the linked database.
//
// `supabase db push --linked` refuses on its own here. A couple of dozen local
// migration files sort BEFORE the remote's last applied migration and are not
// in its history ("Found local migration files to be inserted before the last
// migration on remote database") — old placeholders and migrations this
// database already has. `--include-all` would try to replay all of them,
// which is the thing never to do.
//
// So: hold those files aside, push the one you named, put them back. The
// restore runs in `finally`, so a failed push still leaves the repo as it
// found it.
//
// The held-back list is READ FROM THE CLI's own refusal, not hard-coded.
// scripts/_push_bonus_override_migration.mjs carried a hand-written list of
// 25; by 2026-10-30 the real number was 27, and a stale list silently pushes
// the wrong set. Asking the CLI cannot go out of date.
//
//   node scripts/push-one-migration.mjs 20261030120000_time_clock_overhead_code.sql
//   node scripts/push-one-migration.mjs <file> --dry     show the plan only
import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, existsSync, rmdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const MINE = args.find(a => !a.startsWith('--'))
const MIGRATIONS = 'supabase/migrations'
const HOLD = join('supabase', '.migration-hold')

if (!MINE) {
  console.error('usage: node scripts/push-one-migration.mjs <migration-file.sql> [--dry]')
  process.exit(1)
}
if (!existsSync(join(MIGRATIONS, MINE))) {
  console.error(`cannot find ${MIGRATIONS}/${MINE} — run this from the worktree that has it`)
  process.exit(1)
}

// `npx` is npx.cmd on Windows and execFileSync cannot spawn it without a
// shell — it throws ENOENT with stdout and stderr both undefined, so a
// swallowed error reads exactly like "the CLI had nothing to say". That is
// how this script first reported 0 files to hold back when the real answer
// was 27, which would have pushed the wrong set.
const sb = (a) => execFileSync('npx', ['supabase', ...a], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true,
})

// Ask the CLI which files it objects to. A clean dry-run means nothing is in
// the way and the push can go straight through.
console.log('asking the CLI what it objects to...')
let refusal = ''
let ranClean = false
try { refusal = sb(['db', 'push', '--linked', '--dry-run']); ranClean = true }
catch (e) {
  refusal = `${e.stdout || ''}${e.stderr || ''}`
  // Could not run the CLI at all, as against the CLI telling us no. Never
  // treat "no output" as "nothing to hold back".
  if (!refusal.trim()) {
    console.error(`could not run the Supabase CLI (${e.code || e.message}). Not guessing — nothing was moved.`)
    process.exit(1)
  }
}
if (ranClean && !/DbPushMissingRemoteError|inserted before the last migration/.test(refusal)) {
  console.log('  the CLI has no objection; pushing straight through')
}

// A version the remote has already applied is skipped in silence: the CLI
// says "Remote database is up to date", exits 0, and your SQL never runs.
// 20261030170000 started life as 20261030120000, which main had already used
// that morning for recurring_spawn_on_any_finish — so the push reported
// success, registered nothing, and the column did not exist. A branch cut
// before that commit cannot see the clash locally, so ask the remote.
const MY_VERSION = MINE.match(/^(\d+)_/)?.[1]
if (!MY_VERSION) {
  console.error(`${MINE} does not start with a version number`)
  process.exit(1)
}
console.log('checking the version is not already applied...')
let history = ''
try { history = sb(['migration', 'list', '--linked']) }
catch (e) { history = `${e.stdout || ''}${e.stderr || ''}` }
if (!history.trim()) {
  console.error('could not read the remote migration history — not guessing.')
  process.exit(1)
}
// The row is `{"local":"…","remote":"20261030120000",…}`; a populated `remote`
// is the applied side, which is the one that makes a push a no-op.
if (new RegExp(`"remote"\\s*:\\s*"${MY_VERSION}"`).test(history)) {
  console.error(`refusing: the remote has already applied version ${MY_VERSION}.`)
  console.error(`Another migration took that timestamp. Rename ${MINE} to a later, unused version`)
  console.error(`and run this again — pushing as-is would report success and apply nothing.`)
  process.exit(1)
}

const named = [...refusal.matchAll(/supabase\/migrations\/(\d+_[^\s"\\]+\.sql)/g)].map(m => m[1])
const holdBack = [...new Set(named)].filter(f => f !== MINE)

console.log(`  ${holdBack.length} file(s) the CLI wants out of the way`)
if (holdBack.includes(MINE)) {
  console.error(`refusing: the CLI named ${MINE} itself as out of order — fix its timestamp instead`)
  process.exit(1)
}
if (DRY) {
  console.log(`\nDRY — would hold back:\n  ${holdBack.join('\n  ') || '(nothing)'}`)
  console.log(`\nthen: supabase db push --linked   (pushing only ${MINE})`)
  process.exit(0)
}

const moved = []
try {
  mkdirSync(HOLD, { recursive: true })
  for (const f of holdBack) {
    const from = join(MIGRATIONS, f)
    if (!existsSync(from)) continue
    renameSync(from, join(HOLD, f))
    moved.push(f)
  }
  const left = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'))
  console.log(`held ${moved.length}, ${left.length} left in place`)
  console.log(sb(['db', 'push', '--linked', '--yes']))
  console.log(`pushed ${MINE}`)
} catch (e) {
  console.error('push failed:')
  console.error(`${e.stdout || ''}${e.stderr || ''}` || e.message)
  process.exitCode = 1
} finally {
  // Always put them back, even on a crash — a half-restored migrations
  // directory is how a later ship loses files.
  let back = 0
  for (const f of moved) {
    const from = join(HOLD, f)
    if (existsSync(from)) { renameSync(from, join(MIGRATIONS, f)); back++ }
  }
  console.log(`restored ${back}/${moved.length}`)
  if (back !== moved.length) console.error(`!! ${moved.length - back} file(s) still in ${HOLD} — move them back by hand`)
  try { if (existsSync(HOLD) && readdirSync(HOLD).length === 0) rmdirSync(HOLD) } catch { /* leave it */ }
}
