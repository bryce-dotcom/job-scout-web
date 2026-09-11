#!/usr/bin/env node
// npm run ship — land the current commit on main, and PROVE it landed.
//
// Why this exists: four sessions share these worktrees and switch their
// branches under each other. `git push origin main` pushes the local `main`
// REF, not HEAD. Run it from a feature branch and git says "Everything
// up-to-date" and exits 0 — so `... && echo PUSHED` prints PUSHED while the
// commit never leaves the machine. A Books fix sat on someone else's feature
// branch for 20 minutes that way, while production stayed broken and the
// deploy poller reported nothing wrong.
//
// This never pushes a ref by name. It cherry-picks onto a throwaway worktree
// cut from origin/main — which cannot disturb whatever another session has
// checked out or left uncommitted — pushes HEAD:main, and then verifies with
// merge-base that the sha is genuinely an ancestor of origin/main. Exit code 0
// means the commit is on main. Nothing else does.
//
//   npm run ship                 land HEAD
//   npm run ship -- --dry        show what would happen
//   npm run ship -- --sha <sha>  land a specific commit
//   npm run ship -- --count 3    land the last 3 commits, oldest first

import { execFileSync, spawnSync } from 'node:child_process'
import { rmSync, existsSync, readFileSync, symlinkSync, rmdirSync, lstatSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved from the CURRENT directory, not from where this file lives, so a
// session whose branch predates these scripts can still run the copy that
// setup-sessions syncs to a stable path outside the worktrees.
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: opts.cwd || ROOT, encoding: 'utf8', stdio: opts.stdio || 'pipe' }).trim()
const tryGit = (args, opts = {}) => { try { return { ok: true, out: git(args, opts) } } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') } } }

const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }
const DRY = argv.includes('--dry')

const die = (msg) => { console.error(`\nship: ${msg}\n`); process.exit(1) }
const say = (msg) => console.log(msg)

// ── where are we, really ─────────────────────────────────────────────────
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
const head = git(['rev-parse', '--short', 'HEAD'])
say(`worktree ${ROOT}`)
say(`branch   ${branch} @ ${head}`)

const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean)
if (dirty.length) {
  // Another session's uncommitted work lives in these trees. Shipping while the
  // tree is dirty means shipping a commit that does not match what was tested.
  die(`working tree has ${dirty.length} uncommitted file(s). Commit or stash first:\n` +
      dirty.slice(0, 8).map(l => '  ' + l).join('\n'))
}

git(['fetch', '--quiet', 'origin'])
const originMain = git(['rev-parse', '--short', 'origin/main'])
say(`origin/main ${originMain}`)

// ── which commits ────────────────────────────────────────────────────────
let shas
if (flag('--sha')) {
  shas = flag('--sha').split(',').map(s => git(['rev-parse', s.trim()]))
} else if (flag('--count')) {
  const n = parseInt(flag('--count'), 10)
  if (!Number.isFinite(n) || n < 1) die('--count needs a positive number')
  shas = git(['rev-list', '--reverse', `-n${n}`, 'HEAD']).split('\n').filter(Boolean)
} else {
  shas = [git(['rev-parse', 'HEAD'])]
}

const already = shas.filter(s => tryGit(['merge-base', '--is-ancestor', s, 'origin/main']).ok)
if (already.length === shas.length) {
  say('\nnothing to do — already on origin/main')
  process.exit(0)
}
shas = shas.filter(s => !already.includes(s))

say('\nwill land:')
for (const s of shas) say(`  ${git(['log', '-1', '--format=%h %s', s])}`)
if (DRY) { say('\n--dry: stopping here'); process.exit(0) }

