import { describe, it, expect } from 'vitest'
import { updateDecision, AWAY_MS } from './appUpdate'
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
  it('offers a banner to someone mid-session instead of pulling the page out from under them', () => {
    expect(updateDecision({ running: 'a1', served: 'b2', hiddenForMs: 0 })).toBe('banner')
    expect(updateDecision({ running: 'a1', served: 'b2', hiddenForMs: AWAY_MS - 1 })).toBe('banner')
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
    expect(updateDecision({ running: 'old', served: 'new', hiddenForMs: 0, firstCheck: false })).toBe('banner')
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
    expect(updateDecision({ running: 'a', served: 'b', hiddenForMs: 0, idleMs: IDLE_MS - 1 })).toBe('banner')
    expect(updateDecision({ running: 'a', served: 'b', hiddenForMs: 0, idleMs: IDLE_MS, held: true })).toBe('banner')
  })
  it('the Arnie chat holds updates during a takeoff, a reply, speech, the mic or a draft', async () => {
    const { readFileSync } = await import('node:fs')
    const chat = readFileSync(new URL('../pages/agents/arnie/ArnieChat.jsx', import.meta.url), 'utf8')
    expect(chat).toMatch(/const busyForUpdate = takeoff \|\| loading \|\| speaking \|\| listening \|\| !!input\.trim\(\)/)
    expect(chat).toMatch(/busyForUpdate \? holdAppUpdate\('Arnie chat in use'\)/)
  })
})
