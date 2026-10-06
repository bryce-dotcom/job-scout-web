import { describe, it, expect } from 'vitest'
import {
  MAX_TABS, TAB_WISHLISTS, defaultTabWishlist, resolveTabs, hasCustomTabs, toggleTab, tabLabel,
} from './navTabs'

// Forty-odd destinations behind a top-right hamburger. 16 of HHH's 24 active
// people are field crew holding the phone one-handed in gloves.

describe('what each kind of person gets by default', () => {
  it('sales starts at step 2 of the flow, not step 1', () => {
    // Marketing is step 1 and is a company-level thing somebody sets up once.
    // A rep's day starts at Leads.
    expect(defaultTabWishlist({ role: 'Sales' })).toEqual(['/leads', '/lead-setter', '/pipeline', '/estimates'])
    expect(defaultTabWishlist({ role: 'Sales' })).not.toContain('/marketing')
  })

  it('a field tech gets the screens a field tech can actually open', () => {
    // Their menu is filtered to Field Scout + Job Board + My Pay. Putting
    // /customers in their bar would be a tab that opens nothing.
    const tabs = defaultTabWishlist({ role: 'Field Tech' })
    expect(tabs[0]).toBe('/field-scout')
    expect(tabs).toContain('/job-board')
    expect(tabs).not.toContain('/customers')
    expect(tabs).not.toContain('/jobs')
  })

  it('reads job title before access level, because the title is the work', () => {
    // A sales lead and a project manager are both user_role Manager and want
    // completely different bars.
    const sales = defaultTabWishlist({ role: 'Sales' }, 2)
    const pm = defaultTabWishlist({ role: 'Project Manager' }, 2)
    expect(sales).not.toEqual(pm)
    expect(pm[0]).toBe('/job-board')
  })

  it('matches titles nobody standardised', () => {
    expect(defaultTabWishlist({ role: 'Senior Sales Rep' })).toEqual(TAB_WISHLISTS.sales)
    expect(defaultTabWishlist({ role: 'Lead Install Tech' })).toEqual(TAB_WISHLISTS['field tech'])
    expect(defaultTabWishlist({ role: 'Appointment Setter' })).toEqual(TAB_WISHLISTS.setter)
  })

  it('falls back to access level when the title says nothing', () => {
    expect(defaultTabWishlist({ role: '' }, 3)[0]).toBe('/')
    expect(defaultTabWishlist({}, 0)).toContain('/field-scout')
    expect(defaultTabWishlist(null, 0).length).toBe(MAX_TABS)
  })

  it('always offers four', () => {
    for (const list of Object.values(TAB_WISHLISTS)) expect(list).toHaveLength(MAX_TABS)
  })
})

describe('a tab can never be a dead end', () => {
  const available = ['/', '/field-scout', '/job-board', '/company-calendar', '/my-pay']

  it('drops a default the person is not allowed to see', () => {
    // The whole security story, same as navPrefs: preferences are applied
    // AFTER role filtering, never before.
    const tabs = resolveTabs({ wish: ['/customers', '/jobs', '/field-scout', '/job-board'], available })
    expect(tabs).not.toContain('/customers')
    expect(tabs).not.toContain('/jobs')
    expect(tabs).toContain('/field-scout')
  })

  it('drops a SAVED tab the person is not allowed to see', () => {
    // Someone promoted then demoted must not keep a Payroll tab.
    const tabs = resolveTabs({ saved: ['/payroll', '/field-scout'], available })
    expect(tabs).not.toContain('/payroll')
    expect(tabs[0]).toBe('/field-scout')
  })

  it('what they chose wins over the default', () => {
    const tabs = resolveTabs({ saved: ['/my-pay', '/company-calendar'], wish: ['/field-scout', '/job-board'], available })
    expect(tabs.slice(0, 2)).toEqual(['/my-pay', '/company-calendar'])
  })

  it('tops a short choice up rather than leaving a gap', () => {
    const tabs = resolveTabs({ saved: ['/my-pay'], wish: ['/field-scout', '/job-board'], available })
    expect(tabs).toHaveLength(MAX_TABS)
    expect(tabs[0]).toBe('/my-pay')
  })

  it('never exceeds four, and never repeats one', () => {
    const tabs = resolveTabs({ saved: ['/', '/', '/field-scout'], wish: ['/field-scout', '/job-board', '/my-pay', '/company-calendar'], available })
    expect(tabs).toHaveLength(MAX_TABS)
    expect(new Set(tabs).size).toBe(MAX_TABS)
  })

  it('returns what it can when the person has almost nothing', () => {
    expect(resolveTabs({ wish: ['/field-scout'], available: ['/field-scout'] })).toEqual(['/field-scout'])
    expect(resolveTabs({ available: [] })).toEqual([])
    expect(resolveTabs()).toEqual([])
  })
})

describe('choosing your own four', () => {
  it('knows a chosen bar from a default one', () => {
    expect(hasCustomTabs({ tabs: ['/'] })).toBe(true)
    expect(hasCustomTabs({ tabs: [] })).toBe(false)
    expect(hasCustomTabs({})).toBe(false)
    expect(hasCustomTabs(null)).toBe(false)
  })

  it('adds and removes, keeping the order they picked', () => {
    let p = { tabs: [] }
    p = toggleTab(p, '/jobs')
    p = toggleTab(p, '/leads')
    expect(p.tabs).toEqual(['/jobs', '/leads'])
    p = toggleTab(p, '/jobs')
    expect(p.tabs).toEqual(['/leads'])
  })

  it('refuses a fifth rather than silently dropping one of theirs', () => {
    const full = { tabs: ['/a', '/b', '/c', '/d'] }
    expect(toggleTab(full, '/e')).toBe(full)
    // Removing still works when full — that is how they make room.
    expect(toggleTab(full, '/b').tabs).toEqual(['/a', '/c', '/d'])
  })

  it('leaves the rest of the preferences alone', () => {
    const p = { hidden: ['/books'], order: { SALES_FLOW: ['/leads'] }, tabs: [] }
    const next = toggleTab(p, '/jobs')
    expect(next.hidden).toEqual(['/books'])
    expect(next.order).toEqual({ SALES_FLOW: ['/leads'] })
  })
})

describe('labels that fit under an icon', () => {
  it('shortens the ones that would wrap on a 375px screen', () => {
    expect(tabLabel({ to: '/field-scout', label: 'Field Scout (Clock)' })).toBe('Field')
    expect(tabLabel({ to: '/', label: 'Dashboard' })).toBe('Home')
    expect(tabLabel({ to: '/job-board', label: 'Job Board' })).toBe('Board')
    expect(tabLabel({ to: '/lead-setter', label: 'Lead Setter' })).toBe('Setter')
  })

  it('keeps a short label as it is', () => {
    expect(tabLabel({ to: '/leads', label: 'Leads' })).toBe('Leads')
    expect(tabLabel({ to: '/jobs', label: 'Jobs' })).toBe('Jobs')
    expect(tabLabel({ to: '/pipeline', label: 'Pipeline' })).toBe('Pipeline')
  })

  it('uses the first word when a label is long and unmapped', () => {
    expect(tabLabel({ to: '/x', label: 'Procurement Queue' })).toBe('Procurement')
  })

  it('prefers the per-tenant title over the generic label', () => {
    // Estimates/Bids/Proposals is per company (lib/documentVocabulary).
    expect(tabLabel({ to: '/estimates', label: 'Estimates', title: 'Bids' })).toBe('Bids')
  })

  it('survives nothing at all', () => {
    expect(tabLabel({})).toBe('')
    expect(tabLabel(null)).toBe('')
  })
})
