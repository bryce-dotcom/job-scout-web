#!/usr/bin/env node
// Deploy Arnie's edge functions.
//
// This used to carry its own copy of the deploy rules — a staleness check and
// an esbuild bundle gate, each added after the incident that taught it. Those
// rules are not Arnie's; every edge function wants them. They now live in
// scripts/deploy-fn.mjs, which also pins verify_jwt from config.toml and reads
// the deployed version back to prove the upload took. This file is now just
// the LIST, so the rules cannot drift between the two ways to deploy.
//
//   npm run arnie:deploy                       all six
//   npm run arnie:deploy -- arnie-chat         one
//   npm run arnie:deploy -- --dry              preflight only
//
// Anything not on this list goes through deploy:fn directly.

import { deployFunctions } from './deploy-fn.mjs'

const ALL = ['arnie-chat', 'arnie-config', 'arnie-brief-push', 'arnie-nudge', 'convert-estimate', 'approve-document']
const KNOWN_FLAGS = new Set(['--dry', '--force', '--require-shipped'])

const argv = process.argv.slice(2)
// Flags used to be silently dropped, so `arnie-deploy --help` meant "deploy all
// six" — and on 2026-10-14 it did, from a worktree 27 commits behind main,
// briefly reverting a conversion fix. An unrecognised flag stops here.
const unknown = argv.filter((a) => a.startsWith('-') && !KNOWN_FLAGS.has(a))
if (unknown.length) {
  console.log(`unknown flag: ${unknown.join(', ')}`)
  console.log(`usage: npm run arnie:deploy [-- <function> ...] [${[...KNOWN_FLAGS].join('] [')}]`)
  console.log(`       no names = all of: ${ALL.join(', ')}`)
  process.exit(2)
}

const named = argv.filter((a) => !a.startsWith('-'))
const notArnies = named.filter((n) => !ALL.includes(n))
if (notArnies.length) {
  console.log(`not an Arnie function: ${notArnies.join(', ')} — use: npm run deploy:fn -- ${notArnies.join(' ')}`)
  process.exit(2)
}

try {
  await deployFunctions(named.length ? named : ALL, {
    dry: argv.includes('--dry'),
    force: argv.includes('--force'),
    requireShipped: argv.includes('--require-shipped'),
  })
} catch (e) {
  console.error(`\narnie:deploy — ${e.message}\n`)
  process.exit(1)
}
