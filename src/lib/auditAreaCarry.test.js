import { describe, it, expect } from 'vitest'
import { areaAnnotations } from './auditAreaCarry'

describe('what the tech saw travels with the line', () => {
  it('carries the field note and the photos', () => {
    expect(areaAnnotations({
      override_notes: 'Ballast bypassed, 35ft lift needed',
      photos: ['https://x/a.jpg', 'https://x/b.jpg'],
    })).toEqual({
      notes: 'Ballast bypassed, 35ft lift needed',
      photos: ['https://x/a.jpg', 'https://x/b.jpg'],
    })
  })

  it('carries a note even when there is no photo, and vice versa', () => {
    expect(areaAnnotations({ override_notes: 'Note only' })).toEqual({ notes: 'Note only', photos: [] })
    expect(areaAnnotations({ photos: ['https://x/a.jpg'] })).toEqual({ notes: null, photos: ['https://x/a.jpg'] })
  })
})

// Both keys always come back: a partial object lets a caller spread it and
// silently keep whatever was there before, which is the bug this prevents.
describe('it always answers both questions', () => {
  it('returns both keys for an empty area', () => {
    expect(areaAnnotations({})).toEqual({ notes: null, photos: [] })
    expect(areaAnnotations(null)).toEqual({ notes: null, photos: [] })
    expect(areaAnnotations(undefined)).toEqual({ notes: null, photos: [] })
  })

  it('treats whitespace as no note rather than an empty line on the estimate', () => {
    expect(areaAnnotations({ override_notes: '   ' }).notes).toBeNull()
  })

  it('drops empty entries rather than rendering a broken thumbnail', () => {
    expect(areaAnnotations({ photos: ['https://x/a.jpg', '', null] }).photos).toEqual(['https://x/a.jpg'])
  })

  it('copes with photos arriving as something other than an array', () => {
    for (const v of ['not an array', 42, {}]) expect(areaAnnotations({ photos: v }).photos).toEqual([])
  })
})
