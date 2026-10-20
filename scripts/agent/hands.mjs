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

// Every script runs DPI-AWARE. Without it, on a screen scaled above 100% —
// Bryce's laptop is 150%: 2560x1600 real, 1707x1067 as PowerShell saw it —
// the window's rectangle came back in scaled units while the capture took real
// pixels, so a screenshot was the top-left two-thirds of the window and every
// click landed down and to the right of where Jenny aimed (2026-10-15: "Inbox"
// and the search box's X, aimed dead-on in the picture, missed). Aware, the
// rectangle, the capture and the cursor all speak real pixels.
const DPI_AWARE = `Add-Type -Namespace JsDpi -Name P -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();' -ErrorAction SilentlyContinue; [void][JsDpi.P]::SetProcessDPIAware()
`
export const withDpiAware = (script) => DPI_AWARE + script
const ps = (script) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', withDpiAware(script)])
const osa = (script) => run('osascript', ['-e', script])

// ── what is really in front ─────────────────────────────────────────────
// The server has to take an action's word that it means Chrome. The machine
// does not, and this is the check that makes a click aimed at a browser
// unable to land in Excel.
export async function frontmostApp() {
  if (WIN) {
    // ApplicationFrameHost is not an app. It is the frame Windows draws around
    // Store apps — Calculator, Settings, Mail, Photos — so asking the
    // foreground window who owns it names the frame rather than the program.
    // Every one of those reads as "applicationframehost is in front", which
    // would make this check both useless and wrong: useless because it never
    // matches what was asked for, wrong because two different Store apps are
    // indistinguishable to it. The real program owns the CoreWindow inside the
    // frame, so when we land on the frame we look one level in.
    const r = await ps(`
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class JsFront {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
  public static int Pid() {
    IntPtr h = GetForegroundWindow();
    int outer; GetWindowThreadProcessId(h, out outer);
    int inner = 0;
    EnumChildWindows(h, delegate(IntPtr c, IntPtr l) {
      int cp; GetWindowThreadProcessId(c, out cp);
      if (cp != outer) { inner = cp; return false; }
      return true;
    }, IntPtr.Zero);
    return inner != 0 ? inner : outer;
  }
}
"@
      (Get-Process -Id ([JsFront]::Pid())).ProcessName`)
    return r.ok ? r.out.toLowerCase() : ''
  }
  if (MAC) {
    const r = await osa('tell application "System Events" to get name of first application process whose frontmost is true')
    return r.ok ? r.out.toLowerCase() : ''
  }
  return ''
}

// ── the screen ──────────────────────────────────────────────────────────
/**
 * A picture of the program in FRONT — not of everything you have open.
 *
 * This used to capture the whole virtual screen, every monitor, every window.
 * Once Arnie could actually look at the result, that turned the permission
 * model into a lie: a person allows him "notepad" and gets handed a
 * photograph of their email, their bank tab and whatever else was on the
 * other monitor. The grant says one program, so the picture has to BE one
 * program, or the grant is decoration.
 *
 * The frontmost check upstream has already confirmed the window in front is
 * the program that was allowed, so the foreground rectangle is exactly the
 * thing he was given permission to see. If that rectangle cannot be found we
 * fail rather than falling back to the whole screen — a failure is
 * recoverable, a silent over-capture is not.
 */
/**
 * The size a picture is handed over at: no wider than 1280 and no more than
 * about 1.1 megapixels, so the model reads it as it is and a position it names
 * is a position in THIS picture. Never enlarged.
 */
export function fitShot(w, h) {
  const k = Math.min(1, 1280 / w, Math.sqrt(1_100_000 / (w * h)))
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}

/** Width and height of a PNG, from its header. */
export function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
}

