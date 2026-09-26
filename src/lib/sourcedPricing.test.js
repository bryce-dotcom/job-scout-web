import { describe, it, expect } from 'vitest'
import {
  isUnverifiedSourced, unverifiedSourcedLines, sendGate, sendGateMessage,
  priceBadge, matchBadge, canVerify, verifiedPatch, unverifiedPatch,
} from './sourcedPricing'

const catalog = { id: 1, item_name: 'SMBE Highbay 150W', price_source: 'catalog' }
const typed = { id: 2, item_name: 'Lift rental', price_source: 'manual' }
const sourced = { id: 3, item_name: 'Pole base, 24in', price_source: 'ai_sourced', price_verified_at: null }
const verified = { id: 4, item_name: 'Photocell', price_source: 'ai_sourced', price_verified_at: '2026-09-25T00:00:00Z', source_url: 'https://example.com/p' }

describe('which lines are redlined', () => {
  it('only an AI-sourced price nobody verified', () => {
    expect(isUnverifiedSourced(catalog)).toBe(false)
    expect(isUnverifiedSourced(typed)).toBe(false)
    expect(isUnverifiedSourced(sourced)).toBe(true)
    expect(isUnverifiedSourced(verified)).toBe(false)
    expect(unverifiedSourcedLines([catalog, typed, sourced, verified]).map(l => l.id)).toEqual([3])
  })
})

describe('the send gate', () => {
  it('nothing sourced → send', () => {
    expect(sendGate('bid', [catalog, typed, verified]).gate).toBe('ok')
    expect(sendGate('estimate', []).gate).toBe('ok')
  })
  it('a bid with an unverified sourced price is BLOCKED — you are bound by it', () => {
    expect(sendGate('bid', [catalog, sourced]).gate).toBe('block')
  })
  it('an estimate or proposal with one WARNS and can still go', () => {
    expect(sendGate('estimate', [sourced]).gate).toBe('warn')
    expect(sendGate('proposal', [sourced]).gate).toBe('warn')
    expect(sendGate(null, [sourced]).gate).toBe('warn')
  })
  it('names the lines so the rep knows where to look', () => {
    const g = sendGate('bid', [sourced])
    expect(sendGateMessage(g.gate, g.unverified, 'Bid')).toMatch(/Pole base, 24in/)
    expect(sendGateMessage(g.gate, g.unverified, 'Bid')).toMatch(/verify each one with a source link/)
    const w = sendGate('estimate', [sourced])
    expect(sendGateMessage(w.gate, w.unverified, 'Estimate')).toMatch(/Send anyway\?/)
    expect(sendGateMessage('ok', [], 'Estimate')).toBeNull()
  })
  it('does not list more than three names', () => {
    const many = [1, 2, 3, 4, 5].map(i => ({ ...sourced, id: i, item_name: `Item ${i}` }))
    expect(sendGateMessage('block', many, 'Bid')).toMatch(/Item 1, Item 2, Item 3 and 2 more/)
  })
})

describe('badges', () => {
  it('a catalog or typed price gets no badge at all', () => {
    expect(priceBadge(catalog)).toBeNull()
    expect(priceBadge(typed)).toBeNull()
  })
  it('a sourced price is redlined until verified', () => {
    expect(priceBadge(sourced)).toEqual({ text: 'AI-sourced · unverified', short: 'Unverified', tone: 'redline' })
    expect(priceBadge(verified).tone).toBe('ok')
    expect(priceBadge(verified).short).toBe('Verified') // the row is narrow; the full text is the tooltip
  })
  it('the match badge says equivalent or must source; exact says nothing', () => {
    expect(matchBadge({ match_kind: 'exact' })).toBeNull()
    expect(matchBadge({ match_kind: 'equivalent' }).text).toBe('Equivalent')
    expect(matchBadge({ match_kind: 'must_source' }).text).toBe('Must source')
    expect(matchBadge({})).toBeNull()
  })
})

describe('verifying', () => {
  it('needs a real link — the tick without the link is what this replaces', () => {
    expect(canVerify('')).toBe(false)
    expect(canVerify('grainger')).toBe(false)
    expect(canVerify('https://www.grainger.com/product/123')).toBe(true)
    expect(() => verifiedPatch({ sourceUrl: 'nope', by: 'a@b.c' })).toThrow(/source link/)
  })
  it('stamps who and when, keeps the price the human left', () => {
    const p = verifiedPatch({ sourceUrl: ' https://x.com/p ', by: 'doug@hhh.services', now: new Date('2026-09-25T12:00:00Z') })
    expect(p).toEqual({ source_url: 'https://x.com/p', price_verified_at: '2026-09-25T12:00:00.000Z', price_verified_by: 'doug@hhh.services' })
    expect('price' in p).toBe(false)
    expect(unverifiedPatch).toEqual({ price_verified_at: null, price_verified_by: null })
  })
})
