// The assistant's own browser — on the person's computer, out of their way.
//
// "If I have two tabs open the bot runs both tabs so I can't work and let my
// bot work as well" (Cole, 2026-10-19). Driving the screen means driving THE
// mouse and THE keyboard and whatever window is in front: while she works, he
// cannot. This is a second Chrome, with its own profile, driven through
// Chrome's DevTools Protocol — no mouse, no keyboard, no focus. It sits behind
// his windows; he keeps working in his.
//
// ONE MODE, NO RESTARTS. Headless would be truly invisible, but a person has
// to sign in to a site once, and a window can't be shown from headless without
// relaunching — which drops every session cookie. So it is an ordinary window
// that is kept BEHIND: after launch the window that was in front is put back,
// and "show" / "hide" only change which is on top. Rendering keeps going while
// it is covered (the occlusion / background throttling switches below). It is
// never minimised: a minimised window stops painting and a screenshot hangs.
//
// THE PAGE IS 1280x860 CSS PIXELS, whatever the window or the screen scale, so
// a position in the picture IS a position on the page — no mapping, no DPI.
//
// Its own profile, deliberately: since Chrome 136 remote debugging is refused
// on a person's default profile, and her browser should never be holding their
// personal tabs anyway. Sign-ins made in it stay in it (BASE/browser-profile).

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createServer } from 'node:net'

const WIN = process.platform === 'win32'
const MAC = process.platform === 'darwin'
const BASE = WIN ? join(process.env.LOCALAPPDATA || homedir(), 'JobScout') : join(homedir(), '.jobscout')
const PROFILE = join(BASE, 'browser-profile')
const PORT_FILE = join(BASE, 'browser-port')
export const VIEW = { width: 1280, height: 860 }

/** Chrome, or failing that Edge (also Chromium). Null if neither is installed. */
export function findChrome() {
  const env = process.env
  const c = WIN
    ? [
      join(env.ProgramFiles || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      join(env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      join(env.ProgramFiles || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
    ]
    : MAC
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return c.find((p) => p && existsSync(p)) || null
}
export const available = () => !!findChrome() && typeof globalThis.WebSocket === 'function'

const freePort = () => new Promise((res, rej) => {
  const s = createServer(); s.unref()
  s.on('error', rej)
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) })
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function devtools(port, path, method = 'GET') {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000)
  try { const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, signal: ctl.signal }); return r.ok ? await r.json() : null } catch { return null } finally { clearTimeout(t) }
}

// ── the connection ──────────────────────────────────────────────────────
let conn = null   // { ws, port, id, pending: Map }
let hooks = { frontTitle: async () => null, activate: async () => {}, activateProfile: async () => {} }
/** The agent hands over how to read and restore the person's front window. */
export function setWindowHooks(h) { hooks = { ...hooks, ...h } }

function send(method, params = {}, timeoutMs = 20000) {
  if (!conn || conn.ws.readyState !== 1) return Promise.reject(new Error('the browser is not connected'))
  const id = ++conn.id
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { conn?.pending.delete(id); reject(new Error(`${method} timed out`)) }, timeoutMs)
    conn.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v) }, reject: (e) => { clearTimeout(t); reject(e) } })
    conn.ws.send(JSON.stringify({ id, method, params }))
  })
}

async function connectTo(port) {
  let list = await devtools(port, '/json/list') || []
  let page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools://'))
  if (!page) page = await devtools(port, '/json/new?about:blank', 'PUT')
  if (!page?.webSocketDebuggerUrl) throw new Error('the browser has no page to work in')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not connect to the browser')) })
  conn = { ws, port, id: 0, pending: new Map(), targetId: page.id }
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data) } catch { return }
    if (m.id && conn?.pending.has(m.id)) {
      const p = conn.pending.get(m.id); conn.pending.delete(m.id)
      m.error ? p.reject(new Error(m.error.message || 'browser error')) : p.resolve(m.result || {})
    }
  }
  ws.onclose = () => { if (conn?.ws === ws) conn = null }
  await send('Page.enable')
  await send('Runtime.enable')
  // A fixed page size: a position in the picture is a position on the page.
  await send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1, mobile: false })
}