// ── every column these commits ask for must exist ────────────────────────
// The pre-push hook runs this too, but it cannot run it HERE: ship pushes
// from a throwaway worktree cut from origin/main, and .env is gitignored, so
// the staging tree has no service-role key and the hook skips. Ship is the
// only sanctioned path to main, which made it the one path the check missed.
//
// A column that is not there 400s the ENTIRE query, and `const { data } =
// await ...; data || []` turns that into an empty array — the screen shows
// zero and nobody is told. That is how every Payroll commission silently
// became $0 and how arnie-chat answered from an empty result.
//
// FAILS OPEN, exactly as the hook does: only a definite FAILED verdict
// stops a ship. Offline, no credentials, a timeout or a crash all let it
// through with a note. A checker that fails closed on a network blip would
// block the one route to production, which is far worse than a missed column.
schemaCheck()
function schemaCheck() {
  if (process.env.JS_SCHEMA_OK) return
  if (!existsSync(join(ROOT, 'scripts', 'schema-check.mjs'))) return
  // Needs the service-role key; .env is gitignored and not everywhere.
  let env = ''
  try { env = readFileSync(join(ROOT, '.env'), 'utf8') } catch { return }
  if (!/^SUPABASE_SERVICE_ROLE_KEY=/m.test(env)) return

  // ~25s, so only when the commits actually carry query code.
  const files = shas.flatMap(s =>
    tryGit(['show', '--name-only', '--format=', s]).out.split('\n')).filter(Boolean)
  if (!files.some(f => /^(src\/|supabase\/functions\/)/.test(f))) return

  // Reads the WORKING TREE, not these commits — but ship already refused to
  // run with a dirty tree, so the tree is a committed state, and it is the
  // state that was tested.
  say('\nschema:check — confirming every column exists (~25s, JS_SCHEMA_OK=1 skips)')
  let out = '', code = 0
  try {
    out = execFileSync(process.execPath, ['scripts/schema-check.mjs'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 120000 })
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '')
    code = e.status ?? 1
  }
  if (out.includes('schema:check: FAILED')) {
    console.error(out)
    die('a query names a column the database does not have — see above.\n' +
        'Fix it, or record it in scripts/schema-baseline.json with a reason.\n' +
        'Override: JS_SCHEMA_OK=1 npm run ship')
  }
  say(code === 0 ? '  schema:check ok' : `  note: schema:check could not complete (exit ${code}) — shipping anyway.`)
}

// ── sweep what an earlier ship left behind ───────────────────────────────
// A ship that was hard-killed — terminal closed, kill from a shell, a Windows
// lock beating cleanup — leaves its staging tree on disk, and inside it the
// junction to a real worktree's node_modules. `git worktree remove --force`
// on that tree follows the junction and empties the real node_modules —
// proven, not assumed (MSYS `rm -rf` does not, but nobody should have to
// know which tool is safe). No signal handler covers a hard kill, so the
// defence is here, on the next run: unlink the junction first, then remove.
//
// Only trees whose owning process is dead. The name carries the pid, and
// another session's ship may be mid-build in its own tree right now.
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
for (const name of (() => { try { return readdirSync(join(ROOT, '..')) } catch { return [] } })()) {
  const m = /^js-ship-(\d+)$/.exec(name)
  if (!m || Number(m[1]) === process.pid || alive(Number(m[1]))) continue
  const dir = join(ROOT, '..', name)
  const nm = join(dir, 'node_modules')
  try { if (lstatSync(nm).isSymbolicLink()) rmdirSync(nm) } catch { /* no junction */ }
  tryGit(['worktree', 'remove', '--force', dir])
  try { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }) } catch { /* lock; prune */ }
  say(`swept stale staging tree ${name}`)
}
tryGit(['worktree', 'prune'])

// ── land via a throwaway worktree ────────────────────────────────────────
// Cut from origin/main so it is unaffected by whichever branch this checkout
// happens to be on, and by anything another session has left uncommitted.
const TMP = join(ROOT, '..', `js-ship-${process.pid}`)
const NM_LINK = join(TMP, 'node_modules')
// The staging tree borrows this worktree's node_modules through a junction so
// it can build. Remove the LINK before anything recursive touches TMP — a
// recursive delete that followed it would empty the real node_modules.
const unlinkNodeModules = () => {
  try { if (lstatSync(NM_LINK).isSymbolicLink()) rmdirSync(NM_LINK) } catch { /* not there */ }
}
const cleanup = () => {
  unlinkNodeModules()
  tryGit(['worktree', 'remove', '--force', TMP])
  try { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }) } catch { /* windows lock; prune handles it */ }
  tryGit(['worktree', 'prune'])
}
process.on('exit', cleanup)
// A console Ctrl+C reaches Node as SIGINT and would otherwise skip the exit
// handlers — leaving the junction behind. A hard kill still can; see the sweep above.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130) })

const add = tryGit(['worktree', 'add', '--quiet', '--detach', TMP, 'origin/main'])
if (!add.ok) die(`could not create the staging worktree:\n${add.out}`)