export async function screenshot() {
  const path = join(tmpdir(), `jobscout-shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`)
  if (WIN) {
    const escaped = path.replace(/\\/g, '\\\\')
    const r = await ps(`
      Add-Type -AssemblyName System.Windows.Forms,System.Drawing
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public struct JsRect { public int Left, Top, Right, Bottom; }
public static class JsWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out JsRect r);
}
"@
      $h = [JsWin]::GetForegroundWindow()
      $r = New-Object JsRect
      if (-not [JsWin]::GetWindowRect($h, [ref]$r)) { throw 'no foreground window' }
      $w = $r.Right - $r.Left; $hgt = $r.Bottom - $r.Top
      if ($w -le 0 -or $hgt -le 0) { throw 'foreground window has no size' }
      $bmp = New-Object System.Drawing.Bitmap $w, $hgt
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen((New-Object System.Drawing.Point $r.Left, $r.Top), [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size $w, $hgt))
      $k = [Math]::Min(1.0, [Math]::Min(1280.0 / $w, [Math]::Sqrt(1100000.0 / ($w * $hgt))))
      $ow = [Math]::Max(1, [int][Math]::Round($w * $k)); $oh = [Math]::Max(1, [int][Math]::Round($hgt * $k))
      $out = New-Object System.Drawing.Bitmap $ow, $oh
      $g2 = [System.Drawing.Graphics]::FromImage($out)
      $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g2.DrawImage($bmp, 0, 0, $ow, $oh)
      $out.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png)
      $g2.Dispose(); $out.Dispose(); $g.Dispose(); $bmp.Dispose()
      Write-Output ("{0},{1},{2},{3}" -f $r.Left, $r.Top, $w, $hgt)`)
    if (!r.ok) return { error: r.err || 'screenshot failed' }
    // Where the window sits and how big it is, so a click named in the
    // picture's pixels can be put back on the screen (toScreen in the agent).
    const n = String(r.out || '').trim().split(/\r?\n/).pop().split(',').map(Number)
    return n.length === 4 && n.every(Number.isFinite) ? { path, origin: [n[0], n[1]], size: [n[2], n[3]] } : { path }
  }
  if (MAC) {
    // -o drops the window shadow, -l targets ONE window by id rather than the
    // desktop. -x is silent (no shutter sound). All of it needs the Screen
    // Recording grant, which the person gives once in System Settings and we
    // cannot script.
    // THE FRONT WINDOW'S RECTANGLE, the same thing the Windows side captures.
    //
    // This used to need the window's numeric id for `screencapture -l`, found
    // by asking AXIdentifier (not a window id in most apps) and then Python's
    // Quartz module (not on a stock Mac — python3 there is a stub asking to
    // install developer tools). On London's MacBook every look failed with
    // "could not find the window in front" (2026-10-14). The window's position
    // and size come from System Events, which needs only the Accessibility
    // grant the agent already asks for, and `screencapture -R` takes exactly
    // that rectangle: still one program's window, never the whole screen.
    //
    // And when Accessibility is not on yet, CoreGraphics still knows where the
    // front program's windows are: no grant is needed for a window's bounds.
    const rect = (await frontWindowRectMac()) || (await frontWindowRectCG())
    if (!rect) return { error: 'could not find the window in front, so nothing was captured — is Accessibility allowed for Terminal?' }
    const r = await run('screencapture', ['-x', '-R', rect.join(','), '-t', 'png', path])
    if (!r.ok) return { error: r.err || 'screenshot failed — is Screen Recording allowed for this app?' }
    try { if (!(statSync(path).size > 0)) throw new Error('empty') } catch {
      return { error: 'screenshot produced nothing — Screen Recording is probably not allowed yet' }
    }
    // A Retina screen captures at twice the points, and the model then sees a
    // picture that is shrunk again before it reads it — so a position it
    // names would not be a position on the screen. Fit the picture to a known
    // size with sips (on every Mac), and say where the window sits, so a click
    // can be put back on the screen exactly (see toScreen in the agent).
    const [w, h] = fitShot(rect[2], rect[3])
    await run('sips', ['-z', String(h), String(w), path])
    return { path, origin: [rect[0], rect[1]], size: [rect[2], rect[3]] }
  }
  return { error: `no screenshot on ${process.platform}` }
}

/** [x, y, w, h] of the front window of the front app, in screen points — or null. */
async function frontWindowRectMac() {
  const r = await osa(
    'tell application "System Events" to tell (first application process whose frontmost is true) ' +
    'to get {position, size} of front window',
  )
  if (!r.ok) return null
  const n = String(r.out).split(',').map((s) => Math.round(Number(s.trim())))
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null
  return n
}

