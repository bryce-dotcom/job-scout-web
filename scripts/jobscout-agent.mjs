#!/usr/bin/env node
// JobScout Agent — Arnie's hands on this computer.
//
//   node scripts/jobscout-agent.mjs
//
// It connects OUTWARD to arnie-computer and polls. Nothing listens on this
// machine, no port is opened, and there is no inbound connection — the answer
// to every IT question this feature will ever be asked, so it is the design
// rather than a detail.
//
// THREE THINGS THIS AGENT DOES THAT THE SERVER CANNOT
//
//   1. It enforces the leash LOCALLY, importing the very same
//      _shared/computerGrants.ts the server uses — not a copy of the rules.
//      An agent that only did what the server told it would do whatever a
//      COMPROMISED server told it. This is the check that protects the machine.
//
//   2. It checks what is really on screen. An action says "chrome on
//      traksmart.example"; only the machine knows whether Chrome is in front.
//
//   3. It prints every action, allowed or refused, as it happens. The person
//      watching this window is the last line of defence.
//
// IT NEVER TYPES A CREDENTIAL, and it never RECORDS one either: the recorder
// is paused for as long as Arnie is waiting on a handoff, so a password typed
// during a demonstration cannot reach a screenshot.
//
// Ctrl+C is the kill switch: the session is stopped, anything queued is
// refused, and nothing more runs on it ever.

import { readFileSync, writeFileSync, rmSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, unlink } from 'node:fs/promises'

import {
  frontmostApp, screenshot, clickAt, scroll, typeText, pressKey,
  capabilities, platformName,
} from './agent/hands.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// The SAME module the server decides with. Not a port of it — the file
// itself. If these two ever disagree, the disagreement is indistinguishable
// from a bypass, so there is only one of them.
//
// Imported statically, not resolved at runtime, for two reasons: the packaged
// agent a customer downloads is one bundled file with no checkout around it,
// and a static import is a claim the build can keep — a runtime path can go
// missing and be papered over with a fallback, which is exactly how a second
// copy of the rules gets born.
import { decideAction } from '../supabase/functions/_shared/computerGrants.ts'

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
let TOKEN = process.env.JOBSCOUT_AGENT_TOKEN || ''

const die = (m) => { console.error(`\nagent: ${m}\n`); process.exit(1) }
if (!URL_BASE) die('no JobScout URL — set JOBSCOUT_URL or run from a checkout with .env')
if (!capabilities.perform) die(`this agent does not run on ${process.platform} yet.`)

// ── connecting, the first time ──────────────────────────────────────────
// There used to be a step here where a person opened Settings, revealed a
// token, copied it, opened a terminal and pasted it into a command. Nobody
// outside the room that built this would ever do that, and it made every
// other thing in the Computer tab unreachable.
//
// Now the agent asks for a code, opens the browser itself, and waits. The
// person presses Connect on a page they are ALREADY signed in to — which is
// what authorises it. Nothing is typed and nothing is copied.
//
// The token that comes back is written to a file only readable by this user,
// so the next run is silent.
const TOKEN_FILE = join(
  process.env.APPDATA || process.env.HOME || tmpdir(),
  process.platform === 'win32' ? 'JobScout' : '.jobscout',
  'agent-token',
)

const readSavedToken = () => {
  try { return readFileSync(TOKEN_FILE, 'utf8').trim() || '' } catch { return '' }
}

const saveToken = (t) => {
  try {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true })
    // 0600: this is a key to the person's account, not a config value.
    writeFileSync(TOKEN_FILE, t, { mode: 0o600 })
  } catch { /* it still works this run; they just connect again next time */ }
}

const openBrowser = (url) => {
  const cmd = process.platform === 'win32' ? 'cmd' : 'open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref() } catch { /* printed below anyway */ }
}

