import { describe, it, expect } from 'vitest'
import { splitDateTimeInput, joinDateTimeInput } from './dateTimeParts'

describe('splitting what the form already holds', () => {
  it('splits a normal value', () => {
    expect(splitDateTimeInput('2026-08-24T08:30')).toEqual({ date: '2026-08-24', time: '08:30' })
  })

  it('tolerates seconds and a space separator, which some rows carry', () => {
    expect(splitDateTimeInput('2026-08-24T08:30:00')).toEqual({ date: '2026-08-24', time: '08:30' })
    expect(splitDateTimeInput('2026-08-24 08:30')).toEqual({ date: '2026-08-24', time: '08:30' })
  })

  it('handles a date with no time yet', () => {
    expect(splitDateTimeInput('2026-08-24')).toEqual({ date: '2026-08-24', time: '' })
  })

  it('returns empties rather than throwing on junk', () => {
    for (const v of ['', null, undefined, 'not a date', 42])
      expect(splitDateTimeInput(v)).toEqual({ date: '', time: '' })
  })
})

describe('putting them back together', () => {
  it('round-trips without changing the stored shape', () => {
    const v = '2026-08-24T08:30'
    const { date, time } = splitDateTimeInput(v)
    expect(joinDateTimeInput(date, time)).toBe(v)
  })

  // Picking a day and no time must not throw the day away — that is the same
  // silent-discard shape as the line-item draft.
  it('gives a date with no time a sensible default rather than dropping it', () => {
    expect(joinDateTimeInput('2026-08-24', '')).toBe('2026-08-24T08:00')
    expect(joinDateTimeInput('2026-08-24', null)).toBe('2026-08-24T08:00')
  })

  it('a time with no date is not a moment', () => {
    expect(joinDateTimeInput('', '08:30')).toBe('')
    expect(joinDateTimeInput(null, '08:30')).toBe('')
  })

  it('rejects a malformed date instead of composing nonsense', () => {
    expect(joinDateTimeInput('24/08/2026', '08:30')).toBe('')
    expect(joinDateTimeInput('2026-8-4', '08:30')).toBe('')
  })

  it('ignores a malformed time and falls back', () => {
    expect(joinDateTimeInput('2026-08-24', '8:30')).toBe('2026-08-24T08:00')
    expect(joinDateTimeInput('2026-08-24', 'lunchtime')).toBe('2026-08-24T08:00')
  })

  it('clearing the date clears the value', () => {
    expect(joinDateTimeInput('', '')).toBe('')
  })
})
