import { describe, it, expect } from 'vitest'
import { totalSeconds, defaultTrim, ASPECTS, MAX_RESULT_SECONDS, normalizeStoryboard, stretchForVoice } from './videoEdit'

describe('videoEdit planning', () => {
  it('adds up the kept stretches', () => {
    expect(totalSeconds([{ start: 0, end: 8 }, { start: 2.5, end: 10 }, { start: 5, end: 3 }])).toBe(15.5)
    expect(totalSeconds([])).toBe(0)
  })
  it('keeps a short clip whole and caps a long one', () => {
    expect(defaultTrim(7)).toEqual({ start: 0, end: 7 })
    expect(defaultTrim(145)).toEqual({ start: 0, end: 20 })
    expect(defaultTrim(null)).toEqual({ start: 0, end: 20 })
  })
  it('offers vertical, square and landscape frames under the reel limit', () => {
    expect(Object.keys(ASPECTS)).toEqual(['vertical', 'square', 'landscape'])
    expect(ASPECTS.vertical.h).toBeGreaterThan(ASPECTS.vertical.w)
    expect(MAX_RESULT_SECONDS).toBe(90)
  })
})

describe('normalizeStoryboard', () => {
  const caps = [{ id: 1, media_type: 'image' }, { id: 2, media_type: 'image' }, { id: 3, media_type: 'video', duration_s: 10 }]
  it('keeps real scenes, clamps seconds, trims a clip to its length, and closes with the call to action', () => {
    const sb = { headline: 'H', scenes: [
      { kind: 'compare', before: 1, after: 2, text: 'Before and after', seconds: 20 },
      { kind: 'photo', capture: 9, seconds: 3 },
      { kind: 'clip', capture: 3, start: 6, end: 30, text: null },
      { kind: 'card', text: '', seconds: 3 },
      { kind: 'dance', seconds: 3 },
    ], cta: { text: 'Call us', sub: 'hhh.services' } }
    const r = normalizeStoryboard(sb, caps)
    expect(r.scenes.map((s) => s.kind)).toEqual(['compare', 'clip', 'card'])
    expect(r.scenes[0].seconds).toBe(8)
    expect(r.scenes[1]).toMatchObject({ start: 6, end: 10, seconds: 4 })
    expect(r.scenes[2]).toMatchObject({ cta: true, text: 'Call us' })
    expect(r.total).toBe(15)
  })
  it('stops adding scenes past the limit', () => {
    const sb = { scenes: Array.from({ length: 30 }, () => ({ kind: 'card', text: 'x', seconds: 5 })), cta: null }
    const r = normalizeStoryboard(sb, [], { max: 12 })
    expect(r.scenes.length).toBe(2)
    expect(r.total).toBe(10)
  })
})

describe('stretchForVoice', () => {
  const scenes = [{ kind: 'photo', seconds: 4 }, { kind: 'card', seconds: 3 }]
  it('leaves the picture alone when the narrator fits', () => {
    expect(stretchForVoice(scenes, 7, 5)).toEqual({ scenes, total: 7 })
  })
  it('holds the last scene until the narrator finishes, plus a beat', () => {
    const r = stretchForVoice(scenes, 7, 10)
    expect(r.total).toBe(10.6)
    expect(r.scenes[1].seconds).toBe(6.6)
    expect(r.scenes[0]).toBe(scenes[0])
  })
  it('never runs past the cap', () => {
    const r = stretchForVoice(scenes, 7, 200, 90)
    expect(r.total).toBe(90)
  })
})