const pair = async () => {
  const res = await fetch(`${URL_BASE}/functions/v1/arnie-pair`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', device_label: DEVICE, platform: process.platform, agent_version: VERSION }),
  }).catch(() => null)
  const started = res?.ok ? await res.json().catch(() => null) : null
  if (!started?.code) die('could not reach JobScout to connect. Check the internet connection and try again.')

  const url = `${APP_URL}/connect?code=${started.code}`
  console.log(`
  Connecting this computer to JobScout.

  A browser should have opened. If it did not, go to:
  ${url}

  Waiting for you to press Connect…`)
  openBrowser(url)

  const until = Date.now() + 120_000
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000))
    const p = await fetch(`${URL_BASE}/functions/v1/arnie-pair`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'poll', code: started.code, poll_secret: started.poll_secret }),
    }).then((r) => r.json()).catch(() => null)
    if (p?.status === 'connected' && p.refresh_token) {
      saveToken(p.refresh_token)
      console.log('  Connected.\n')
      return p.refresh_token
    }
    if (p?.status === 'expired') break
  }
  die('nobody pressed Connect, so this computer is not paired. Run it again when you are ready.')
}

const APP_URL = process.env.JOBSCOUT_APP_URL || 'https://jobscout.appsannex.com'
const DEVICE = process.env.JOBSCOUT_DEVICE_LABEL || process.env.COMPUTERNAME || process.env.HOSTNAME || 'this computer'
const VERSION = '0.3.0'

// ── the access token, kept fresh ────────────────────────────────────────
// JOBSCOUT_AGENT_TOKEN is a REFRESH token. An access token lasts an hour,
// which would have the agent stop working over lunch, so it is exchanged here
// and re-exchanged when it ages. The refresh token never leaves this process.
let access = ''
let accessUntil = 0
let repaired = false
const freshAccess = async () => {
  if (access && Date.now() < accessUntil - 60_000) return access
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: TOKEN }),
  })
  const j = await res.json().catch(() => ({}))
  if (!j.access_token) {
    // A saved token does not last forever — it gets rotated, revoked, or the
    // person signs out everywhere. Sending them back to a settings page to
    // copy a new one would reintroduce exactly the step this flow exists to
    // delete, so reconnect instead. Once: if the second attempt is also
    // refused, something is actually wrong and saying so beats looping.
    if (repaired) die(`could not sign in even after reconnecting (${j.error_description || j.msg || res.status})`)
    repaired = true
    console.log('\n  This computer needs connecting again.')
    try { rmSync(TOKEN_FILE, { force: true }) } catch { /* nothing saved */ }
    TOKEN = await pair()
    return freshAccess()
  }
  access = j.access_token
  accessUntil = Date.now() + (Number(j.expires_in) || 3600) * 1000
  return access
}

const call = async (action, body = {}) => {
  const bearer = await freshAccess()
  const res = await fetch(`${URL_BASE}/functions/v1/arnie-computer`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const text = await res.text()
  let json = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { error: text.slice(0, 200) } }
  return { status: res.status, ...json }
}

