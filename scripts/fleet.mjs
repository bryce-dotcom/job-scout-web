#!/usr/bin/env node
// npm run fleet — one table of every worktree, and whether any of them is
// sitting on work that never reached main.
//
// Why this exists.
//
// `npm run where` answers "is it safe to commit HERE". Nothing answered "what
// is the state of all of them", and eleven worktrees is more than anyone holds
// in their head. On 25 Aug the fleet looked like this:
//
//   - six worktrees whose every commit was already on main — empty husks
//   - js-arnie-wt, quietly holding two migrations that block an employee
//     promoting themselves to Super Admin, plus uncommitted files
//   - job-scout-web, 395 behind with 16 unshipped commits and 465 dirty files
//
// Nobody had noticed the security work was stranded.
//
// ── why "ahead" is not the answer ────────────────────────────────────────
//
// `npm run ship` CHERRY-PICKS onto main, so main gets a different hash for the
// same change and the branch stays permanently ahead of it. Every shipped
// branch reads as ahead forever. The count is noise.
//
// ── why no single check is the answer either ─────────────────────────────
//
// Three signals, each wrong on its own:
//
//   subject match   catches a clean cherry-pick, misses a squash or a rewrite
//   git cherry      patch-id equivalence; strong for a recent branch, but a
//                   branch hundreds of commits behind cannot produce matching
//                   patch-ids even when its work DID land (js-rls-wt: all 7
//                   commits read as unshipped, yet every file is on main)
//   diff vs main    a stale branch's "insertions" are just its OLD copies of
//                   files main has since moved past — reverts, not new work
//
// So the headline is the one thing that cannot be argued with: FILES THE
// BRANCH HAS THAT MAIN DOES NOT. If main is missing a file, the work is only
// on this machine, full stop. Commit-level signals are shown underneath as
// supporting evidence, and a branch with no new files but unmatched commits is
// reported as "verify", not as safe — because this tool should never be the
// reason someone deletes real work.

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Who is standing in each directory. Written by `npm run claim`; a claim goes
// stale after 90 minutes so an agent that dies cannot wedge a worktree.
const STALE_MINUTES = 90
const readClaim = (dir) => {
  const f = join(dir, '.worktree-claim.json')
  if (!existsSync(f)) return null
  try {
    const c = JSON.parse(readFileSync(f, 'utf8'))
    const ageMin = (Date.now() - new Date(c.at).getTime()) / 60000
    return { who: c.who, ageMin, stale: ageMin > STALE_MINUTES }
  } catch { return null }
}

const ROOT = (() => {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() }
  catch { console.error('\n  not inside a git repo\n'); process.exit(1) }
})()

const git = (args, cwd = ROOT) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim() } catch { return '' }
}
const count = (args) => { const n = parseInt(git(args), 10); return Number.isFinite(n) ? n : null }

console.log('\nfetching origin ...')
git(['fetch', '--quiet', 'origin', 'main'])
const mainShort = git(['rev-parse', '--short', 'origin/main'])

const mainSubjects = new Set(
  git(['log', 'origin/main', '--format=%s', '-n', '4000'])
    .split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean),
)
const mainFiles = new Set(git(['ls-tree', '-r', '--name-only', 'origin/main']).split('\n').filter(Boolean))

const worktrees = []
let cur = null
for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
  if (line.startsWith('worktree ')) cur = { path: line.slice(9).trim(), branch: null }
  else if (line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace('refs/heads/', '')
  else if (line.startsWith('detached')) cur.branch = '(detached)'
  else if (line === '' && cur) { worktrees.push(cur); cur = null }
}
if (cur) worktrees.push(cur)

const HERE = ROOT

const rows = worktrees.map((w) => {
  const name = w.path.split(/[\\/]/).pop()
  const branch = w.branch && w.branch !== '(detached)' ? w.branch : null
  const behind = branch ? count(['rev-list', '--count', `${branch}..origin/main`]) : null
  const dirty = git(['status', '--porcelain'], w.path).split('\n').filter(Boolean).length

  let newFiles = []
  let unmatched = []
  if (branch) {
    // The unarguable signal: paths this branch has that main does not.
    for (const f of git(['ls-tree', '-r', '--name-only', branch]).split('\n')) {
      if (f && !mainFiles.has(f)) newFiles.push(f)
    }
    // Supporting: commits main has no equivalent of, by patch-id AND subject.
    const upstreamById = new Set(
      git(['cherry', 'origin/main', branch]).split('\n')
        .filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim()),
    )
    unmatched = git(['log', '--format=%H%x1f%h%x1f%s', `origin/main..${branch}`])
      .split('\n').filter(Boolean)
      .map((l) => { const [full, sha, subj] = l.split('\x1f'); return { full, sha, subj: subj || '' } })
      .filter((c) => !upstreamById.has(c.full) && !mainSubjects.has(c.subj.trim().toLowerCase()))
  }
  return { name, branch: w.branch || '(detached)', behind, dirty, newFiles, unmatched, path: w.path, claim: readClaim(w.path) }
})

