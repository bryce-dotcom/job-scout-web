import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadListPrefs, saveListPrefs, clearListPrefs } from './listPrefs'

const store = (init = {}) => {
  let data = { ...init }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
    _raw: () => data,
  }
}
const FIELDS = { persistent: ['statusFilter', 'dueFilter', 'sortOrder'], session: ['searchTerm'] }

beforeEach(() => {
  vi.stubGlobal('localStorage', store())
  vi.stubGlobal('sessionStorage', store())
})

describe('a list stays how you left it', () => {
  it('gives back the filters and sort you had', () => {
    saveListPrefs('invoices', 3, { statusFilter: 'unpaid', sortOrder: 'due_soon' }, FIELDS)
    expect(loadListPrefs('invoices', 3, FIELDS)).toEqual({ statusFilter: 'unpaid', sortOrder: 'due_soon' })
  })

  it('keeps each list separate', () => {
    saveListPrefs('invoices', 3, { statusFilter: 'unpaid' }, FIELDS)
    saveListPrefs('estimates', 3, { statusFilter: 'draft' }, FIELDS)
    expect(loadListPrefs('invoices', 3, FIELDS).statusFilter).toBe('unpaid')
    expect(loadListPrefs('estimates', 3, FIELDS).statusFilter).toBe('draft')
  })

  it('keeps each company separate', () => {
    saveListPrefs('invoices', 3, { statusFilter: 'unpaid' }, FIELDS)
    expect(loadListPrefs('invoices', 9, FIELDS)).toEqual({})
  })
})

describe('the search box does not outlive the session', () => {
  it('survives a trip into a record and back', () => {
    saveListPrefs('invoices', 3, { searchTerm: 'biorge', statusFilter: 'unpaid' }, FIELDS)
    expect(loadListPrefs('invoices', 3, FIELDS).searchTerm).toBe('biorge')
  })

  it('is gone in a new session, while the filters remain', () => {
    saveListPrefs('invoices', 3, { searchTerm: 'biorge', statusFilter: 'unpaid' }, FIELDS)
    vi.stubGlobal('sessionStorage', store())
    const got = loadListPrefs('invoices', 3, FIELDS)
    expect(got.searchTerm).toBeUndefined()
    expect(got.statusFilter).toBe('unpaid')
  })

  it('never writes the search to localStorage', () => {
    saveListPrefs('invoices', 3, { searchTerm: 'biorge' }, FIELDS)
    expect(JSON.stringify(localStorage._raw())).not.toContain('biorge')
  })
})

describe('it cannot break the control it seeds', () => {
  it('ignores non-string values', () => {
    saveListPrefs('invoices', 3, { statusFilter: { a: 1 }, sortOrder: 5, dueFilter: 'overdue' }, FIELDS)
    expect(loadListPrefs('invoices', 3, FIELDS)).toEqual({ dueFilter: 'overdue' })
  })

  it('returns nothing rather than throwing on hand-edited junk', () => {
    localStorage.setItem('list_filters_invoices_3', 'not json')
    expect(loadListPrefs('invoices', 3, FIELDS)).toEqual({})
    localStorage.setItem('list_filters_invoices_3', '["an","array"]')
    expect(loadListPrefs('invoices', 3, FIELDS)).toEqual({})
  })

  it('does nothing without a scope or company', () => {
    expect(loadListPrefs(null, 3, FIELDS)).toEqual({})
    expect(loadListPrefs('invoices', null, FIELDS)).toEqual({})
    expect(() => saveListPrefs(null, null, { statusFilter: 'x' }, FIELDS)).not.toThrow()
  })

  it('survives private mode, where storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => {} })
    expect(loadListPrefs('invoices', 3, FIELDS)).toEqual({})
    expect(() => saveListPrefs('invoices', 3, { statusFilter: 'x' }, FIELDS)).not.toThrow()
  })

  it('clears both halves', () => {
    saveListPrefs('invoices', 3, { statusFilter: 'unpaid', searchTerm: 'biorge' }, FIELDS)
    clearListPrefs('invoices', 3)
    expect(loadListPrefs('invoices', 3, FIELDS)).toEqual({})
  })
})