for (const s of shas) {
  const pick = tryGit(['cherry-pick', s], { cwd: TMP })
  if (!pick.ok) {
    tryGit(['cherry-pick', '--abort'], { cwd: TMP })
    die(`cherry-pick of ${s.slice(0, 8)} onto origin/main conflicted.\n` +
        `Someone else changed the same lines. Rebase your branch on origin/main and re-run.\n${pick.out}`)
  }
}

// ── build what will land, the way Vercel will ────────────────────────────
// Vercel runs `npm run build` = guard + vite build. Anything that fails there
// fails AFTER it is on main: the deploy errors, the previous bundle keeps
// serving, and nobody is told until someone notices the fix never arrived.
// On 2026-09-11 a test file used `Buffer` without importing it; guard flags
// that, but it had been run through `| tail -1`, whose exit code is tail's,
// so the ship went ahead. Every deploy after it errored for the rest of the
// afternoon — three sessions' work — until two other sessions each fixed it.
//
// So ship runs the same command on the exact tree it is about to push: the
// staging worktree, with this worktree's node_modules linked in. Not the
// source tree — that is this branch's base plus the commits, and what lands
// is origin/main plus the commits. ~1-2 minutes. It is not optional by
// habit; JS_BUILD_OK=1 skips it, and then Vercel is the first to run it.
buildCheck()
function buildCheck() {
  if (process.env.JS_BUILD_OK) { say('\nJS_BUILD_OK set — skipping the build; Vercel will be the first to run it.'); return }
  const nm = join(ROOT, 'node_modules')
  if (!existsSync(nm)) die('no node_modules in this worktree — run npm install, then ship again.')
  try { symlinkSync(nm, NM_LINK, 'junction') } catch (e) { die(`could not link node_modules into the staging tree: ${e.message}`) }
  say('\nnpm run build on the staging tree — the command Vercel runs (~1-2 min, JS_BUILD_OK=1 skips)')
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: TMP, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1' },
  })
  unlinkNodeModules()
  if (r.status !== 0) {
    const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n')
    console.error(out.slice(-40).join('\n'))
    die('the build Vercel would run rejected this. Nothing was pushed.\n' +
        'Fix it, commit, ship again. ("Cannot find module" = npm install in this worktree first.)\n' +
        'Override, knowing production will error: JS_BUILD_OK=1 npm run ship')
  }
  say('  build ok')
}

const landed = git(['rev-parse', 'HEAD'], { cwd: TMP })
// The pre-push hook blocks every other route to main; ship is the sanctioned
// one precisely because it verifies afterwards.
process.env.JS_SHIP = '1'
const push = tryGit(['push', 'origin', 'HEAD:main'], { cwd: TMP })
if (!push.ok) {
  die(`push rejected — origin/main moved while we were staging. Re-run.\n${push.out}`)
}

// ── prove it ─────────────────────────────────────────────────────────────
// The whole point. A zero exit from git push is not evidence.
git(['fetch', '--quiet', 'origin'])
const confirmed = tryGit(['merge-base', '--is-ancestor', landed, 'origin/main']).ok
if (!confirmed) die(`push reported success but ${landed.slice(0, 8)} is NOT an ancestor of origin/main. Do not trust the deploy.`)

say(`\nCONFIRMED on origin/main: ${landed.slice(0, 8)}`)
say(`verify the deploy with a string unique to THIS commit, not one that already existed:`)
say(`  node scripts/deployed.mjs "<some new string from your diff>"`)

// ── then get off this branch ─────────────────────────────────────────────
// Ship CHERRY-PICKS, so this branch was never merged and never will be. It is
// now permanently "ahead" of a main that already has the change, and it can
// only drift further. Every ship conflict, every `supabase db push` demanding
// --include-all, every vercel.json collision traces back to a branch that
// outlived the task it was cut for.
//
// The cure is one command, and the moment to run it is now — not when the next
// task starts, by which point the drift is already baked in.
const behindNow = (() => {
  const n = parseInt(git(['rev-list', '--count', 'HEAD..origin/main']), 10)
  return Number.isFinite(n) ? n : 0
})()
say(`\nthis branch has served its purpose — it can only drift from here${behindNow ? ` (already ${behindNow} behind)` : ''}.`)
say(`when the deploy checks out, re-cut before starting anything else:`)
say(`  npm run fresh -- <next-short-name>`)
say(`\nand to see where every other worktree stands:  npm run fleet`)
