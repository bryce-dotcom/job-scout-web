import { describe, it, expect } from 'vitest'
import { updateDecision, AWAY_MS, STALE_MS } from './appUpdate'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('what an open app does when the server has a newer build', () => {
  it('does nothing while the builds agree, or when the server could not be read', () => {
    expect(updateDecision({ running: 'a1', served: 'a1' })).toBe('none')
    expect(updateDecision({ running: 'a1', served: null })).toBe('none')
    expect(updateDecision({ running: 'a1', served: undefined })).toBe('none')
    expect(updateDecision({ running: '', served: 'b2' })).toBe('none')
  })
  it('reloads someone who has just come back after being away — nothing half-typed to lose', () => {
    expect(updateDecision({ running: 'a1', served: 'b2', hiddenForMs: AWAY_MS })).toBe('reload')
    expect(updateDecision({ running: 'a1', served: 'b2', hiddenForMs: AWAY_MS * 10 })).toBe('reload')
  })
  it('says NOTHING to someone mid-session — the update waits for a door', () => {
    // This used to banner, and that is the complaint: we ship ~40 times on a
    // busy day, so a rep working through the afternoon met the bar ~40 times
    // and lost their place to every one of them. Being minutes behind costs
    // nobody anything; the next navigation picks it up silently.
    expect(updateDecision({ running: 'a1', served: 'b2', hiddenForMs: 0 })).toBe('defer')
    expect(updateDecision({ running: 'a1', served: 'b2', hiddenForMs: AWAY_MS - 1 })).toBe('defer')
  })
  it('but asks once someone has been behind for most of an hour', () => {
    // Somebody parked on one screen never hits a navigation, so the deferral
    // has to end somewhere.
    expect(updateDecision({ running: 'a1', served: 'b2', pendingForMs: STALE_MS })).toBe('banner')
    expect(updateDecision({ running: 'a1', served: 'b2', pendingForMs: STALE_MS - 1 })).toBe('defer')
  })
  it('never reload-loops when the served stamp and the bundle keep disagreeing', () => {
    expect(updateDecision({ running: 'a1', served: 'b2', hiddenForMs: AWAY_MS, reloadedFor: 'b2' })).toBe('banner')
    expect(updateDecision({ running: 'a1', served: 'c3', hiddenForMs: AWAY_MS, reloadedFor: 'b2' })).toBe('reload')
  })
})

describe('holding the reload for unsaved work', () => {
  it('a held page gets the banner even after a long absence', async () => {
    const { updateDecision } = await import('./appUpdate')
    expect(updateDecision({ running: 'a', served: 'b', hiddenForMs: 10 * 60 * 1000, held: true })).toBe('banner')
    expect(updateDecision({ running: 'a', served: 'b', hiddenForMs: 10 * 60 * 1000, held: false })).toBe('reload')
    expect(updateDecision({ running: 'a', served: 'a', held: true })).toBe('none')
  })
  it('holds release independently', async () => {
    const { holdAppUpdate, appUpdateHeld } = await import('./appUpdate')
    const a = holdAppUpdate('chris'); const b = holdAppUpdate('other')
    expect(appUpdateHeld()).toBe(true)
    a(); expect(appUpdateHeld()).toBe(true)
    b(); expect(appUpdateHeld()).toBe(false)
    a(); expect(appUpdateHeld()).toBe(false)
  })
})

describe('a stale cold start fixes itself', () => {
  // THE DAY THIS COST
  //
  // The worker only looks for a new sw.js on a page LOAD, and serves its
  // precached index.html while it does. So the first load after a deploy is
  // the old app and the second is the new one — every time.
  //
  // That made a deployed fix look unfixed, made "hit Refresh" prove nothing,
  // and got a good change reverted on the strength of it. Four seconds after
  // a cold start there is no half-typed form to protect, so the banner was
  // guarding work that did not exist.
  it('the first check after startup reloads rather than asking', async () => {
    const { updateDecision } = await import('./appUpdate')
    expect(updateDecision({ running: 'old', served: 'new', hiddenForMs: 0, firstCheck: true })).toBe('reload')
    // the same situation later in the session still asks
    expect(updateDecision({ running: 'old', served: 'new', hiddenForMs: 0, firstCheck: false })).toBe('defer')
  })

  it('but never over unsaved work, even on a cold start', async () => {
    const { updateDecision } = await import('./appUpdate')
    expect(updateDecision({ running: 'old', served: 'new', firstCheck: true, held: true })).toBe('banner')
  })

  it('and never twice for the same build — a CDN mid-deploy must not loop', async () => {
    const { updateDecision } = await import('./appUpdate')
    expect(updateDecision({ running: 'old', served: 'new', firstCheck: true, reloadedFor: 'new' })).toBe('banner')
  })

  it('an up-to-date cold start does nothing at all', async () => {
    const { updateDecision } = await import('./appUpdate')
    expect(updateDecision({ running: 'same', served: 'same', firstCheck: true })).toBe('none')
    expect(updateDecision({ running: 'same', served: null, firstCheck: true })).toBe('none')
  })

  it('the installer marks only the startup check as first', async () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'appUpdate.js'), 'utf8')
    expect(src).toMatch(/setTimeout\(\(\) => check\(0, true\), 4000\)/)
    // visibility, online and the poll are all ordinary checks
    expect(src).toMatch(/const onOnline = \(\) => check\(0\)/)
    expect(src).toMatch(/setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) check\(0\) \}/)
  })
})

