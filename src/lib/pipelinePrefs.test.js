import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadPipelineFilters, savePipelineFilters, resolveOwnerFilter,
  stashPipelineScroll, takePipelineScroll,
} from './pipelinePrefs'

// Backing the two tickets: filters must survive a trip into a job and back,
// and the board must return to where you left it — once, not forever.

const store = (init = {}) => {
  let data = { ...init }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
    _raw: () => data,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', store())
  vi.stubGlobal('sessionStorage', store())
})

describe('filters survive the round trip', () => {
  it('restores exactly what was saved', () => {
    savePipelineFilters(3, { ownerFilter: '16', dateRange: 'ytd', buFilter: 'Energy Scout' })
    expect(loadPipelineFilters(3)).toEqual({ ownerFilter: '16', dateRange: 'ytd', buFilter: 'Energy Scout' })
  })

  it('keeps each company separate', () => {
    savePipelineFilters(3, { dateRange: 'ytd' })
    savePipelineFilters(9, { dateRange: 'mtd' })
    expect(loadPipelineFilters(3).dateRange).toBe('ytd')
    expect(loadPipelineFilters(9).dateRange).toBe('mtd')
  })

  it('remembers the search box and the mobile tab too', () => {
    savePipelineFilters(3, { searchTerm: 'ryder', mobileFilter: 'Negotiation' })
    const got = loadPipelineFilters(3)
    expect(got.searchTerm).toBe('ryder')
    expect(got.mobileFilter).toBe('Negotiation')
  })

  it('ignores fields it was never asked to remember', () => {
    savePipelineFilters(3, { dateRange: 'ytd', somethingElse: 'x' })
    expect(loadPipelineFilters(3).somethingElse).toBeUndefined()
  })

  it('returns nothing for a company with no saved filters', () => {
    expect(loadPipelineFilters(3)).toEqual({})
    expect(loadPipelineFilters(null)).toEqual({})
  })

  it('survives corrupted storage instead of blanking the page', () => {
    localStorage.setItem('pipeline_filters_3', '{not json')
    expect(loadPipelineFilters(3)).toEqual({})
  })

  it('ignores non-string values rather than restoring junk state', () => {
    savePipelineFilters(3, { dateRange: { evil: true }, buFilter: 'all' })
    const got = loadPipelineFilters(3)
    expect(got.dateRange).toBeUndefined()
    expect(got.buFilter).toBe('all')
  })
})

describe('a field tech is never widened to everyone', () => {
  it('locks to their own id whatever was saved', () => {
    expect(resolveOwnerFilter('all', { isFieldTech: true, userId: 42 })).toBe('42')
  })

  it('restores the saved owner for everyone else', () => {
    expect(resolveOwnerFilter('16', { isFieldTech: false, userId: 42 })).toBe('16')
  })

  it('defaults to all when nothing was saved', () => {
    expect(resolveOwnerFilter(null, { isFieldTech: false })).toBe('all')
    expect(resolveOwnerFilter('', { isFieldTech: false })).toBe('all')
  })
})

describe('scroll position restores once, not forever', () => {
  it('returns what was stashed', () => {
    stashPipelineScroll(3, { board: 420, window: 100 })
    expect(takePipelineScroll(3)).toEqual({ board: 420, window: 100 })
  })

  it('is consumed on read, so later renders do not yank the board back', () => {
    stashPipelineScroll(3, { board: 420 })
    expect(takePipelineScroll(3)).toEqual({ board: 420 })
    expect(takePipelineScroll(3)).toBeNull()
  })

  it('returns null when nothing was stashed', () => {
    expect(takePipelineScroll(3)).toBeNull()
    expect(takePipelineScroll(null)).toBeNull()
  })

  it('survives corrupted storage', () => {
    sessionStorage.setItem('pipeline_scroll_3', 'garbage')
    expect(takePipelineScroll(3)).toBeNull()
  })
})

describe('private browsing (storage throws) must not break the page', () => {
  it('save and load degrade quietly', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => {} })
    expect(() => savePipelineFilters(3, { dateRange: 'ytd' })).not.toThrow()
    expect(loadPipelineFilters(3)).toEqual({})
  })

  it('scroll helpers degrade quietly', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => {} })
    expect(() => stashPipelineScroll(3, { board: 1 })).not.toThrow()
    expect(takePipelineScroll(3)).toBeNull()
  })
})