/**
 * The same rectangle from CoreGraphics, through JXA (osascript -l JavaScript,
 * on every Mac). This used to be python3's Quartz module, which a stock Mac
 * does not have. The window list is front-to-back, so the first ordinary
 * (layer 0) window owned by the front app's process is the one in front.
 */
export const CG_FRONT_RECT_JXA =
  "ObjC.import('AppKit'); ObjC.import('CoreGraphics');" +
  ' var pid = $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;' +
  // 1 = kCGWindowListOptionOnScreenOnly, 16 = ExcludeDesktopElements, 0 = kCGNullWindowID
  ' var list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(17, 0))) || [];' +
  ' var w = list.filter(function (x) { return x.kCGWindowOwnerPID === pid && x.kCGWindowLayer === 0 && x.kCGWindowBounds && x.kCGWindowBounds.Width > 50 })[0];' +
  " w ? [w.kCGWindowBounds.X, w.kCGWindowBounds.Y, w.kCGWindowBounds.Width, w.kCGWindowBounds.Height].join(',') : ''"
async function frontWindowRectCG() {
  const r = await run('osascript', ['-l', 'JavaScript', '-e', CG_FRONT_RECT_JXA])
  if (!r.ok) return null
  const n = String(r.out || '').trim().split(',').map((s) => Math.round(Number(s)))
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null
  return n
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
  // An empty type used to "succeed" — which hid, for weeks, that the text
  // never reached the agent at all (2026-10-15). Nothing to type is a failure.
  if (!s) return { error: 'there was no text to type' }
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

// Go to the browser's address bar. Typing an address with nothing focused
// sends the letters into the PAGE — on Bryce's Gmail (2026-10-15) that is
// where "mail.google.com" went, and Gmail's one-letter shortcuts are e, c, a.
const ADDRESS_BAR = new Set(['ctrl+l', 'cmd+l', 'address_bar', 'addressbar'])

export async function pressKey(name) {
  const k = String(name || '').toLowerCase().replace(/\s+/g, '')
  if (ADDRESS_BAR.has(k)) {
    if (WIN) {
      const r = await ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^l')")
      return r.ok ? {} : { error: r.err || 'key failed' }
    }
    if (MAC) {
      const r = await osa('tell application "System Events" to keystroke "l" using command down')
      return r.ok ? {} : { error: macHint(r.err) }
    }
    return { error: `no keyboard on ${process.platform}` }
  }
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
 * Open a program, and wait until it is actually in front.
 *
 * Every other hand here refuses to act unless the named program is frontmost.
 * Launching is the one action that is BY DEFINITION about something that is
 * not — so without it Arnie could only ever work in what somebody had already
 * opened for him, which is most of the way back to having no hands.
 *
 * NO SHELL, and no path. The name is matched against what is INSTALLED and
 * the match is what gets started, so "chrome" opens Chrome and a name that is
 * really a command line opens nothing. The moment Arnie is reading a web page,
 * the name of a program to open is attacker-influenced text.
 */
const LAUNCHABLE = {
  // name as a person says it → [Windows command, macOS application name]
  chrome: ['chrome', 'Google Chrome'],
  edge: ['msedge', 'Microsoft Edge'],
  firefox: ['firefox', 'Firefox'],
  safari: [null, 'Safari'],
  notepad: ['notepad', 'TextEdit'],
  excel: ['excel', 'Microsoft Excel'],
  word: ['winword', 'Microsoft Word'],
  outlook: ['outlook', 'Microsoft Outlook'],
  explorer: ['explorer', 'Finder'],
  finder: [null, 'Finder'],
  calculator: ['calc', 'Calculator'],
  // The Mac's own programs. London allowed Messages and Calendar and asked
  // for his texts; none of these was on this list, so they could not be
  // brought forward and every look was refused (2026-10-14).
  messages: [null, 'Messages'],
  calendar: [null, 'Calendar'],
  mail: [null, 'Mail'],
  notes: [null, 'Notes'],
  reminders: [null, 'Reminders'],
  contacts: [null, 'Contacts'],
  facetime: [null, 'FaceTime'],
  photos: [null, 'Photos'],
  maps: [null, 'Maps'],
  preview: [null, 'Preview'],
  pages: [null, 'Pages'],
  numbers: [null, 'Numbers'],
  keynote: [null, 'Keynote'],
  google: ['chrome', 'Google Chrome'],
}

// ── a real browser window, not an app window ────────────────────────────
// An installed web app — the JobScout app itself — is a window of chrome.exe
// with NO address bar. To "is chrome in front?" it answers yes. On Bryce's PC
// (2026-10-16) Jenny pressed ctrl+l, typed his business Gmail address and
// Enter straight into the JobScout window he had just typed his request in.
// A browser window's title ends with the browser's own name; an app window's
// does not. Windows only: on a Mac an installed web app is its own program.
const BROWSER_WINDOW = {
  chrome: { exe: 'chrome', title: /-\s*Google Chrome$/i },
  google: { exe: 'chrome', title: /-\s*Google Chrome$/i },
  edge: { exe: 'msedge', title: /Microsoft[\s​]*Edge$/i },
  firefox: { exe: 'firefox', title: /Mozilla Firefox$/i },
}
export const browserKind = (app) => BROWSER_WINDOW[String(app || '').toLowerCase()] || null
export const isBrowserWindowTitle = (app, title) => !!browserKind(app)?.title.test(String(title || '').trim())

/** The title of the window in front (Windows), or null if it cannot be read. */
export async function frontWindowTitle() {
  if (!WIN) return null
  const r = await ps(`
    Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class JsTitle {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static string Get() { var s = new StringBuilder(512); GetWindowText(GetForegroundWindow(), s, 512); return s.ToString(); }
}
"@
    [JsTitle]::Get()`)
  return r.ok ? String(r.out || '').trim() : null
}

/**
 * Put a real browser window in front — the first one of this browser whose
 * title says it is a browser — or open a new one if there is none.
 */
export async function focusBrowserWindow(app) {
  const kind = browserKind(app)
  if (!WIN || !kind) return { error: 'not a browser this can find windows of' }
  const r = await ps(`
    Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class JsWins {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  public static List<string> All() {
    var list = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      var s = new StringBuilder(512); GetWindowText(h, s, 512);
      int pid; GetWindowThreadProcessId(h, out pid);
      if (s.Length > 0) list.Add(pid + "|" + s.ToString());
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@
    $names = @{}; Get-Process -Name '${kind.exe}' -ErrorAction SilentlyContinue | ForEach-Object { $names[$_.Id] = 1 }
    [JsWins]::All() | ForEach-Object { $p = $_.Split('|', 2); if ($names.ContainsKey([int]$p[0])) { $p[1] } }`)
  const titles = String(r.out || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const target = titles.find((t) => kind.title.test(t))
  if (target) {
    // AppActivate by exact title: Windows lets it take the foreground where a
    // bare SetForegroundWindow from a background process is refused.
    const esc = target.replace(/'/g, "''")
    await ps(`$w = New-Object -ComObject WScript.Shell; [void]$w.AppActivate('${esc}')`)
  } else {
    await run('cmd.exe', ['/c', 'start', '', kind.exe, '--new-window'])
  }
  for (let i = 0; i < 16; i++) {
    await new Promise((res) => setTimeout(res, 250))
    const now = await frontWindowTitle()
    if (isBrowserWindowTitle(app, now)) return { ok: true, title: now, opened: !target }
  }
  return { error: 'could not bring a browser window to the front' }
}

/** Bring the window with this exact title back to the front (Windows). */
export async function activateTitle(title) {
  if (!WIN || !title) return
  const esc = String(title).replace(/'/g, "''")
  await ps(`$w = New-Object -ComObject WScript.Shell; [void]$w.AppActivate('${esc}')`)
}

/**
 * Bring forward the Chrome that was started with this profile folder — the
 * assistant's own browser. Its main process is the one whose command line
 * names the folder and is not a --type= helper.
 */
export async function activateProfile(profileDir) {
  if (!WIN || !profileDir) return
  const esc = String(profileDir).replace(/'/g, "''")
  await ps(`$p = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -like ('*' + '${esc}' + '*') -and $_.CommandLine -notlike '*--type=*' } | Select-Object -First 1
    if ($p) { $w = New-Object -ComObject WScript.Shell; [void]$w.AppActivate([int]$p.ProcessId) }`)
}

export async function launchApp(name) {
  const key = String(name || '').toLowerCase().trim()
  const known = LAUNCHABLE[key]
  if (!known) {
    return { error: `I do not know how to open "${key}". Open it yourself and I will carry on from there.` }
  }
  if (WIN) {
    if (!known[0]) return { error: `${key} is a Mac program.` }
    // start through cmd's own builtin, with the name as an ARGUMENT — never
    // pasted into a command string.
    const r = await run('cmd.exe', ['/c', 'start', '', known[0]])
    if (!r.ok) return { error: r.err || `could not open ${key}` }
  } else if (MAC) {
    const r = await run('open', ['-a', known[1]])
    if (!r.ok) return { error: r.err || `could not open ${key}` }
  } else {
    return { error: `cannot open programs on ${process.platform}` }
  }
  // Opening is not instant, and the next action will be refused unless this
  // one really did put it in front. Wait for the thing we were asked for.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250))
    const front = await frontmostApp()
    if (front && (front.includes(key) || key.includes(front)
      || front.includes(String(known[0] || '').toLowerCase())
      || String(known[1] || '').toLowerCase().includes(front))) {
      return { ok: true, result: { opened: key, frontmost: front } }
    }
  }
  return { error: `${key} was asked to open but is still not in front.` }
}

/**
 * Which of the Mac's switches are on, checked at startup and reported.
 *
 * On London's MacBook (2026-10-14) every failure was learned by watching him
 * try: the look refused, then "no window", with nobody able to say which
 * switch in System Settings was the problem. The agent now asks macOS itself
 * and says — on the Computer page and to the assistant — before anyone tries.
 *
 * true / false when macOS answers; null when it cannot be told from here
 * (an older macOS, a bridge that is missing). Never blocks the agent.
 */
export async function checkPermissions() {
  if (!MAC) return {}
  const jxa = (src) => run('osascript', ['-l', 'JavaScript', '-e', src])
  const yesNo = (r) => (r.ok ? (/true/i.test(r.out) ? true : /false/i.test(r.out) ? false : null) : null)
  // Accessibility: AXIsProcessTrusted, else whether System Events will answer.
  let accessibility = yesNo(await jxa("ObjC.import('ApplicationServices'); typeof $.AXIsProcessTrusted === 'function' ? String($.AXIsProcessTrusted()) : 'unknown'"))
  if (accessibility === null) {
    const r = await osa('tell application "System Events" to get name of first application process whose frontmost is true')
    accessibility = r.ok ? true : /assistive|not allowed|1002|-1719|-25211/i.test(r.err || '') ? false : null
  }
  // Screen Recording ("Screen & System Audio Recording" on newer macOS).
  const screen = yesNo(await jxa("ObjC.import('CoreGraphics'); typeof $.CGPreflightScreenCaptureAccess === 'function' ? String($.CGPreflightScreenCaptureAccess()) : 'unknown'"))
  return { screen, accessibility }
}

/** What to tell a person about the switches that are off — [] when all is well. */
export function permissionNotes(p = {}) {
  const out = []
  if (p.screen === false) out.push('Screen Recording is OFF for Terminal, so nothing can be seen. System Settings → Privacy & Security → Screen & System Audio Recording → turn on Terminal, then quit Terminal and run the agent again.')
  if (p.accessibility === false) out.push('Accessibility is OFF for Terminal, so nothing can be clicked or typed — and the program in front cannot even be named. System Settings → Privacy & Security → Accessibility → turn on Terminal.')
  return out
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
  record: WIN || MAC,
  notes: WIN
    ? []
    : MAC
      ? ['macOS will ask you to allow Screen Recording, Accessibility and Input Monitoring in System Settings. None of those can be granted from here — they are switches you flip yourself.',
         'Without them Arnie cannot see or touch anything, and a recording would come back empty. He checks, and says so rather than recording nothing.']
      : [`This agent does not run on ${process.platform} yet.`],
}