describe('an app left open and untouched updates itself', () => {
  it('ten minutes with no tap, still visible, reloads — unless something holds it', async () => {
    const { updateDecision, IDLE_MS } = await import('./appUpdate')
    expect(updateDecision({ running: 'a', served: 'b', hiddenForMs: 0, idleMs: IDLE_MS })).toBe('reload')
    expect(updateDecision({ running: 'a', served: 'b', hiddenForMs: 0, idleMs: IDLE_MS - 1 })).toBe('defer')
    expect(updateDecision({ running: 'a', served: 'b', hiddenForMs: 0, idleMs: IDLE_MS, held: true })).toBe('banner')
  })
  it('the Arnie chat holds updates during a takeoff, a reply, speech, the mic or a draft', async () => {
    const { readFileSync } = await import('node:fs')
    const chat = readFileSync(new URL('../pages/agents/arnie/ArnieChat.jsx', import.meta.url), 'utf8')
    expect(chat).toMatch(/const busyForUpdate = takeoff \|\| loading \|\| speaking \|\| listening \|\| !!input\.trim\(\)/)
    expect(chat).toMatch(/busyForUpdate \? holdAppUpdate\('Arnie chat in use'\)/)
  })
})

describe('one press applies every commit since', () => {
  const read = (p) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), p), 'utf8')

  it('the banner Refresh goes through applyUpdate, not a plain reload', () => {
    // THE BUG. There is no queue to work through — a load fetches whatever is
    // served now, so ten pushes are caught up by one refresh. But the banner's
    // button called window.location.reload(), which the service worker is
    // entitled to answer out of its own precache, so the page came back
    // identical and people pressed it again. And again.
    const src = read('./appUpdate.js')
    const onclick = src.slice(src.indexOf('btn.onclick'), src.indexOf('btn.onclick') + 320)
    expect(onclick).toMatch(/applyUpdate\(\)/)
    expect(onclick).not.toMatch(/location\.reload\(\)/)
  })

  it('applyUpdate drops the worker and the caches BEFORE reloading', () => {
    const src = read('./appUpdate.js')
    const fn = src.slice(src.indexOf('export async function applyUpdate'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/unregister\(\)/)
    expect(body).toMatch(/caches\.delete/)
    // The reload is in a finally, so a failure above still ends in a reload
    // rather than a button that does nothing at all.
    expect(body).toMatch(/finally[\s\S]*location\.replace/)
    expect(body.indexOf('unregister()')).toBeLessThan(body.indexOf('location.replace'))
  })

  it('BuildTag no longer keeps its own copy of the dance', () => {
    // These two drifted, and the weaker copy was the one in front of everyone.
    const src = read('../components/BuildTag.jsx')
    expect(src).toMatch(/import \{ applyUpdate \}/)
    expect(src).not.toMatch(/caches\.delete/)
    expect(src).not.toMatch(/getRegistrations\(\)/)
  })

  it('the banner offers a way to say not now', () => {
    const src = read('./appUpdate.js')
    expect(src).toMatch(/later\.textContent = 'Later'/)
    expect(src).toMatch(/later\.onclick[\s\S]{0,60}snooze\(SNOOZE_MS\)/)
  })

  it('a pending update lands on navigation, unless work is held', () => {
    const src = read('./appUpdate.js')
    const nav = src.slice(src.indexOf('const onNavigate'), src.indexOf('const onNavigate') + 700)
    expect(nav).toMatch(/appUpdateHeld\(\)/)
    expect(nav).toMatch(/reloadFor\(pending\)/)
    // and when reloadFor refuses, the person is given the button that works
    // rather than left on a stale build with nothing said.
    expect(nav).toMatch(/showBanner\(pending\)/)
    // React Router moves with pushState, which fires no event of its own.
    expect(src).toMatch(/wrap\('pushState'\)/)
    expect(src).toMatch(/addEventListener\('popstate', onNavigate\)/)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// ONE APP OPEN, ONE RELOAD
//
// London, 26 Oct 2026, eight minutes after the last of nine deploys between
// 07:26 and 08:46: "I click on the three lines to open up the side menu to get
// to Field Scout, I have to repeat that process about four times before I can
// get into field Scout or honestly anything — the tab kind of just reload
// itself multiple times."
//
// Three paths could reload the shell. Measured under her timing, two of them
// cannot do this: vite:preloadError reloads once and then gives up, and the
// controllerchange listener never fired at all (sw_reloaded_at was unset
// throughout the live reproduction). The third did it. The navigation door
// called reloadFor(pending) DIRECTLY, so it never met the once-per-build stamp
// that updateDecision had honoured all along — and `pending` stays set,
// because the worker answers each reload out of its own precache and the page
// comes back on the same build with the server still ahead. So every tap
// reloaded, and the menu never held.
//
// These tests drive the REAL installer, so they fail against the old code
// rather than describing it. A source-text assertion could not have caught
// this: the old line looked right.
describe('one app open produces at most one reload', () => {
  const RUNNING = 'oldbuild01'

  /**
   * The smallest tab the installer will run in. Deliberately not jsdom — this
   * suite has no DOM environment, and the installer only ever touches these.
   */
  function makeTab({ served }) {
    const winL = new Map(), docL = new Map(), store = new Map()
    let banner = null
    const reloads = []
    const add = (m) => (t, f) => { if (!m.has(t)) m.set(t, []); m.get(t).push(f) }
    const del = (m) => (t, f) => { const a = m.get(t) || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1) }
    const win = {
      addEventListener: add(winL), removeEventListener: del(winL),
      dispatchEvent: (e) => { (winL.get(e.type) || []).slice().forEach((f) => f(e)) },
      location: { pathname: '/dashboard', reload: () => reloads.push('reload'), replace: () => reloads.push('replace') },
    }
    const doc = {
      visibilityState: 'visible',
      addEventListener: add(docL), removeEventListener: del(docL),
      // showBanner early-returns when one is already up; model that or the
      // count of banners is meaningless.
      getElementById: (id) => (id === 'app-update-banner' ? banner : null),
      createElement: () => ({ style: {}, setAttribute() {}, append() {}, appendChild() {} }),
      body: { appendChild: (el) => { banner = el } },
    }
    const prev = {
      window: globalThis.window, document: globalThis.document, history: globalThis.history,
      sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch, Event: globalThis.Event,
      navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    }
    globalThis.window = win
    globalThis.document = doc
    globalThis.history = { pushState() {}, replaceState() {} }
    globalThis.Event = class { constructor(type) { this.type = type } }
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    }
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true })
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ build: served() }) })
    const restore = () => {
      globalThis.window = prev.window; globalThis.document = prev.document
      globalThis.history = prev.history; globalThis.sessionStorage = prev.sessionStorage
      globalThis.fetch = prev.fetch; globalThis.Event = prev.Event
      if (prev.navigator) Object.defineProperty(globalThis, 'navigator', prev.navigator)
    }
    return { win, store, reloads, restore, bannerUp: () => !!banner }
  }

  // The installer's check() awaits a fetch, so let the microtasks drain.
  const settle = () => new Promise((r) => setTimeout(r, 25))

  it('four taps on the menu during a deploy burst reload ONCE, not four times', async () => {
    const { installAppUpdateCheck } = await import('./appUpdate')
    const served = 'newbuild99'
    const tab = makeTab({ served: () => served })
    try {
      const stop = installAppUpdateCheck({ running: RUNNING })
      // The server moved ahead while she was opening the app.
      tab.win.dispatchEvent(new globalThis.Event('online'))
      await settle()
      // She taps the hamburger and picks Field Scout. Four times, as reported.
      // The worker keeps serving the precached bundle, so `running` never
      // advances and the server stays ahead the whole way through.
      for (let i = 0; i < 4; i++) {
        tab.win.dispatchEvent(new globalThis.Event('app:navigated'))
        await settle()
      }
      expect(tab.reloads.length).toBe(1)
      // and she is not left stranded on the old build in silence
      expect(tab.bannerUp()).toBe(true)
      stop()
    } finally { tab.restore() }
  })

  it('the stamp is what stops it — the second tap is refused for the SAME build', async () => {
    const { installAppUpdateCheck } = await import('./appUpdate')
    const tab = makeTab({ served: () => 'newbuild99' })
    try {
      const stop = installAppUpdateCheck({ running: RUNNING })
      tab.win.dispatchEvent(new globalThis.Event('online'))
      await settle()
      tab.win.dispatchEvent(new globalThis.Event('app:navigated'))
      await settle()
      expect(tab.store.get('app_reloaded_for_build')).toBe('newbuild99')
      const after = tab.reloads.length
      tab.win.dispatchEvent(new globalThis.Event('app:navigated'))
      await settle()
      expect(tab.reloads.length).toBe(after)
      stop()
    } finally { tab.restore() }
  })

  it('but a genuinely NEWER build still lands — this is a per-build guard, not a latch', async () => {
    // The thing that must not break while fixing the loop: we ship all day,
    // and the next deploy has to reach her.
    const { installAppUpdateCheck } = await import('./appUpdate')
    let served = 'build-A'
    const tab = makeTab({ served: () => served })
    try {
      const stop = installAppUpdateCheck({ running: RUNNING })
      tab.win.dispatchEvent(new globalThis.Event('online'))
      await settle()
      tab.win.dispatchEvent(new globalThis.Event('app:navigated'))
      await settle()
      expect(tab.reloads.length).toBe(1)
      // a second tap for build-A is refused …
      tab.win.dispatchEvent(new globalThis.Event('app:navigated'))
      await settle()
      expect(tab.reloads.length).toBe(1)
      // … and then a new commit ships.
      served = 'build-B'
      tab.win.dispatchEvent(new globalThis.Event('online'))
      await settle()
      tab.win.dispatchEvent(new globalThis.Event('app:navigated'))
      await settle()
      expect(tab.reloads.length).toBe(2)
      expect(tab.store.get('app_reloaded_for_build')).toBe('build-B')
      stop()
    } finally { tab.restore() }
  })

  it('an up-to-date app never reloads on navigation at all', async () => {
    const { installAppUpdateCheck } = await import('./appUpdate')
    const tab = makeTab({ served: () => RUNNING })
    try {
      const stop = installAppUpdateCheck({ running: RUNNING })
      tab.win.dispatchEvent(new globalThis.Event('online'))
      await settle()
      for (let i = 0; i < 3; i++) {
        tab.win.dispatchEvent(new globalThis.Event('app:navigated'))
        await settle()
      }
      expect(tab.reloads.length).toBe(0)
      expect(tab.bannerUp()).toBe(false)
      stop()
    } finally { tab.restore() }
  })
})

