#!/usr/bin/env osascript -l JavaScript
// The recorder, macOS. Same job and same output as recorder.ps1 — one event
// per line of NDJSON — so the agent does not care which one it started.
//
// WHY JXA AND NOT A COMPILED HELPER. Watching a whole screen needs a global
// event monitor, and the only ways to get one are a compiled binary or the
// ObjC bridge. A compiled helper means shipping a signed binary before anyone
// can be taught anything, which puts the whole feature behind a certificate
// purchase. osascript -l JavaScript is on every Mac, needs no compiler and no
// install, and reaches NSEvent through the same bridge. The grants it needs —
// Accessibility, and Input Monitoring for keys — are the same ones a compiled
// helper would need anyway.
//
// WHAT IT NEVER EMITS: the characters somebody typed. It counts them and
// reports a count, exactly as the Windows recorder does. A demonstration runs
// through real screens with real customers on them.
//
// CONTROL IS A FILE, for the same reason it is on Windows: stdin blocks, and a
// recorder that waits on stdin stops watching the screen.
//
// console.log in JXA writes to STDERR. Everything meant for the agent goes
// through NSFileHandle's standard output by hand, or the agent sees nothing
// and the recording looks empty.

ObjC.import('Cocoa')
ObjC.import('ApplicationServices')

// Written out rather than read off the bridge. NSEventMask* and NSEventType*
// are enums from the framework headers, and an enum the bridge does not
// surface comes back `undefined` — which would make the mask NaN and the
// recorder watch nothing at all, silently, with no error anywhere. These
// values are fixed API.
var MASK_LEFT_DOWN = 1 << 1          // NSEventMaskLeftMouseDown
var MASK_RIGHT_DOWN = 1 << 3         // NSEventMaskRightMouseDown
var MASK_KEY_DOWN = 1 << 10          // NSEventMaskKeyDown
var MASK_SCROLL = 1 << 22            // NSEventMaskScrollWheel

var TYPE_LEFT_DOWN = 1               // NSEventTypeLeftMouseDown
var TYPE_RIGHT_DOWN = 3              // NSEventTypeRightMouseDown
var TYPE_KEY_DOWN = 10               // NSEventTypeKeyDown
var TYPE_SCROLL = 22                 // NSEventTypeScrollWheel

var KEY_RETURN = 36
var KEY_TAB = 48
var KEY_ESCAPE = 53

