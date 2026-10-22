// Is the CampFire actually switched on?
//
// The rooms ship on ONE JobScout LiveKit account, so turning them on is a
// platform job done once: three secrets on the Supabase project. Everything
// else — the table, the token minter, the metering, the UI — is already live.
//
// This answers the only question that matters afterwards, without needing
// anyone to read a log: are the three names there, and do the two functions
// behave the way a configured system behaves?
//
//   npm run rooms:check
//
// The probes are deliberately UNSIGNED and UNAUTHENTICATED. A configured
// webhook must reject us with "bad signature" — that rejection IS the proof
// the secret arrived, because it can only be produced by a function that has
// a secret to check against. A 503 "not configured" means it has none.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const NEEDED = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

function projectUrl() {
  const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
  )
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  if (!url) throw new Error('No VITE_SUPABASE_URL in .env')
  return url.replace(/\/+$/, '')
}

async function probe(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, text: (await res.text()).slice(0, 200) }
  } catch (err) {
    return { status: 0, text: err?.message || 'unreachable' }
  }
}

const base = projectUrl()
console.log(dim(`project ${base}\n`))

// ---- 1. the three names ---------------------------------------------------
let listed = ''
try {
  listed = execSync('npx supabase secrets list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  console.log(yellow('could not list secrets (not linked, or the CLI is not signed in) — relying on the probes below\n'))
}
const present = NEEDED.filter(n => new RegExp(`\\b${n}\\b`).test(listed))
const missing = NEEDED.filter(n => !present.includes(n))

if (listed) {
  for (const name of NEEDED) {
    console.log(present.includes(name) ? `  ${green('set')}     ${name}` : `  ${red('MISSING')} ${name}`)
  }
  console.log('')
}

// ---- 2. the webhook tells us whether the SECRET arrived -------------------
const hook = await probe(`${base}/functions/v1/livekit-webhook`, { event: 'participant_left' })
const hookConfigured = hook.status === 401
console.log(`  livekit-webhook  ${hook.status}  ${dim(hook.text)}`)
console.log(hookConfigured
  ? `    ${green('configured')} — it has a secret and refused our unsigned probe, which is correct`
  : `    ${red('no secret')} — LIVEKIT_API_SECRET is not reaching the function`)

// ---- 3. room-token must refuse a stranger --------------------------------
const token = await probe(`${base}/functions/v1/room-token`, { slug: 'the-campfire' })
const tokenGuarded = /sign in/i.test(token.text) || token.status === 401
console.log(`\n  room-token       ${token.status}  ${dim(token.text)}`)
console.log(tokenGuarded
  ? `    ${green('guarded')} — anonymous callers cannot mint a room ticket`
  : `    ${red('OPEN')} — an anonymous caller got something back. Do not leave this.`)

// ---- verdict --------------------------------------------------------------
console.log('')
if (hookConfigured && tokenGuarded) {
  console.log(green('The CampFire is live.') + ' Click the fire under Dashboard and you are in.')
  console.log(dim('Minutes land in compute_ledger as feature_slug = conference_minutes, per company.'))
  process.exit(0)
}

if (!hookConfigured) {
  console.log(red('Not switched on yet.') + ' Set these on the Supabase project, then run this again:\n')
  for (const name of (missing.length ? missing : NEEDED)) console.log(`    ${name}`)
  console.log(dim('\n  npx supabase secrets set LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...'))
  console.log(dim('  keys: https://cloud.livekit.io  → your project → Settings → Keys'))
  console.log(dim(`  webhook to add in LiveKit: ${base}/functions/v1/livekit-webhook`))
}
process.exit(1)
