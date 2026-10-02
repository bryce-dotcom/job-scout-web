import { describe, it, expect } from 'vitest'
import { totalSeconds, defaultTrim, ASPECTS, MAX_RESULT_SECONDS } from './videoEdit'

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
