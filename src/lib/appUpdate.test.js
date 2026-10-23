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
    const nav = src.slice(src.indexOf('const onNavigate'), src.indexOf('const onNavigate') + 220)
    expect(nav).toMatch(/appUpdateHeld\(\)/)
    expect(nav).toMatch(/reloadFor\(pending\)/)
    // React Router moves with pushState, which fires no event of its own.
    expect(src).toMatch(/wrap\('pushState'\)/)
    expect(src).toMatch(/addEventListener\('popstate', onNavigate\)/)
  })
})
