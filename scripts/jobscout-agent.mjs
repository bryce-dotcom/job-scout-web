#!/usr/bin/env node
// JobScout Agent — Arnie's hands on this computer. Phase 0.
//
//   node scripts/jobscout-agent.mjs
//
// It connects OUTWARD to arnie-computer and polls for work. Nothing listens on
// this machine, no port is opened, and there is no inbound connection — which
// is the answer to every IT question this feature will ever be asked, so it is
// the design rather than a detail.
//
// THREE THINGS THIS AGENT DOES THAT THE SERVER CANNOT
//
//   1. It enforces the leash LOCALLY, by importing the very same
//      _shared/computerGrants.ts the server uses — not a copy of the rules.
//      An agent that only did what the server told it would do whatever a
//      COMPROMISED server told it. This is the check that actually protects
//      the machine.
//
//   2. It checks what is really on screen. An action says "chrome on
//      traksmart.example"; only the machine knows whether Chrome is actually
//      in front. A mismatch is refused, because a click aimed at a browser
//      that lands in Excel is the whole nightmare in one keystroke.
//
//   3. It prints every single action, allowed or refused, as it happens. The
//      person watching this window is the last line of defence and the first
//      one to notice something wrong, so nothing happens silently.
//
// IT NEVER TYPES A CREDENTIAL. Not a utility login, not an email password.
// On a sign-in page it stops and says so; the person types their own password
// and clears their own 2FA, and the session that results lives in their own
// browser profile, on their own machine, in their own name. That is why this
// whole feature needs no credential vault.
//
// Ctrl+C is the kill switch: the session is marked stopped, anything queued is
// refused, and nothing more runs on it ever. A new one has to be started here,
// by the person.
//
// Phase 0 is Windows-only (PowerShell for screen and input). macOS needs
// Screen Recording and Accessibility grants the person flips by hand in System
// Settings, which is its own onboarding problem — Phase 2.

import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// The SAME module the server decides with. Not a port of it, not a summary of
// it — the file itself. If these two ever disagree, the disagreement is
// indistinguishable from a bypass, so there is only one of them.
const { decideAction } = await import(
  pathToFileURL(join(ROOT, 'supabase/functions/_shared/computerGrants.ts')).href
)

// ── where we are pointed ────────────────────────────────────────────────
const envFile = (() => {
  try { return readFileSync(join(ROOT, '.env'), 'utf8') } catch { return '' }
})()
const fromEnvFile = (k) => {
  const m = envFile.split(/\r?\n/).find((l) => l.startsWith(k + '='))
  return m ? m.slice(k.length + 1).trim() : ''
}
const URL_BASE = process.env.JOBSCOUT_URL || fromEnvFile('VITE_SUPABASE_URL')
const ANON = process.env.JOBSCOUT_ANON_KEY || fromEnvFile('VITE_SUPABASE_ANON_KEY')
// The person's OWN access token. In the app this will come from "Connect this
// computer"; for Phase 0 it is handed over by env var. It is theirs, it is
// short-lived, and it is the only identity this agent ever has — there is no
// service key here and no way for this agent to act as anyone else.
const TOKEN = process.env.JOBSCOUT_AGENT_TOKEN || ''

const die = (m) => { console.error(`\nagent: ${m}\n`); process.exit(1) }
if (!URL_BASE) die('no JobScout URL — set JOBSCOUT_URL or run from a checkout with .env')
if (!TOKEN) die('no JOBSCOUT_AGENT_TOKEN — get one from Arnie → Settings → Connect this computer')
if (process.platform !== 'win32') die(`Phase 0 runs on Windows only (this is ${process.platform}).`)

const DEVICE = process.env.JOBSCOUT_DEVICE_LABEL || `${process.env.COMPUTERNAME || 'this computer'}`
const VERSION = '0.1.0-phase0'

const call = async (action, body = {}) => {
  const res = await fetch(`${URL_BASE}/functions/v1/arnie-computer`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const text = await res.text()
  let json = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { error: text.slice(0, 200) } }
  return { status: res.status, ...json }
}

