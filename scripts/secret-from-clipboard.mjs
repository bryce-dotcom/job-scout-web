#!/usr/bin/env node
// Set a Supabase secret from whatever is on the clipboard — without the value
// ever being typed, pasted, echoed, or seen.
//
//   1. In the provider's dashboard, click the Copy button next to the key.
//   2. node scripts/secret-from-clipboard.mjs RESEND_INBOUND_API_KEY
//
// Why this exists: the previous instruction was a command with PASTE_HERE in
// it, and PASTE_HERE is exactly what got stored. A secret that is pasted into
// a command line can be mistyped, doubled, quoted, or left as the placeholder,
// and none of those fail loudly — the webhook simply 401s. This reads the
// clipboard, checks the value looks like the key the name calls for, writes it
// through a temp env file (never argv, never a shell), then proves it landed
// by comparing the digest Supabase reports with the digest of what was sent.
//
// The value is printed nowhere. Only its length and the first 8 hex chars of
// its SHA-256 are shown, which is what `supabase secrets list` shows too.

import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// What a value must look like, by secret name. A wrong-looking value is far
// more often "the clipboard still holds something else" than a real key.
const SHAPES = {
  RESEND_INBOUND_API_KEY: { prefix: 're_', hint: 'a Resend API key (starts with re_) — API keys → Create API key → Full access → Copy' },
  RESEND_API_KEY: { prefix: 're_', hint: 'a Resend API key (starts with re_)' },
  RESEND_WEBHOOK_SECRET: { prefix: 'whsec_', hint: 'a Resend webhook signing secret (starts with whsec_) — Webhooks → the endpoint → Copy next to Signing secret' },
  STRIPE_WEBHOOK_SECRET: { prefix: 'whsec_', hint: 'a Stripe webhook signing secret (starts with whsec_)' },
}

const name = process.argv[2]
if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
  console.error('usage: node scripts/secret-from-clipboard.mjs SECRET_NAME\n\nknown names: ' + Object.keys(SHAPES).join(', '))
  process.exit(2)
}

function readClipboard() {
  if (process.platform === 'win32') {
    return execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' })
  }
  if (process.platform === 'darwin') return execFileSync('pbpaste', [], { encoding: 'utf8' })
  return execFileSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8' })
}

let value = readClipboard().replace(/\r/g, '').trim().replace(/^["']|["']$/g, '')
const shape = SHAPES[name]
const die = (msg) => { console.error(`\n${msg}\n`); process.exit(1) }

if (!value) die('The clipboard is empty. Click Copy next to the key in the dashboard first, then run this again.')
if (/\s/.test(value) || value.length > 512) die(`The clipboard holds ${value.length} characters with spaces or line breaks — that is not a key. Click Copy next to the key first.`)
if (shape && !value.startsWith(shape.prefix)) {
  die(`${name} should be ${shape.hint}.\nThe clipboard holds something starting with "${value.slice(0, 3)}…" (${value.length} chars). Click Copy next to the right key, then run this again.`)
}
if (/PASTE|xxxx|HERE/i.test(value)) die('The clipboard holds a placeholder, not a key.')

const digest = createHash('sha256').update(value).digest('hex')

// Through a temp env file: never on the command line, never through a shell.
const dir = mkdtempSync(join(tmpdir(), 'secret-'))
const file = join(dir, 'secret.env')
try {
  writeFileSync(file, `${name}=${value}\n`, { mode: 0o600 })
  execSync(`npx supabase secrets set --env-file "${file}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  die(`supabase secrets set failed:\n${String(e.stderr || e.message).slice(0, 400)}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
value = null

// Prove it landed: the digest Supabase shows is the SHA-256 of the value.
let listed = ''
try { listed = execSync('npx supabase secrets list', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch { /* verified below */ }
const m = listed.match(new RegExp(`"name":"${name}","value":"([0-9a-f]{64})"`))
if (!m) die(`${name} was sent but does not appear in \`supabase secrets list\`. Re-run; if it persists, check the CLI is linked to the right project.`)
if (m[1] !== digest) die(`${name} is set, but to a DIFFERENT value than the clipboard held (digest ${m[1].slice(0, 8)}… vs ${digest.slice(0, 8)}…). Re-run.`)

console.log(`\n${name} set and verified — sha256 ${digest.slice(0, 8)}…  (the value was never displayed)\n`)
