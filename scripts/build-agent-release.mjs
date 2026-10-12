#!/usr/bin/env node
// Publishes the agent a customer downloads.
//
//   npm run agent:release
//
// WHAT A CUSTOMER GETS is one small file they double-click. It fetches the
// current agent and runs it, so nobody is ever asked to update anything and
// nobody is ever running last month's build — the oldest unanswerable support
// question in desktop software, deleted by never having a version installed.
//
// WHY IT IS NOT AN .EXE. A single signed binary would be nicer and is the
// obvious next step, but an UNSIGNED one is worse than this: Windows shows
// "Windows protected your PC" with the publisher as unknown, and most people
// stop there. Signing is a certificate purchase, so until that is bought the
// honest option is a tiny launcher and plain words on the page about what the
// browser will say when it downloads it.
//
// The repo's copy of each launcher carries __PLACEHOLDERS__ so it is not tied
// to one environment; the concrete URL and public key are substituted here,
// at publish time, from the .env of whoever publishes.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, 'dist-agent')
const BUCKET = 'agent-releases'

const env = (() => {
  try {
    const txt = readFileSync(join(ROOT, '.env'), 'utf8')
    return Object.fromEntries(txt.split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
  } catch { return {} }
})()

const URL_BASE = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
const APP_URL = process.env.JOBSCOUT_APP_URL || 'https://jobscout.appsannex.com'

const die = (m) => { console.error(`\nagent:release — ${m}\n`); process.exit(1) }
if (!URL_BASE || !ANON) die('no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

const publicBase = `${URL_BASE}/storage/v1/object/public/${BUCKET}`

// ── 1. one file, no checkout around it ──────────────────────────────────
// The agent imports the server's own decision module. Bundling is what lets
// that stay a STATIC import of the one real file: the rules are compiled in
// from source, not fetched, not re-typed, not stubbed.
mkdirSync(OUT, { recursive: true })
const bundle = await build({
  entryPoints: [join(ROOT, 'scripts/jobscout-agent.mjs')],
  outfile: join(OUT, 'agent.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Node builtins resolve at runtime; nothing else is allowed to.
  external: [],
  banner: {
    js: '// JobScout Agent — built, not hand-assembled. Source: scripts/jobscout-agent.mjs\n'
      + '// Everything Arnie may do on this computer is decided by the same module\n'
      + '// the server uses, compiled in below. Read it: search for decideAction.\n',
  },
  legalComments: 'none',
  metafile: true,
})
const bundled = readFileSync(join(OUT, 'agent.mjs'), 'utf8')
if (/await import\(/.test(bundled)) {
  die('the bundle still resolves something at runtime — a downloaded agent has no checkout to resolve it from')
}
if (!/decideAction/.test(bundled)) die('the leash is not in the bundle')
console.log(`  agent.mjs      ${(bundled.length / 1024).toFixed(0)} KB`)

// ── 2. the launchers, made concrete ─────────────────────────────────────
const fill = (src) => {
  let out = src
    .replaceAll('__BASE__', publicBase)
    .replaceAll('__SUPABASE_URL__', URL_BASE)
    .replaceAll('__ANON_KEY__', ANON)     // public by design — it is in every web bundle
    .replaceAll('__APP__', APP_URL)
  const left = out.match(/__[A-Z_]+__/)
  if (left) die(`a launcher still has ${left[0]} in it`)
  return out
}

// Batch wants CRLF: a label read with a bare LF has been known to misparse,
// and this file cannot be the thing that fails on a customer's machine.
const cmd = fill(readFileSync(join(HERE, 'agent/launch/jobscout-agent.cmd'), 'utf8'))
  .replace(/\r?\n/g, '\r\n')
const command = fill(readFileSync(join(HERE, 'agent/launch/jobscout-agent.command'), 'utf8'))
  .replace(/\r\n/g, '\n')

const files = [
  // The names a person sees in their Downloads folder.
  { key: 'JobScout Agent.cmd', body: cmd, type: 'application/octet-stream' },
  { key: 'JobScout Agent.command', body: command, type: 'application/octet-stream' },
  { key: 'agent.mjs', body: bundled, type: 'text/javascript' },
  { key: 'recorder.ps1', body: readFileSync(join(HERE, 'agent/recorder.ps1'), 'utf8'), type: 'text/plain' },
  { key: 'recorder.jxa.js', body: readFileSync(join(HERE, 'agent/recorder.jxa.js'), 'utf8'), type: 'text/javascript' },
]
for (const f of files) writeFileSync(join(OUT, f.key), f.body)

// ── 2b. the single executable, for when there is a certificate ──────────
//
// `--exe` compiles the agent into one file that needs no Node installed. It
// is built with deno rather than Node's own SEA for one reason: SEA on Node
// 24 is CommonJS-only, and the agent is ESM with top-level await, so SEA
// would mean restructuring the agent to suit the packager. deno compile takes
// it as written — and this repo already runs deno on the server side.
//
// NOTHING IS PUBLISHED UNSIGNED. An unsigned executable is WORSE than the
// launcher: Windows shows "Windows protected your PC" with the publisher as
// unknown, and the people most likely to stop there are the ones we are
// building this for. The launcher gets a far milder warning and the page
// warns them about it first. So this builds, checks the signature, and
// refuses to upload without one.
const exeWanted = process.argv.includes('--exe')
if (exeWanted) {
  const { execFileSync } = await import('node:child_process')
  const exePath = join(OUT, 'JobScoutAgent.exe')
  const run = (cmd2, args) => execFileSync(cmd2, args, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' })

  // `deno` on PATH is a .cmd shim on Windows, and Node will not exec one
  // without a shell — which is not a door to open for a build step. Find the
  // real executable instead; on a CI runner it is on PATH as itself.
  const deno = (() => {
    if (process.platform !== 'win32') return 'deno'
    const guesses = [
      join(process.env.APPDATA || '', 'npm/node_modules/deno/deno.exe'),
      join(process.env.USERPROFILE || '', '.deno/bin/deno.exe'),
      'deno.exe',
    ]
    for (const g of guesses) {
      try { readFileSync(g); return g } catch { /* next */ }
    }
    return 'deno.exe'
  })()

  // Signing happens BETWEEN building and publishing, so the publishing run
  // must not compile a fresh unsigned binary over the signed one. That is the
  // whole reason this flag exists.
  const prebuilt = process.argv.includes('--exe-prebuilt')

  try {
    // --node-modules-dir=none or it embeds the whole of node_modules: 76 MB
    // becomes 515 MB, which nobody is downloading onto a job site.
    if (prebuilt) readFileSync(exePath)   // throws if the build step did not run
    else run(deno, [
      'compile', '--allow-all', '--node-modules-dir=none',
      '--include', 'scripts/agent/recorder.ps1',
      '--include', 'scripts/agent/recorder.jxa.js',
      '--output', exePath,
      'scripts/jobscout-agent.mjs',
    ])
  } catch (e) {
    die(prebuilt
      ? 'no JobScoutAgent.exe in dist-agent — --exe-prebuilt expects the build step to have run'
      : `deno compile failed: ${String(e.stderr || e.message).slice(0, 400)}`)
  }
  const mb = (readFileSync(exePath).length / 1048576).toFixed(0)
  console.log(`  JobScoutAgent.exe  ${mb} MB`)

  // Is it actually signed? Asked of Windows itself, not inferred from the
  // fact that a signing step ran without throwing.
  let signed = null
  if (process.platform === 'win32') {
    try {
      const out = run('powershell.exe', ['-NoProfile', '-Command',
        `(Get-AuthenticodeSignature -LiteralPath "${exePath}").Status`]).trim()
      signed = out === 'Valid' ? 'Valid' : out
    } catch { signed = 'could not be checked' }
  }

  if (signed === 'Valid') {
    files.push({ key: 'JobScoutAgent.exe', body: readFileSync(exePath), type: 'application/vnd.microsoft.portable-executable' })
    console.log('  signature         Valid — it will be published')
  } else {
    console.log(`  signature         ${signed || 'not checked on this platform'} — built, NOT published`)
    console.log('                    (sign it first: .github/workflows/agent-release.yml)')
  }
}

// ── 3. publish ──────────────────────────────────────────────────────────
if (process.argv.includes('--dry-run')) {
  console.log(`\n  dry run — ${files.length} files written to dist-agent, nothing uploaded`)
  console.log(`  would publish to ${publicBase}\n`)
  process.exit(0)
}
if (!SERVICE) die('publishing needs SUPABASE_SERVICE_ROLE_KEY (or pass --dry-run)')

for (const f of files) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURIComponent(f.key)}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': f.type,
      'Cache-Control': 'max-age=60',   // short: the launcher fetches the agent every run
      'x-upsert': 'true',
    },
    body: f.body,
  })
  if (!res.ok) die(`uploading ${f.key}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  console.log(`  published      ${f.key}`)
}

console.log(`
  Download links:
    Windows  ${publicBase}/JobScout%20Agent.cmd
    macOS    ${publicBase}/JobScout%20Agent.command
`)
