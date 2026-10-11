// The hands, per platform. Windows via PowerShell, macOS via screencapture
// and AppleScript's System Events.
//
// One module with one shape so the agent loop never asks which operating
// system it is on. A platform that cannot do something returns an error
// rather than approximating it — an agent that guesses at a click is worse
// than one that says it cannot click.
//
// NOTHING HERE INTERPOLATES A VALUE INTO A COMMAND LINE. Text to type goes
// through a file; a key press is matched against a fixed list and a name not
// on it never reaches a shell. The moment Arnie is reading a web page, a
// string he was asked to type is attacker-influenced data, and a shell is
// exactly the wrong place to put it.

import { execFile } from 'node:child_process'
import { writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const WIN = process.platform === 'win32'
const MAC = process.platform === 'darwin'

export const platformName = WIN ? 'Windows' : MAC ? 'macOS' : process.platform

const run = (cmd, args, opts = {}) => new Promise((done) => {
  execFile(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 20000, maxBuffer: 32 * 1024 * 1024 },
    (err, stdout, stderr) => done({
      ok: !err,
      out: String(stdout || '').trim(),
      err: String(stderr || err?.message || '').trim(),
    }))
})

const ps = (script) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script])
const osa = (script) => run('osascript', ['-e', script])

// ── what is really in front ─────────────────────────────────────────────
// The server has to take an action's word that it means Chrome. The machine
// does not, and this is the check that makes a click aimed at a browser
// unable to land in Excel.
export async function frontmostApp() {
  if (WIN) {
    const r = await ps(`
      Add-Type -Namespace W -Name U -MemberDefinition '
        [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int pid);'
      $h = [W.U]::GetForegroundWindow(); $procId = 0; [void][W.U]::GetWindowThreadProcessId($h, [ref]$procId)
      (Get-Process -Id $procId).ProcessName`)
    return r.ok ? r.out.toLowerCase() : ''
  }
  if (MAC) {
    const r = await osa('tell application "System Events" to get name of first application process whose frontmost is true')
    return r.ok ? r.out.toLowerCase() : ''
  }
  return ''
}

// ── the screen ──────────────────────────────────────────────────────────
export async function screenshot() {
  const path = join(tmpdir(), `jobscout-shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`)
  if (WIN) {
    const escaped = path.replace(/\\/g, '\\\\')
    const r = await ps(`
      Add-Type -AssemblyName System.Windows.Forms,System.Drawing
      $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
      $bmp.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()`)
    return r.ok ? { path } : { error: r.err || 'screenshot failed' }
  }
  if (MAC) {
    // -x is silent (no shutter sound); needs the Screen Recording grant,
    // which the person gives once in System Settings and we cannot script.
    const r = await run('screencapture', ['-x', '-t', 'png', path])
    if (!r.ok) return { error: r.err || 'screenshot failed — is Screen Recording allowed for this app?' }
    try { if (statSync(path).size > 0) return { path } } catch { /* nothing written */ }
    return { error: 'screenshot produced nothing — Screen Recording is probably not allowed yet' }
  }
  return { error: `no screenshot on ${process.platform}` }
}

// ── pointer ─────────────────────────────────────────────────────────────
export async function clickAt(x, y, button = 'left', double = false) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return { error: 'that click had no coordinates' }
  const X = Math.round(Number(x)), Y = Math.round(Number(y))
  if (WIN) {
    const DOWN = button === 'right' ? 0x0008 : 0x0002
    const UP = button === 'right' ? 0x0010 : 0x0004
    const once = `[W.M]::mouse_event(${DOWN},0,0,0,0); [W.M]::mouse_event(${UP},0,0,0,0)`
    const r = await ps(`
      Add-Type -Namespace W -Name M -MemberDefinition '
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);'
      [void][W.M]::SetCursorPos(${X}, ${Y}); Start-Sleep -Milliseconds 60
      ${once}${double ? `; Start-Sleep -Milliseconds 60; ${once}` : ''}`)
    return r.ok ? {} : { error: r.err || 'click failed' }
  }
  if (MAC) {
    const verb = button === 'right' ? 'right click' : (double ? 'double click' : 'click')
    const r = await osa(`tell application "System Events" to ${verb} at {${X}, ${Y}}`)
    return r.ok ? {} : { error: macHint(r.err) }
  }
  return { error: `no pointer on ${process.platform}` }
}

