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

import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
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
const TOKEN = process.env.JOBSCOUT_AGENT_TOKEN || ''

const die = (m) => { console.error(`\nagent: ${m}\n`); process.exit(1) }
if (!URL_BASE) die('no JobScout URL — set JOBSCOUT_URL or run from a checkout with .env')
if (!TOKEN) die('no JOBSCOUT_AGENT_TOKEN — get one from Arnie → Computer → Connect this computer')
if (!capabilities.perform) die(`this agent does not run on ${process.platform} yet.`)

const DEVICE = process.env.JOBSCOUT_DEVICE_LABEL || process.env.COMPUTERNAME || process.env.HOSTNAME || 'this computer'
const VERSION = '0.2.0'

// ── the access token, kept fresh ────────────────────────────────────────
// JOBSCOUT_AGENT_TOKEN is a REFRESH token. An access token lasts an hour,
// which would have the agent stop working over lunch, so it is exchanged here
// and re-exchanged when it ages. The refresh token never leaves this process.
let access = ''
let accessUntil = 0
const freshAccess = async () => {
  if (access && Date.now() < accessUntil - 60_000) return access
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: TOKEN }),
  })
  const j = await res.json().catch(() => ({}))
  if (!j.access_token) die(`that token was refused — get a new one from Arnie → Computer → Connect this computer\n(${j.error_description || j.msg || res.status})`)
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

// ── the recorder ────────────────────────────────────────────────────────
// A resident PowerShell process streaming NDJSON. Spawning a shell per poll
// would cost tens of milliseconds and miss most clicks.
let rec = null          // { proc, skillId, held, ctl }
let pending = []        // observations waiting to be sent
let recTail = ''

// Control is a FILE, not stdin. PowerShell block-buffers a redirected stdout
// and [Console]::In.Peek() blocks on a redirected stdin, so a recorder driven
// through pipes went deaf the moment it was paused — found by running it.
const startRecorder = (skillId, name) => {
  if (rec || !capabilities.record) return
  const ctl = join(tmpdir(), `jobscout-rec-${process.pid}-${skillId}.txt`)
  try { writeFileSync(ctl, '') } catch { show('!!', 'could not open a control file for the recorder'); return }
  const proc = spawn('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'agent', 'recorder.ps1'), '-ControlFile', ctl],
    { stdio: ['pipe', 'pipe', 'pipe'] })
  rec = { proc, skillId, held: false, ctl }
  proc.stdout.on('data', (buf) => {
    recTail += buf.toString()
    const lines = recTail.split('\n')
    recTail = lines.pop() || ''
    for (const line of lines) {
      const s = line.trim()
      if (!s) continue
      try { pending.push(JSON.parse(s)) } catch { /* a partial line; dropped */ }
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

/** Send what the recorder saw, with a screenshot for the moments worth one. */
const flushObservations = async () => {
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
    console.log(r.ok ? '  session stopped; anything queued was refused' : '  could not reach the server to stop cleanly')
  }
  process.exit(0)
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop('you pressed Ctrl+C').catch(() => process.exit(0)) })

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
