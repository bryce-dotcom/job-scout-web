import { describe, it, expect } from 'vitest'
import { updateDecision, AWAY_MS } from './appUpdate'

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
