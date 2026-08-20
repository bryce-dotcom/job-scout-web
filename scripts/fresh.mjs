#!/usr/bin/env node
// npm run fresh -- <short-name> — start the next piece of work from CURRENT main.
//
// Why this exists.
//
// On 20 Aug a session lost most of a day to what looked like three separate
// problems: `npm run ship` conflicting on cherry-pick, `supabase db push`
// rejecting a migration, and vercel.json colliding on every edit. They were one
// problem. That worktree's branch was cut from a copy of main 53 commits old,
// and every symptom was that staleness surfacing somewhere different.
//
// `where` reports the number, `ship` fails on it, `pre-commit` blocks the
// damaging case — but nothing offered the actual fix, so the fix stayed
// hand-rolled and mostly skipped. This is that missing command.
//
// It is deliberately boring: fetch, branch off origin/main, switch. The care is
// all in refusing to do it when something could be lost.

import { execFileSync } from 'node:child_process'

const run = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...opts }).trim()
const quiet = (args) => { try { return run(args) } catch { return '' } }

const argv = process.argv.slice(2)
const carry = argv.includes('--carry')
const name = argv.find((a) => !a.startsWith('-'))

const die = (msg) => { console.error(`\n${msg}\n`); process.exit(1) }

if (!name) {
  die(`usage: npm run fresh -- <short-name> [--carry]

  Cuts work/<short-name> from current origin/main and switches to it.

    npm run fresh -- invoice-split
    npm run fresh -- invoice-split --carry    keep uncommitted work, bring it along`)
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  die(`"${name}" — use lowercase letters, digits and dashes.`)
}

const branch = `work/${name}`

// ── refuse to clobber ────────────────────────────────────────────────────
if (quiet(['rev-parse', '--verify', '--quiet', branch])) {
  die(`Branch ${branch} already exists.\n\n  Switch to it:   git switch ${branch}\n  Or pick another name.`)
}

// A dirty tree is the one way this command could destroy work, so it stops by
// default rather than guessing. --carry is the informed opt-in: stash, switch,
// pop. A session here once had 465 modified files; auto-stashing that silently
// is not a thing this should ever do on its own.
const dirty = quiet(['status', '--porcelain'])
const dirtyCount = dirty ? dirty.split('\n').length : 0
if (dirtyCount && !carry) {
  die(`${dirtyCount} uncommitted file(s) here. Refusing to switch branches under them.

  Bring them to the new branch:
    npm run fresh -- ${name} --carry

  Or deal with them first:
    git stash -u          park them
    git commit -am "..."  keep them on this branch`)
}

// ── do it ────────────────────────────────────────────────────────────────
process.stdout.write('fetching origin ... ')
try { run(['fetch', 'origin', 'main']) } catch (e) {
  die(`could not reach origin.\n  ${String(e.message).split('\n')[0]}`)
}
const base = run(['rev-parse', '--short', 'origin/main'])
console.log(`origin/main = ${base}`)

let stashed = false
if (dirtyCount) {
  // --include-untracked so a brand-new file is carried too; without it the file
  // survives the switch but is silently left behind by the stash/pop pairing.
  run(['stash', 'push', '--include-untracked', '-m', `fresh: ${branch}`])
  stashed = true
  console.log(`stashed ${dirtyCount} file(s)`)
}

try {
  run(['switch', '-c', branch, 'origin/main'])
} catch (e) {
  if (stashed) {
    quiet(['stash', 'pop'])
    console.error('\nswitch failed — your changes were restored where they were.')
  }
  die(String(e.message).split('\n')[0])
}

if (stashed) {
  try {
    run(['stash', 'pop'])
    console.log('changes restored on the new branch')
  } catch {
    // Never lose the stash on a conflicting pop — it stays on the stack.
    console.error(`
  Your changes conflict with current main and are still safe in the stash.

    git stash list            see it
    git checkout --theirs .   take your version, or resolve by hand
    git stash pop             retry

  Nothing was lost.`)
    process.exit(1)
  }
}

console.log(`
  on ${branch}, cut from origin/main @ ${base} — 0 behind.

  When it is ready:   npm run ship
`)