/** The browser, started if it is not running — behind whatever is in front. */
export async function ensureBrowser() {
  if (conn && conn.ws.readyState === 1) return { ok: true }
  if (!available()) return { error: 'Google Chrome is not installed on this computer, so there is no background browser.' }
  mkdirSync(PROFILE, { recursive: true })
  let port = 0
  try { port = Number(readFileSync(PORT_FILE, 'utf8')) || 0 } catch { /* first run */ }
  // Still running from before (the agent restarts on every update; the browser
  // and its sign-ins should not).
  if (!(port && await devtools(port, '/json/version'))) {
    port = await freePort()
    const before = await hooks.frontTitle().catch(() => null)
    spawn(findChrome(), [
      `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
      `--window-size=${VIEW.width + 16},${VIEW.height + 140}`,
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion',
      'about:blank',
    ], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
    let up = false
    for (let i = 0; i < 60 && !up; i++) { await sleep(250); up = !!(await devtools(port, '/json/version')) }
    if (!up) return { error: 'the background browser did not start' }
    writeFileSync(PORT_FILE, String(port))
    // Put back what the person was looking at: her window goes BEHIND.
    if (before) await hooks.activate(before).catch(() => {})
  }
  await connectTo(port)
  return { ok: true }
}

// ── what it is looking at ───────────────────────────────────────────────
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r?.result?.value
}
/** Where the page is: its address, host and title. */
export async function pageInfo() {
  const v = await evalJs('({ url: location.href, title: document.title })').catch(() => null)
  let host = ''
  try { host = new URL(v?.url || '').hostname.toLowerCase() } catch { /* about:blank */ }
  return { url: v?.url || '', host, title: v?.title || '' }
}
/** The field that has the cursor — so a password box is never typed into. */
export async function activeField() {
  return await evalJs(`(() => { const e = document.activeElement; if (!e || e === document.body) return null;
    const lab = e.labels && e.labels[0] ? e.labels[0].innerText : '';
    return { tag: e.tagName.toLowerCase(), type: (e.getAttribute('type') || '').toLowerCase(), autocomplete: (e.getAttribute('autocomplete') || '').toLowerCase(),
      name: e.getAttribute('name') || '', id: e.id || '', placeholder: e.getAttribute('placeholder') || '', label: lab || e.getAttribute('aria-label') || '' } })()`).catch(() => null)
}
/** Is the focused field one that wants a secret? */
export function isSecretField(f) {
  if (!f) return false
  if (f.type === 'password') return true
  if (/current-password|new-password|one-time-code|cc-number|cc-csc/.test(f.autocomplete || '')) return true
  const h = `${f.name} ${f.id} ${f.placeholder} ${f.label}`.toLowerCase()
  return /password|passcode|\bpin\b|security code|cvv|cvc|card number|one-time|otp|2fa|verification code|ssn|social security/.test(h)
}

// ── doing things ────────────────────────────────────────────────────────
export async function screenshot() {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 20000)
  const path = join(tmpdir(), `jobscout-bshot-${Date.now()}.png`)
  writeFileSync(path, Buffer.from(r.data, 'base64'))
  return { path }
}

export async function click(x, y, button = 'left', count = 1) {
  const X = Number(x), Y = Number(y)
  if (!Number.isFinite(X) || !Number.isFinite(Y)) return { error: 'that click had no coordinates' }
  if (X < 0 || Y < 0 || X > VIEW.width || Y > VIEW.height) return { error: `(${X}, ${Y}) is outside the ${VIEW.width}x${VIEW.height} page` }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X, y: Y })
  for (let i = 1; i <= count; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: X, y: Y, button, clickCount: i })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X, y: Y, button, clickCount: i })
  }
  return {}
}

// ctrl+l → type → enter is how the assistant has learnt to go to an address.
// There is no address bar here, so that sequence is kept as the intent it is.
let addressBar = null
export async function navigate(url) {
  let u = String(url || '').trim()
  if (!u) return { error: 'no address to go to' }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`
  if (!/^https?:/i.test(u)) return { error: 'only web addresses can be opened' }
  addressBar = null
  await send('Page.navigate', { url: u }, 30000)
  // Wait for the page to settle, up to ten seconds.
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    const s = await evalJs('document.readyState').catch(() => null)
    if (s === 'complete') break
  }
  return {}
}

export async function type(text) {
  const s = String(text ?? '')
  if (!s) return { error: 'there was no text to type' }
  if (addressBar !== null) { addressBar += s; return {} }
  await send('Input.insertText', { text: s })
  return {}
}

const KEYS = {
  enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' }, tab: { key: 'Tab', code: 'Tab', vk: 9 },
  escape: { key: 'Escape', code: 'Escape', vk: 27 }, backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  delete: { key: 'Delete', code: 'Delete', vk: 46 }, up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 }, left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 }, home: { key: 'Home', code: 'Home', vk: 36 },
  end: { key: 'End', code: 'End', vk: 35 }, pageup: { key: 'PageUp', code: 'PageUp', vk: 33 }, pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
}
export async function key(name) {
  const k = String(name || '').toLowerCase().replace(/\s+/g, '')
  if (['ctrl+l', 'cmd+l', 'address_bar', 'addressbar'].includes(k)) { addressBar = ''; return {} }
  if (addressBar !== null && k === 'enter') return await navigate(addressBar)
  if (addressBar !== null && k === 'escape') { addressBar = null; return {} }
  const d = KEYS[k]
  if (!d) return { error: `not a key this agent will press: ${name}` }
  await send('Input.dispatchKeyEvent', { type: d.text ? 'keyDown' : 'rawKeyDown', key: d.key, code: d.code, windowsVirtualKeyCode: d.vk, ...(d.text ? { text: d.text } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: d.key, code: d.code, windowsVirtualKeyCode: d.vk })
  return {}
}

export async function scroll(direction = 'down', amount = 3) {
  const n = Math.max(1, Math.min(20, Number(amount) || 3)) * 120
  const dy = direction === 'up' ? -n : direction === 'down' ? n : 0
  const dx = direction === 'left' ? -n : direction === 'right' ? n : 0
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: VIEW.width / 2, y: VIEW.height / 2, deltaX: dx, deltaY: dy })
  return {}
}

// ── show and hide ───────────────────────────────────────────────────────
let shownOver = null   // what was in front when she showed herself
export async function show() {
  try {
    const { windowId } = await send('Browser.getWindowForTarget', { targetId: conn.targetId })
    await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  } catch { /* older Chrome: the bring-to-front below still works */ }
  shownOver = await hooks.frontTitle().catch(() => null)
  await send('Page.bringToFront')
  // Found by its own profile folder — never by a title, which one of the
  // person's own tabs could share.
  await hooks.activateProfile(PROFILE).catch(() => {})
  return { shown: true }
}
export async function hide() {
  if (shownOver) await hooks.activate(shownOver).catch(() => {})
  shownOver = null
  return { hidden: true }
}