/** A screenshot into the private recordings bucket. Returns its path. */
const uploadShot = async (localPath, skillId, seq) => {
  const bearer = await freshAccess()
  const key = `${skillId}/${String(seq).padStart(5, '0')}.png`
  try {
    const bytes = await readFile(localPath)
    const res = await fetch(`${URL_BASE}/storage/v1/object/arnie-recordings/${key}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: bytes,
    })
    return res.ok ? key : null
  } catch { return null } finally {
    try { await unlink(localPath) } catch { /* temp */ }
  }
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
    // Deliberately not implemented rather than approximated.
    case 'read_text': return { error: 'this agent cannot read the screen yet' }
    case 'launch': return { error: 'launching programs is not built yet' }
    default: return { error: `unknown action kind: ${a.kind}` }
  }
}

let sessionId = null
let stopping = false
// Whether we have already replaced a vanished session. Once only — see the
// 404 branch in the loop.
let resumed = false

// ── the recorder ────────────────────────────────────────────────────────
// A resident PowerShell process streaming NDJSON. Spawning a shell per poll
// would cost tens of milliseconds and miss most clicks.
let rec = null          // { proc, skillId, held, ctl }
let pending = []        // observations waiting to be sent
let recTail = ''

// Control is a FILE, not stdin. PowerShell block-buffers a redirected stdout
// and [Console]::In.Peek() blocks on a redirected stdin, so a recorder driven
// through pipes went deaf the moment it was paused — found by running it.
// The recorders are spawned, not imported, so they are real files on disk
// that a bundle cannot swallow. In a checkout they sit in scripts/agent; in
// the packaged agent a customer downloads they sit beside the agent itself.
// Resolving both beats making the launcher mirror a repo's folder names.
const recorderPath = (file) => {
  for (const p of [join(HERE, file), join(HERE, 'agent', file)]) {
    try { if (statSync(p).isFile()) return p } catch { /* try the next */ }
  }
  return join(HERE, 'agent', file)   // the error names the place it expects
}

const startRecorder = (skillId, name) => {
  if (rec || !capabilities.record) return
  const ctl = join(tmpdir(), `jobscout-rec-${process.pid}-${skillId}.txt`)
  try { writeFileSync(ctl, '') } catch { show('!!', 'could not open a control file for the recorder'); return }
  // Two recorders, one output format, so nothing below cares which ran.
  const proc = process.platform === 'darwin'
    ? spawn('osascript', ['-l', 'JavaScript', recorderPath('recorder.jxa.js'), ctl],
      { stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', recorderPath('recorder.ps1'), '-ControlFile', ctl],
      { stdio: ['pipe', 'pipe', 'pipe'] })
  rec = { proc, skillId, held: false, ctl, startedAt: Date.now(), seen: 0, warned: false }
  proc.stdout.on('data', (buf) => {
    recTail += buf.toString()
    const lines = recTail.split('\n')
    recTail = lines.pop() || ''
    for (const line of lines) {
      const s = line.trim()
      if (!s) continue
      let o
      try { o = JSON.parse(s) } catch { continue /* a partial line */ }
      // A recorder that cannot watch the screen says so, and the person is
      // told rather than left with an empty recording. This is the whole
      // point of the grant check on macOS — a silent nothing is the failure
      // we are guarding against.
      if (o.kind === 'error') {
        show('!!', o.message || 'the recorder could not start')
        stopRecorder()
        return
      }
      pending.push(o)
      if (rec && !['started', 'paused', 'resumed', 'stopped'].includes(o.kind)) rec.seen++
    }
  })
  proc.on('exit', () => { if (rec?.proc === proc) rec = null })
  proc.on('error', (e) => { show('!!', `the recorder would not start: ${e.message}`); rec = null })
  show('rec', `recording “${name}” — do the job once, then stop it in the app`)
}

const stopRecorder = () => {
  if (!rec) return
  const { proc, ctl } = rec
  try { writeFileSync(ctl, 'stop') } catch { /* already gone */ }
  setTimeout(() => {
    try { proc.kill() } catch { /* gone */ }
    try { rmSync(ctl, { force: true }) } catch { /* temp */ }
  }, 2000)
  rec = null
  show('rec', 'recording stopped')
}

const holdRecorder = (hold) => {
  if (!rec || rec.held === hold) return
  try { writeFileSync(rec.ctl, hold ? 'pause' : 'resume') } catch { return }
  rec.held = hold
  show('rec', hold
    ? 'recorder paused while Arnie waits on you — nothing is captured, including what you type'
    : 'recorder going again')
}

/**
 * Belt as well as braces for the silent-nothing failure.
 *
 * macOS reports a missing grant through AXIsProcessTrusted, but that check
 * fails OPEN — if it throws we carry on rather than refusing to record. So if
 * a recording has been running a while and the recorder has seen literally
 * nothing, say so once. A person who has been demonstrating for half a minute
 * deserves to know it is not landing.
 */
const nudgeIfDeaf = () => {
  if (!rec || rec.warned || rec.held) return
  if (rec.seen > 0 || Date.now() - rec.startedAt < 25_000) return
  rec.warned = true
  show('!!', process.platform === 'darwin'
    ? 'nothing recorded yet. macOS probably has not been allowed to watch — System Settings → Privacy & Security → Accessibility and Input Monitoring, then start the recording again.'
    : 'nothing recorded yet — if you have been clicking, the recorder is not seeing it.')
}

/** Send what the recorder saw, with a screenshot for the moments worth one. */
const flushObservations = async () => {
  nudgeIfDeaf()
  if (!rec || !pending.length) return
  const batch = pending.splice(0, 25)
  for (const o of batch) {
    // A shot for the moments that place a step. Not for every keystroke run,
    // and never while held.
    if (!rec?.held && ['click', 'double_click', 'right_click', 'app_change'].includes(o.kind)) {
      const shot = await screenshot()
      if (shot.path) o.shot_path = await uploadShot(shot.path, rec.skillId, o.seq)
    }
  }
  const r = await call('observe', { skill_id: rec?.skillId, observations: batch }).catch(() => null)
  // A recording that has stopped server-side stops here too.
  if (r?.status === 409) stopRecorder()
}

const stop = async (why) => {
  if (stopping) return
  stopping = true
  console.log(`\n  stopping — ${why}`)
  stopRecorder()
  if (sessionId) {
    const r = await call('stop', { session_id: sessionId }).catch(() => ({}))
    // A 404 here is not a failure to reach anything: the session is already
    // gone, which is often exactly why we are stopping. Saying "could not
    // reach the server" in that case sends somebody to check their internet.
    console.log(
      r.ok ? '  session stopped; anything queued was refused'
        : r.status === 404 ? '  that session was already closed'
          : '  could not reach the server to stop cleanly',
    )
  }
  process.exit(0)
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop('you pressed Ctrl+C').catch(() => process.exit(0)) })

// A token from the environment wins (that is how a test or a managed install
// supplies one), then one saved from a previous connect, and only if there is
// neither does anybody get asked anything.
if (!TOKEN) TOKEN = readSavedToken()
if (!TOKEN) TOKEN = await pair()

const hello = await call('hello', { device_label: DEVICE, platform: process.platform, agent_version: VERSION })
if (!hello.ok) die(`could not connect: ${hello.error || hello.status}`)
sessionId = hello.session_id

console.log(`
  JobScout Agent ${VERSION} — ${platformName}
  ${DEVICE} → ${URL_BASE.replace(/^https?:\/\//, '')}
  session ${sessionId}

  Arnie can only touch programs you have granted. Everything he does prints
  here as it happens. Ctrl+C stops him on this computer.
`)
for (const note of capabilities.notes) console.log(`  note: ${note}`)
if (capabilities.notes.length) console.log('')

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
  // Grants are re-read regularly, never trusted from the handshake forever:
  // revoking has to bite on the next action, not the next restart.
  if (sinceGrants++ >= 10) {
    sinceGrants = 0
    const g = await call('grants').catch(() => null)
    if (g?.ok) grants = g.grants || []
  }

  const got = await call('next', { session_id: sessionId }).catch((e) => ({ error: String(e.message) }))
  if (got.stopped) await stop('the session was stopped')

  // A session that no longer EXISTS is different from one that was stopped,
  // and the difference matters because only one of them is a person's
  // decision. Stopping is handled above. This is the other case — the row is
  // gone — and it used to print the same line every few seconds forever: a
  // wall of "No session of yours by that id" where the window should have
  // said what happened. Found by killing a session under a running agent.
  //
  // So: start a fresh one, once. That covers the row genuinely vanishing.
  // If the new session is refused too, something is actually wrong and
  // saying so and stopping beats scrolling an error until the machine is
  // rebooted.
  if (got.status === 404) {
    if (resumed) await stop('this computer is no longer connected to a session')
    resumed = true
    show('..', 'that session is gone — starting a new one')
    const again = await call('hello', { device_label: DEVICE, platform: process.platform, agent_version: VERSION })
    if (!again.ok) await stop(`could not start a new session (${again.error || again.status})`)
    sessionId = again.session_id
    grants = again.grants || []
    show('ok', `session ${sessionId}`)
    continue
  }

  if (got.error) { show('!!', `server: ${got.error}`); await new Promise((r) => setTimeout(r, POLL_MS * 2)); continue }

  // Teaching, and the pause that keeps a password out of a screenshot.
  if (got.recording && !rec && capabilities.record) startRecorder(got.recording.skill_id, got.recording.name)
  if (got.recording && rec) holdRecorder(!!got.hold_recorder)
  if (!got.recording && rec) stopRecorder()
  if (got.recording && !capabilities.record && !rec) {
    show('!!', 'a recording is running but this platform cannot watch a screen yet — stop it in the app')
  }
  await flushObservations()

  const a = got.action
  if (!a) { await new Promise((r) => setTimeout(r, POLL_MS)); continue }

  // 1. The leash, locally, with the same module the server used.
  const verdict = decideAction({ kind: a.kind, app: a.app, host: a.host, target: a.target }, grants)
  if (!verdict.ok) {
    const why = verdict.refuse || verdict.needsHuman || verdict.needsApproval
    show('no', `${describe(a)} — refused here: ${why}`)
    await call('report', { session_id: sessionId, action_id: a.id, ok: false, error: `refused on the machine: ${why}` })
    continue
  }

  // 2. What is really in front. The server had to take the action's word.
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