function main(argv) {
  // stdout first: everything below reports through it, including the failure
  // to get a control file.
  var out = $.NSFileHandle.fileHandleWithStandardOutput
  function say(line) {
    var data = $(line + '\n').dataUsingEncoding($.NSUTF8StringEncoding)
    try { out.writeData(data) } catch (e) { /* the agent went away */ }
  }

  var controlFile = argv[0]
  if (!controlFile) {
    say(JSON.stringify({ seq: 0, at: new Date().toISOString(), kind: 'error', message: 'no control file given' }))
    return
  }

  var seq = 0
  var paused = false
  var typed = 0
  var lastClickAt = 0
  var lastApp = ''

  // Screen height, to flip NSEvent's bottom-left origin into the top-left
  // coordinates the screenshots and the clicker both use. Getting this wrong
  // puts every taught step at the wrong end of the screen.
  var screenHeight = $.NSScreen.mainScreen.frame.size.height

  function frontApp() {
    try {
      var app = $.NSWorkspace.sharedWorkspace.frontmostApplication
      return app ? ObjC.unwrap(app.localizedName) || '' : ''
    } catch (e) { return '' }
  }

  function emit(kind, extra) {
    seq++
    var o = {
      seq: seq,
      at: new Date().toISOString(),
      kind: kind,
      app: frontApp().toLowerCase(),
      // The window title needs the Accessibility API per event, which costs
      // more than it is worth here. The app name plus the screenshot carry
      // the meaning; Arnie reads the title off the picture.
      window_title: '',
    }
    if (extra) for (var k in extra) o[k] = extra[k]
    say(JSON.stringify(o))
  }

  // A run of typing becomes ONE observation when it ends, so the count belongs
  // to the field it was typed into. Flushed at every boundary.
  function flushTyping() {
    if (typed > 0) { emit('type', { text_length: typed }); typed = 0 }
  }

  function readControl() {
    try {
      var s = $.NSString.stringWithContentsOfFileEncodingError(
        controlFile, $.NSUTF8StringEncoding, null)
      return s ? ObjC.unwrap(s).trim() : ''
    } catch (e) { return '' }
  }

  // Global monitors see events destined for OTHER applications, which is the
  // whole point — and is exactly why macOS gates them behind Accessibility
  // and Input Monitoring. If the grants are missing these simply never fire,
  // so the agent's startup notes say what to allow.
  var MASK = MASK_LEFT_DOWN | MASK_RIGHT_DOWN | MASK_KEY_DOWN | MASK_SCROLL

  var handler = function (event) {
    if (paused) return
    try {
      var type = event.type
      if (type === TYPE_LEFT_DOWN || type === TYPE_RIGHT_DOWN) {
        flushTyping()
        // NSEvent.mouseLocation, not event.locationInWindow: a global monitor
        // sees events belonging to OTHER applications' windows, so
        // locationInWindow is relative to a window this process does not own
        // and means nothing. mouseLocation is screen space.
        //
        // And screen space on macOS has its origin at the BOTTOM left, while
        // the screenshots and the clicker both use the top left. Getting the
        // flip wrong puts every taught step at the wrong end of the screen.
        var p = $.NSEvent.mouseLocation
        var x = Math.round(p.x)
        var y = Math.round(screenHeight - p.y)
        if (type === TYPE_RIGHT_DOWN) {
          emit('right_click', { x: x, y: y })
        } else {
          var now = Date.now()
          var kind = (now - lastClickAt < 400) ? 'double_click' : 'click'
          lastClickAt = now
          emit(kind, { x: x, y: y })
        }
      } else if (type === TYPE_SCROLL) {
        flushTyping()
        emit('scroll', {})
      } else if (type === TYPE_KEY_DOWN) {
        var code = event.keyCode
        // The three keys that END a field, reported by name because they are
        // structural: Tab moves on, Return commits, Escape abandons.
        if (code === KEY_RETURN) { flushTyping(); emit('key', { key_name: 'enter' }) }
        else if (code === KEY_TAB) { flushTyping(); emit('key', { key_name: 'tab' }) }
        else if (code === KEY_ESCAPE) { flushTyping(); emit('key', { key_name: 'escape' }) }
        else { typed++ }
      }
    } catch (e) { /* one bad event must not end the recording */ }
  }

  // THE FAILURE THAT MUST NOT BE SILENT. Without Accessibility (and Input
  // Monitoring for keys) a global monitor is still installed happily and then
  // never fires — no error, no exception, just a recording with nothing in
  // it. That is the same shape as the storage bucket with no policy: work
  // disappearing quietly. So the grant is checked and reported, and the agent
  // turns this into a sentence a person can act on.
  var trusted = true
  try { trusted = $.AXIsProcessTrusted() } catch (e) { trusted = true }
  if (!trusted) {
    emit('error', {
      message: 'macOS has not been told to allow this yet. System Settings → Privacy & Security → '
        + 'Accessibility (and Input Monitoring), allow the app running this agent, then start the '
        + 'recording again. Nothing can be recorded until then.',
    })
    return
  }

  $.NSEvent.addGlobalMonitorForEventsMatchingMaskHandler(MASK, handler)

  emit('started', null)

  // Service the run loop in short slices so the control file is read often
  // enough to feel immediate, without burning a core.
  var runLoop = $.NSRunLoop.currentRunLoop
  while (true) {
    runLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.12))

    var cmd = readControl()
    if (cmd === 'pause') {
      if (!paused) { flushTyping(); emit('paused', null); paused = true }
    } else if (cmd === 'resume') {
      if (paused) { paused = false; emit('resumed', null) }
    } else if (cmd === 'stop') {
      flushTyping(); emit('stopped', null); return
    }

    if (!paused) {
      // The window changing is itself a step — it is how "now go to the other
      // tab" shows up in a recording.
      var app = frontApp().toLowerCase()
      if (app && app !== lastApp) {
        flushTyping()
        if (lastApp !== '') emit('app_change', null)
        lastApp = app
      }
    }
  }
}

function run(argv) { return main(argv) }