export async function scroll(direction, amount = 3) {
  const steps = Math.max(1, Math.min(10, Number(amount) || 3))
  if (WIN) {
    const delta = (direction === 'up' ? 120 : -120) * steps
    const r = await ps(`
      Add-Type -Namespace W -Name S -MemberDefinition '
        [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);'
      [W.S]::mouse_event(0x0800, 0, 0, ${delta}, 0)`)
    return r.ok ? {} : { error: r.err || 'scroll failed' }
  }
  if (MAC) {
    const key = direction === 'up' ? 126 : 125
    const r = await osa(`tell application "System Events" to repeat ${steps} times
      key code ${key}
    end repeat`)
    return r.ok ? {} : { error: macHint(r.err) }
  }
  return { error: `no scrolling on ${process.platform}` }
}

// ── keyboard ────────────────────────────────────────────────────────────
export async function typeText(text) {
  const s = String(text ?? '')
  if (!s) return {}
  const path = join(tmpdir(), `jobscout-type-${Date.now()}.txt`)
  try {
    if (WIN) {
      // SendKeys treats these as control characters, so everything is escaped,
      // and the text travels by file rather than on a command line.
      writeFileSync(path, s.replace(/([+^%~(){}[\]])/g, '{$1}'), 'utf8')
      const r = await ps(`
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait([System.IO.File]::ReadAllText('${path.replace(/\\/g, '\\\\')}'))`)
      return r.ok ? {} : { error: r.err || 'type failed' }
    }
    if (MAC) {
      // Same reasoning: the string is read from a file by the script rather
      // than pasted into one.
      writeFileSync(path, s, 'utf8')
      const r = await run('osascript', ['-e',
        'on run argv\n' +
        '  set t to (read (POSIX file (item 1 of argv)) as «class utf8»)\n' +
        '  tell application "System Events" to keystroke t\n' +
        'end run', path])
      return r.ok ? {} : { error: macHint(r.err) }
    }
    return { error: `no keyboard on ${process.platform}` }
  } finally {
    try { rmSync(path, { force: true }) } catch { /* temp */ }
  }
}

// A fixed list. A key name that is not on it never reaches a shell.
const KEYS_WIN = {
  enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}', backspace: '{BACKSPACE}',
  delete: '{DELETE}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
}
const KEYS_MAC = {
  enter: 36, tab: 48, escape: 53, backspace: 51, delete: 117,
  up: 126, down: 125, left: 123, right: 124,
  home: 115, end: 119, pageup: 116, pagedown: 121,
}

export async function pressKey(name) {
  const k = String(name || '').toLowerCase()
  if (WIN) {
    const seq = KEYS_WIN[k]
    if (!seq) return { error: `not a key this agent will press: ${name}` }
    const r = await ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${seq}')`)
    return r.ok ? {} : { error: r.err || 'key failed' }
  }
  if (MAC) {
    const code = KEYS_MAC[k]
    if (code === undefined) return { error: `not a key this agent will press: ${name}` }
    const r = await osa(`tell application "System Events" to key code ${code}`)
    return r.ok ? {} : { error: macHint(r.err) }
  }
  return { error: `no keyboard on ${process.platform}` }
}

// macOS refuses input synthesis until the person allows it, and the raw error
// is an osascript number nobody can act on.
function macHint(err) {
  if (/not allowed|1002|assistive|accessibility/i.test(err || '')) {
    return 'macOS has not been told to allow this yet — System Settings → Privacy & Security → Accessibility, and allow the app running this agent.'
  }
  return err || 'that did not work'
}

/**
 * What this platform can and cannot do, said plainly at startup.
 *
 * Recording is Windows-only today. It needs a resident input hook, and the
 * macOS equivalent wants a signed helper with the Accessibility grant rather
 * than a shell command — so the agent RUNS on macOS and can be taught on
 * Windows, and says so rather than silently recording nothing.
 */
export const capabilities = {
  perform: WIN || MAC,
  record: WIN,
  notes: WIN
    ? []
    : MAC
      ? ['Teaching by demonstration is Windows-only for now — Arnie can do the work on this Mac, but cannot watch you do it yet.',
         'macOS will ask you to allow Screen Recording and Accessibility in System Settings the first time. Neither can be granted from here.']
      : [`This agent does not run on ${process.platform} yet.`],
}
