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
  ? `    ${green('present')} — it has a secret and refused our unsigned probe, which is correct`
  : `    ${red('no secret')} — LIVEKIT_API_SECRET is not reaching the function`)

// ---- 2b. ...but a PRESENT secret is not a WORKING one ---------------------
// The placeholders in the example command were once pasted verbatim: all
// three names were set, every presence check passed, and nothing connected.
// This asks the function about the SHAPE of what it holds — booleans only,
// no values ever cross the wire.
let shapeOk = true
let pairBad = false
try {
  const res = await fetch(`${base}/functions/v1/livekit-webhook`)
  if (res.ok) {
    const h = await res.json()
    const label = { url: 'LIVEKIT_URL', key: 'LIVEKIT_API_KEY', secret: 'LIVEKIT_API_SECRET' }
    console.log('')
    for (const k of ['url', 'key', 'secret']) {
      if (!h?.present?.[k]) { console.log(`  ${red('MISSING')}      ${label[k]}`); shapeOk = false }
      else if (!h?.looksReal?.[k]) { console.log(`  ${red('PLACEHOLDER')}  ${label[k]} — set, but it is not a real value`); shapeOk = false }
      else console.log(`  ${green('looks real')}   ${label[k]}`)
    }
    // The one that actually decides it: LiveKit's own verdict on the pair.
    if (h?.credentials?.tested) {
      if (h.credentials.valid) {
        console.log(`  ${green('ACCEPTED')}     LiveKit accepted this key + secret`)
      } else {
        shapeOk = false
        pairBad = true
        console.log(`  ${red('REJECTED')}     LiveKit refused this key + secret (HTTP ${h.credentials.status || '?'})`)
      }
    }
  }
} catch { /* an older deploy has no health branch; presence is all we get */ }

// ---- 3. room-token must refuse a stranger --------------------------------
const token = await probe(`${base}/functions/v1/room-token`, { slug: 'the-campfire' })
const tokenGuarded = /sign in/i.test(token.text) || token.status === 401
console.log(`\n  room-token       ${token.status}  ${dim(token.text)}`)
console.log(tokenGuarded
  ? `    ${green('guarded')} — anonymous callers cannot mint a room ticket`
  : `    ${red('OPEN')} — an anonymous caller got something back. Do not leave this.`)

// ---- verdict --------------------------------------------------------------
console.log('')
if (hookConfigured && tokenGuarded && !shapeOk) {
  console.log(red(pairBad ? 'LiveKit rejected this key + secret.' : 'The secrets are set, but at least one is not a real value.'))
  console.log('Re-run the set command with YOUR values — do not paste the placeholders:\n')
  console.log(dim('  npx supabase secrets set LIVEKIT_URL=wss://<your-project>.livekit.cloud \\'))
  console.log(dim('    LIVEKIT_API_KEY=<the API... key> LIVEKIT_API_SECRET=<the secret>'))
  console.log(dim('\n  keys: https://cloud.livekit.io  → your project → Settings → Keys'))
  console.log(dim('  the wss:// Project URL is on the project settings page, not the Keys tab'))
  process.exit(1)
}
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
