import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  applyNavPrefs, customisableSections, isHidden, loadNavPrefs, moveItem,
  orderedRoutes, PROTECTED_ROUTES, resetNavPrefs, saveNavPrefs, toggleHidden, EMPTY_PREFS,
} from './navPrefs'

const sections = () => ([
  { key: 'OPERATIONS', title: 'WORK / OPERATIONS', items: [
    { to: '/jobs', label: 'Jobs' },
    { to: '/job-board', label: 'Job Board' },
    { to: '/recurring', label: 'Recurring Jobs' },
  ] },
  { key: 'FINANCIAL', title: 'FINANCIAL', items: [
    { to: '/invoices', label: 'Invoices' },
    { to: '/bills', label: 'Bills' },
  ] },
])

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}
beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()))

describe('hiding what you do not use', () => {
  it('drops hidden items and keeps the rest in order', () => {
    const out = applyNavPrefs(sections(), { hidden: ['/recurring', '/bills'], order: {} })
    expect(out[0].items.map(i => i.to)).toEqual(['/jobs', '/job-board'])
    expect(out[1].items.map(i => i.to)).toEqual(['/invoices'])
  })

  it('drops a section once everything in it is hidden', () => {
    // A heading over nothing is worse than no heading.
    const out = applyNavPrefs(sections(), { hidden: ['/invoices', '/bills'], order: {} })
    expect(out.map(s => s.key)).toEqual(['OPERATIONS'])
  })

  it('shows a page added after the preference was saved', () => {
    // `hidden` is an explicit list, so anything the app gains later is visible
    // rather than silently suppressed by an old preference.
    const withNewPage = sections()
    withNewPage[0].items.push({ to: '/brand-new', label: 'Brand New' })
    const out = applyNavPrefs(withNewPage, { hidden: ['/jobs'], order: { OPERATIONS: ['/job-board', '/jobs', '/recurring'] } })
    expect(out[0].items.map(i => i.to)).toContain('/brand-new')
  })

  it('refuses to hide the way home or the way back to settings', () => {
    // Hiding these is how somebody strands themselves with no route back to
    // the screen that would undo it.
    for (const route of PROTECTED_ROUTES) {
      expect(toggleHidden({ hidden: [], order: {} }, route).hidden).toEqual([])
      expect(isHidden({ hidden: [route], order: {} }, route)).toBe(false)
    }
    const withHome = [{ key: 'MAIN', items: [{ to: '/', label: 'Dashboard' }] }]
    expect(applyNavPrefs(withHome, { hidden: ['/'], order: {} })[0].items).toHaveLength(1)
  })
})

describe('the ordering that keeps this from being a permission bug', () => {
  it('can only ever remove from what it was given', () => {
    // applyNavPrefs runs on ALREADY role-filtered sections. A preference
    // naming a route the caller cannot see must not conjure it into the menu —
    // otherwise a saved preference becomes a way to grant yourself Payroll.
    const roleFiltered = [{ key: 'TEAM', items: [{ to: '/my-pay', label: 'My Pay' }] }]
    const out = applyNavPrefs(roleFiltered, {
      hidden: [],
      order: { TEAM: ['/payroll', '/employees', '/my-pay'] },
    })
    expect(out[0].items.map(i => i.to)).toEqual(['/my-pay'])
  })

  it('never invents an item from a stale saved order', () => {
    const out = applyNavPrefs(sections(), { hidden: [], order: { FINANCIAL: ['/books', '/invoices'] } })
    expect(out[1].items.map(i => i.to)).toEqual(['/invoices', '/bills'])
  })
})