const pad = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n)
const W = Math.min(26, Math.max(12, ...rows.map((r) => r.name.length)))
const B = Math.min(34, Math.max(10, ...rows.map((r) => r.branch.length)))

// Worst first: files main is missing, then uncommitted work, then drift.
const rank = (r) => (r.newFiles.length ? 3 : 0) + (r.dirty ? 2 : 0) + (r.unmatched.length ? 1 : 0)
const sorted = [...rows].sort((a, b) => rank(b) - rank(a) || (b.behind ?? 0) - (a.behind ?? 0))

console.log(`origin/main @ ${mainShort}\n`)
console.log(`  ${pad('WORKTREE', W)}  ${pad('BRANCH', B)}  ${'BEHIND'.padStart(6)}  ${'DIRTY'.padStart(5)}  ${'NEW'.padStart(4)}  HELD BY`)
console.log(`  ${'-'.repeat(W)}  ${'-'.repeat(B)}  ${'-'.repeat(6)}  ${'-'.repeat(5)}  ${'-'.repeat(4)}  ${'-'.repeat(20)}`)
for (const r of sorted) {
  const here = r.path === HERE ? '  <- you' : ''
  const held = r.claim ? `${r.claim.who}${r.claim.stale ? ' (stale)' : ''}` : (r.dirty ? 'nobody - but DIRTY' : '-')
  console.log(`  ${pad(r.name, W)}  ${pad(r.branch, B)}  ${String(r.behind ?? '?').padStart(6)}  ${String(r.dirty).padStart(5)}  ${String(r.newFiles.length || '-').padStart(4)}  ${pad(held, 20)}${here}`)
}

const stranded = sorted.filter((r) => r.newFiles.length || r.dirty)
const verify = sorted.filter((r) => !r.newFiles.length && !r.dirty && r.unmatched.length)
const husks = sorted.filter((r) => !r.newFiles.length && !r.dirty && !r.unmatched.length && (r.behind ?? 0) > 0)

if (stranded.length) {
  console.log(`\n  MAIN IS MISSING THIS — do not re-cut these`)
  for (const r of stranded) {
    console.log(`\n    ${r.name}  [${r.branch}]${r.dirty ? `  ${r.dirty} uncommitted file(s)` : ''}`)
    for (const f of r.newFiles.slice(0, 6)) console.log(`      + ${f}`)
    if (r.newFiles.length > 6) console.log(`      + ... and ${r.newFiles.length - 6} more files`)
    for (const c of r.unmatched.slice(0, 5)) console.log(`      ${c.sha}  ${c.subj.slice(0, 66)}`)
    if (r.unmatched.length > 5) console.log(`      ... and ${r.unmatched.length - 5} more commits`)
  }
  console.log(`\n    Land these first:  npm run ship`)
}

if (verify.length) {
  console.log(`\n  VERIFY BEFORE RE-CUTTING`)
  console.log(`    No file is missing from main, but these commits have no match on it.`)
  console.log(`    Usually means the work landed squashed or rewritten. Check, then re-cut.`)
  for (const r of verify) {
    console.log(`\n    ${r.name}  [${r.branch}]  ${r.unmatched.length} commit(s), ${r.behind} behind`)
    for (const c of r.unmatched.slice(0, 4)) console.log(`      ${c.sha}  ${c.subj.slice(0, 66)}`)
    if (r.unmatched.length > 4) console.log(`      ... and ${r.unmatched.length - 4} more`)
  }
}

if (husks.length) {
  console.log(`\n  SAFE TO RE-CUT — every commit accounted for on main, nothing uncommitted`)
  for (const r of husks) console.log(`    ${pad(r.name, W)}  ${String(r.behind).padStart(4)} behind`)
  console.log(`\n    In each:  npm run fresh -- <short-name>`)
}

if (!stranded.length && !verify.length && !husks.length) console.log(`\n  fleet is clean.`)
console.log('')
