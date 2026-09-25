import { describe, it, expect } from 'vitest'
import { frameTimes, posterTime } from './videoFrames'

describe('videoFrames timing', () => {
  it('spreads up to four frames through the middle of the clip', () => {
    expect(frameTimes(60)).toEqual([6, 22, 38, 54])
    expect(frameTimes(3)).toEqual([0.3, 1.5, 2.7])
  })
  it('a tiny or unknown clip gets one early frame', () => {
    expect(frameTimes(1)).toEqual([0.5])
    expect(frameTimes(NaN)).toEqual([0])
    expect(frameTimes(0)).toEqual([0])
  })
  it('poster is one second in, or the middle of something shorter', () => {
    expect(posterTime(30)).toBe(1)
    expect(posterTime(1)).toBe(0.5)
    expect(posterTime(null)).toBe(0)
  })
})