describe('a new worker taking control reloads on the BUILD, not on a 30-second clock', () => {
  // The old rule in main.jsx was `Date.now() - last > 30000`, which permits
  // every reload spaced further apart than that. Nine deploys in eighty
  // minutes is nine chances; the throttle only ever stopped a tight loop.
  it('refuses a second reload while the page is still running the same build', async () => {
    const { swReloadDecision } = await import('./appUpdate')
    expect(swReloadDecision({ running: 'b1', reloadedFrom: null })).toBe('reload')
    // came back still on b1 — the reload did not land, so doing it again cannot help
    expect(swReloadDecision({ running: 'b1', reloadedFrom: 'b1' })).toBe('banner')
  })

  it('re-arms once a reload actually changed the build', async () => {
    const { swReloadDecision } = await import('./appUpdate')
    expect(swReloadDecision({ running: 'b2', reloadedFrom: 'b1' })).toBe('reload')
  })

  it('still holds the banner for unsaved work', async () => {
    const { swReloadDecision } = await import('./appUpdate')
    expect(swReloadDecision({ running: 'b1', reloadedFrom: null, held: true })).toBe('banner')
  })

  it('an unstamped build gets one reload per tab, not one every 30 seconds', async () => {
    const { swReloadDecision } = await import('./appUpdate')
    expect(swReloadDecision({ running: '', reloadedFrom: null })).toBe('reload')
    expect(swReloadDecision({ running: '', reloadedFrom: 'unknown' })).toBe('banner')
  })

  it('main.jsx carries no time-based throttle any more', async () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../main.jsx'), 'utf8')
    expect(src).toMatch(/swTookControl\(\{ running: import\.meta\.env\.VITE_APP_BUILD \}\)/)
    expect(src).not.toMatch(/sw_reloaded_at/)
    expect(src).not.toMatch(/30000/)
  })
})