// ── PowerShell, the hands ───────────────────────────────────────────────
// Each helper is one short script. Nothing here takes a value from the action
// and interpolates it into a command line: text to type goes through a file
// and a key press is matched against a fixed list. A typed string is attacker-
// influenced data the moment Arnie is reading a web page, and a shell is
// exactly the wrong place to put it.
const ps = (script) => new Promise((done) => {
  execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', timeout: 20000, maxBuffer: 32 * 1024 * 1024 },
    (err, stdout, stderr) => done({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || err?.message || '').trim() }))
})

/** What is actually in front right now. The server cannot know this. */
const frontmostApp = async () => {
  const r = await ps(`
    Add-Type -Namespace W -Name U -MemberDefinition '
      [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
      [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int pid);'
    $h = [W.U]::GetForegroundWindow(); $pid = 0; [void][W.U]::GetWindowThreadProcessId($h, [ref]$pid)
    (Get-Process -Id $pid).ProcessName`)
  return r.ok ? r.out.toLowerCase() : ''
}

const screenshot = async () => {
  const path = join(tmpdir(), `jobscout-shot-${Date.now()}.png`)
  const r = await ps(`
    Add-Type -AssemblyName System.Windows.Forms,System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save('${path.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); Write-Output '${path.replace(/\\/g, '\\\\')}'`)
  return r.ok ? { path } : { error: r.err || 'screenshot failed' }
}

const clickAt = async (x, y, button = 'left', double = false) => {
  const DOWN = button === 'right' ? 0x0008 : 0x0002
  const UP = button === 'right' ? 0x0010 : 0x0004
  const once = `[W.M]::mouse_event(${DOWN},0,0,0,0); [W.M]::mouse_event(${UP},0,0,0,0)`
  const r = await ps(`
    Add-Type -Namespace W -Name M -MemberDefinition '
      [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
      [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);'
    [void][W.M]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}); Start-Sleep -Milliseconds 60
    ${once}${double ? `; Start-Sleep -Milliseconds 60; ${once}` : ''}`)
  return r.ok ? {} : { error: r.err || 'click failed' }
}

const typeText = async (text) => {
  // Through a file, never through the command line. SendKeys also treats
  // + ^ % ~ ( ) { } [ ] as control characters, so everything is escaped.
  const path = join(tmpdir(), `jobscout-type-${Date.now()}.txt`)
  const escaped = String(text).replace(/([+^%~(){}\[\]])/g, '{$1}')
  const { writeFileSync, rmSync } = await import('node:fs')
  writeFileSync(path, escaped, 'utf8')
  const r = await ps(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait([System.IO.File]::ReadAllText('${path.replace(/\\/g, '\\\\')}'))`)
  try { rmSync(path, { force: true }) } catch { /* temp */ }
  return r.ok ? {} : { error: r.err || 'type failed' }
}

// A fixed list. A key name that is not on it does not reach PowerShell at all.
const KEYS = {
  enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}', backspace: '{BACKSPACE}',
  delete: '{DELETE}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
}
const pressKey = async (name) => {
  const seq = KEYS[String(name || '').toLowerCase()]
  if (!seq) return { error: `not a key this agent will press: ${name}` }
  const r = await ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${seq}')`)
  return r.ok ? {} : { error: r.err || 'key failed' }
}

const scroll = async (dir, amount = 3) => {
  const delta = (dir === 'up' ? 120 : -120) * Math.max(1, Math.min(10, amount))
  const r = await ps(`
    Add-Type -Namespace W -Name S -MemberDefinition '
      [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);'
    [W.S]::mouse_event(0x0800, 0, 0, ${delta}, 0)`)
  return r.ok ? {} : { error: r.err || 'scroll failed' }
}

// ── the loop ────────────────────────────────────────────────────────────
const stamp = () => new Date().toLocaleTimeString()
const show = (mark, line) => console.log(`  ${stamp()}  ${mark}  ${line}`)

const describe = (a) => {
  const t = a.target || {}
  const where = t.label || t.name || t.text || (t.x !== undefined ? `(${t.x}, ${t.y})` : '')
  return [a.kind, a.app && `in ${a.app}`, a.host && a.host !== '*' && `on ${a.host}`, where && `→ ${where}`]
    .filter(Boolean).join(' ')
}

