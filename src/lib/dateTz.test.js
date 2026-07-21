import { describe, it, expect } from 'vitest'
import { toZonedInput, fromZonedInput, zonedDayKey, zonedHour, DEFAULT_TZ, PHOENIX_TZ } from './dateTz'

// These lock the exact bugs HHH hit:
//   - "I set 1pm, it reopens at 7am"  (a UTC instant mis-rendered device-local)
//   - "leads jump a day"              (evening instant bucketed on the wrong day)
// The helpers take an explicit zone, so these assertions are deterministic
// regardless of the machine's timezone (which is the whole point of the fix).

const MT = DEFAULT_TZ // America/Denver

describe('toZonedInput — render a UTC instant as a wall-clock input string', () => {
  it('1pm Mountain (summer, 19:00Z) shows as 13:00, NOT 07:00', () => {
    expect(toZonedInput('2026-07-15T19:00:00.000Z', MT)).toBe('2026-07-15T13:00')
  })
  it('1pm Mountain (winter, 20:00Z) shows as 13:00', () => {
    expect(toZonedInput('2026-01-15T20:00:00.000Z', MT)).toBe('2026-01-15T13:00')
  })
  it('Phoenix has no DST — 1pm is 20:00Z year-round', () => {
    expect(toZonedInput('2026-07-15T20:00:00.000Z', PHOENIX_TZ)).toBe('2026-07-15T13:00')
    expect(toZonedInput('2026-01-15T20:00:00.000Z', PHOENIX_TZ)).toBe('2026-01-15T13:00')
  })
})

describe('fromZonedInput / toZonedInput round-trip (no drift on save)', () => {
  // A no-op edit-then-save must reproduce the identical instant — this is the
  // Event-modal / block / Leads-scheduler fix.
  const instants = [
    '2026-07-15T19:00:00.000Z',
    '2026-01-15T20:00:00.000Z',
    '2026-07-16T02:30:00.000Z', // late-evening Mountain, crosses UTC midnight
    '2026-03-08T19:00:00.000Z', // 1pm on DST spring-forward day (a real business hour)
  ]
  // Note: instants inside the ~1h DST spring-forward gap (2-3am) intentionally
  // do NOT round-trip — dateTz documents this and it never affects scheduling.
  for (const iso of instants) {
    it(`round-trips ${iso} through Mountain`, () => {
      expect(fromZonedInput(toZonedInput(iso, MT), MT)).toBe(iso)
    })
    it(`round-trips ${iso} through Phoenix`, () => {
      expect(fromZonedInput(toZonedInput(iso, PHOENIX_TZ), PHOENIX_TZ)).toBe(iso)
    })
  }
})

describe('zonedDayKey — bucket an appointment onto the right calendar day', () => {
  it('8pm Mountain on the 15th (02:00Z next day) buckets to the 15th, not the 16th', () => {
    expect(zonedDayKey('2026-07-16T02:00:00.000Z', MT)).toBe('2026-07-15')
  })
  it('same instant in Phoenix (7pm) is still the 15th', () => {
    expect(zonedDayKey('2026-07-16T02:00:00.000Z', PHOENIX_TZ)).toBe('2026-07-15')
  })
  it('an early-morning instant stays on its Mountain day', () => {
    expect(zonedDayKey('2026-07-15T13:00:00.000Z', MT)).toBe('2026-07-15') // 7am MT
  })
})

describe('zonedHour — bucket onto the right hour row', () => {
  it('19:00Z is the 13:00 (1pm) row in Mountain summer', () => {
    expect(zonedHour('2026-07-15T19:00:00.000Z', MT)).toBe(13)
  })
})