describe('reordering', () => {
  it('moves an item up and down', () => {
    const routes = ['/jobs', '/job-board', '/recurring']
    let prefs = moveItem(EMPTY_PREFS, 'OPERATIONS', routes, '/recurring', -1)
    expect(prefs.order.OPERATIONS).toEqual(['/jobs', '/recurring', '/job-board'])
    prefs = moveItem(prefs, 'OPERATIONS', routes, '/recurring', 1)
    expect(prefs.order.OPERATIONS).toEqual(['/jobs', '/job-board', '/recurring'])
  })

  it('does nothing at the ends instead of wrapping', () => {
    const routes = ['/jobs', '/job-board']
    expect(moveItem(EMPTY_PREFS, 'OPERATIONS', routes, '/jobs', -1)).toBe(EMPTY_PREFS)
    expect(moveItem(EMPTY_PREFS, 'OPERATIONS', routes, '/job-board', 1)).toBe(EMPTY_PREFS)
  })

  it('stores routes rather than positions', () => {
    // An index would reorder the wrong page the moment a release inserts one.
    const prefs = moveItem(EMPTY_PREFS, 'OPERATIONS', ['/a', '/b'], '/b', -1)
    expect(prefs.order.OPERATIONS.every(v => typeof v === 'string' && v.startsWith('/'))).toBe(true)
  })

  it('reconciles a saved order against what exists now', () => {
    // A page that went away is dropped; one that arrived is appended rather
    // than disappearing because it was not in the saved list.
    expect(orderedRoutes({ order: { S: ['/gone', '/b'] } }, 'S', ['/a', '/b', '/c']))
      .toEqual(['/b', '/a', '/c'])
  })

  it('applies a saved order to the rendered menu', () => {
    const out = applyNavPrefs(sections(), { hidden: [], order: { OPERATIONS: ['/recurring', '/jobs', '/job-board'] } })
    expect(out[0].items.map(i => i.to)).toEqual(['/recurring', '/jobs', '/job-board'])
  })
})

describe('storage', () => {
  it('round-trips per user and per company', () => {
    saveNavPrefs(3, 'alayda@hhh.services', { hidden: ['/bills'], order: { FINANCIAL: ['/invoices'] } })
    expect(loadNavPrefs(3, 'alayda@hhh.services').hidden).toEqual(['/bills'])
    // Another person on the same device keeps their own menu.
    expect(loadNavPrefs(3, 'noah@hhh.services')).toEqual(EMPTY_PREFS)
    // And the same person in another company starts clean.
    expect(loadNavPrefs(4, 'alayda@hhh.services')).toEqual(EMPTY_PREFS)
  })

  it('is case-insensitive about the email', () => {
    saveNavPrefs(3, 'Alayda@HHH.services', { hidden: ['/bills'], order: {} })
    expect(loadNavPrefs(3, 'alayda@hhh.services').hidden).toEqual(['/bills'])
  })

  it('treats corrupt or absent data as no customisation', () => {
    expect(loadNavPrefs(3, 'x@y.z')).toEqual(EMPTY_PREFS)
    localStorage.setItem('jobscout:navPrefs:3:x@y.z', '{not json')
    expect(loadNavPrefs(3, 'x@y.z')).toEqual(EMPTY_PREFS)
  })

  it('survives storage being unavailable', () => {
    // Safari private mode throws on access. Losing your customisation is
    // acceptable; losing the sidebar is not.
    vi.stubGlobal('localStorage', { get getItem() { throw new Error('denied') } })
    expect(() => loadNavPrefs(3, 'x@y.z')).not.toThrow()
    expect(loadNavPrefs(3, 'x@y.z')).toEqual(EMPTY_PREFS)
    expect(() => saveNavPrefs(3, 'x@y.z', EMPTY_PREFS)).not.toThrow()
  })

  it('resets back to the default menu', () => {
    saveNavPrefs(3, 'x@y.z', { hidden: ['/bills'], order: {} })
    resetNavPrefs(3, 'x@y.z')
    expect(loadNavPrefs(3, 'x@y.z')).toEqual(EMPTY_PREFS)
  })
})

describe('what the customiser is shown', () => {
  it('lists hidden items too, so they can be brought back', () => {
    // The one screen that must show you what you cannot otherwise see.
    const out = customisableSections(sections(), { hidden: ['/bills'], order: {} })
    const financial = out.find(s => s.key === 'FINANCIAL')
    expect(financial.items.map(i => i.to)).toEqual(['/invoices', '/bills'])
    expect(financial.items.find(i => i.to === '/bills').hidden).toBe(true)
  })

  it('marks the routes that cannot be hidden', () => {
    const withHome = [{ key: 'MAIN', title: 'Main', items: [{ to: '/', label: 'Dashboard' }] }]
    expect(customisableSections(withHome, EMPTY_PREFS)[0].items[0].protected).toBe(true)
  })

  it('reflects the saved order', () => {
    const out = customisableSections(sections(), { hidden: [], order: { OPERATIONS: ['/recurring', '/jobs', '/job-board'] } })
    expect(out[0].items.map(i => i.to)).toEqual(['/recurring', '/jobs', '/job-board'])
  })
})