const run = async (a) => {
  const t = a.target || {}
  switch (a.kind) {
    case 'screenshot': return await screenshot()
    case 'click': return await clickAt(t.x, t.y, 'left')
    case 'double_click': return await clickAt(t.x, t.y, 'left', true)
    case 'right_click': return await clickAt(t.x, t.y, 'right')
    case 'type': return await typeText(t.value ?? '')
    case 'key': return await pressKey(t.key)
    case 'scroll': return await scroll(t.direction, t.amount)
    // Deliberately not implemented in Phase 0 rather than approximated. An
    // agent that guesses at the text on screen is worse than one that says it
    // cannot read it.
    case 'read_text': return { error: 'this agent cannot read the screen yet — Phase 1' }
    case 'launch': return { error: 'launching programs is not in Phase 0' }
    default: return { error: `unknown action kind: ${a.kind}` }
  }
}

let sessionId = null
let stopping = false

const stop = async (why) => {
  if (stopping) return
  stopping = true
  console.log(`\n  stopping — ${why}`)
  if (sessionId) {
    const r = await call('stop', { session_id: sessionId }).catch(() => ({}))
    console.log(r.ok ? '  session stopped; anything queued was refused' : '  could not reach the server to stop cleanly')
  }
  process.exit(0)
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop('you pressed Ctrl+C').catch(() => process.exit(0)) })

const hello = await call('hello', { device_label: DEVICE, platform: process.platform, agent_version: VERSION })
if (!hello.ok) die(`could not connect: ${hello.error || hello.status}`)
sessionId = hello.session_id

console.log(`
  JobScout Agent ${VERSION}
  ${DEVICE} → ${URL_BASE.replace(/^https?:\/\//, '')}
  session ${sessionId}

  Arnie can only touch programs you have granted. Everything he does prints
  here as it happens. Ctrl+C stops him on this computer.
`)

let grants = hello.grants || []
if (!grants.length) {
  console.log('  nothing granted yet — Arnie can do nothing at all until you allow a program.\n')
} else {
  for (const g of grants) console.log(`  allowed: ${g.app}${g.host && g.host !== '*' ? ` on ${g.host}` : ''} — ${g.tier}${g.duration === 'once' ? ' (once)' : ''}`)
  console.log('')
}

const POLL_MS = Math.max(1000, (hello.poll_seconds || 3) * 1000)
let sinceGrants = 0

while (!stopping) {
  // Grants are re-read regularly, never trusted from the handshake forever.
  // Revoking has to bite on the next action, not the next restart.
  if (sinceGrants++ >= 10) {
    sinceGrants = 0
    const g = await call('grants').catch(() => null)
    if (g?.ok) grants = g.grants || []
  }

  const got = await call('next', { session_id: sessionId }).catch((e) => ({ error: String(e.message) }))
  if (got.stopped) await stop('the session was stopped')
  if (got.error) { show('!!', `server: ${got.error}`); await new Promise((r) => setTimeout(r, POLL_MS * 2)); continue }

  const a = got.action
  if (!a) { await new Promise((r) => setTimeout(r, POLL_MS)); continue }

  // 1. The leash, locally, with the same module the server used.
  const verdict = decideAction({ kind: a.kind, app: a.app, host: a.host, target: a.target }, grants)
  if (!verdict.ok) {
    const why = verdict.refuse || verdict.needsHuman
    show('no', `${describe(a)} — refused here: ${why}`)
    await call('report', { session_id: sessionId, action_id: a.id, ok: false, error: `refused on the machine: ${why}` })
    continue
  }

  // 2. What is really in front. The server had to take the action's word for
  // it; this machine does not have to.
  if (a.app) {
    const front = await frontmostApp()
    if (front && !front.includes(String(a.app).toLowerCase()) && !String(a.app).toLowerCase().includes(front)) {
      const why = `${a.app} is not in front — ${front} is`
      show('no', `${describe(a)} — refused here: ${why}`)
      await call('report', { session_id: sessionId, action_id: a.id, ok: false, error: `refused on the machine: ${why}` })
      continue
    }
  }

  // 3. Do it, and say so.
  const out = await run(a)
  if (out.error) {
    show('!!', `${describe(a)} — ${out.error}`)
    await call('report', { session_id: sessionId, action_id: a.id, ok: false, error: out.error })
  } else {
    show('ok', describe(a))
    await call('report', { session_id: sessionId, action_id: a.id, ok: true, result: out.path ? { shot: out.path } : {} })
  }
}
