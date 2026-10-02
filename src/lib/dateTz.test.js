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

// ── The job board read the viewer's device, the job tab read the job's region ──
//
// Christopher, 7bbfcab8: "After setting a time on the job tab it defaults to
// 7 am when you open up the job on the job board. The date stays accurate but
// not the times." JobDetail rendered the field with toZonedInput + the job's
// resolved timezone; the board bucketed onto its hour rows with
// new Date(start_date).getHours() — the DEVICE. These pin the two halves the
// board now uses, with the numbers that make the symptom.
describe('a job sits in the same hour row wherever you open it', () => {
  // 9am Mountain in winter (MST, UTC-7) is 16:00 UTC.
  const nineAmMountain = '2026-01-15T16:00:00Z'

  it('reads the hour in the job region, not UTC and not the device', () => {
    expect(zonedHour(nineAmMountain, 'America/Denver')).toBe(9)
    // The same instant is 9am in Phoenix in winter (both -7) ...
    expect(zonedHour(nineAmMountain, 'America/Phoenix')).toBe(9)
    // ... and 8am in summer, when Denver moves and Phoenix does not. That one
    // hour is why an Arizona crew saw a different row than the Utah office.
    const nineAmSummer = '2026-07-15T15:00:00Z'   // 9am MDT
    expect(zonedHour(nineAmSummer, 'America/Denver')).toBe(9)
    expect(zonedHour(nineAmSummer, 'America/Phoenix')).toBe(8)
  })

  it('puts midnight Mountain on its own day, not the UTC one', () => {
    // Midnight MST is 07:00 UTC — read as UTC it is both the wrong hour (7am,
    // the number in the ticket) and, near month ends, the wrong day.
    const midnightMountain = '2026-01-16T07:00:00Z'
    expect(zonedHour(midnightMountain, 'America/Denver')).toBe(0)
    expect(zonedDayKey(midnightMountain, 'America/Denver')).toBe('2026-01-16')
    expect(new Date(midnightMountain).getUTCHours()).toBe(7)   // what it used to show
  })

  it('keeps an evening job on the day it was scheduled', () => {
    // 6pm Mountain = 01:00 UTC the NEXT day; day-keying by UTC moved it.
    const sixPmMountain = '2026-03-10T00:00:00Z'
    expect(zonedDayKey(sixPmMountain, 'America/Denver')).toBe('2026-03-09')
  })

  it('returns null rather than NaN for an unreadable time, so it can be clamped', () => {
    expect(zonedHour(null, 'America/Denver')).toBe(null)
    expect(zonedHour('not a date', 'America/Denver')).toBe(null)
    expect(zonedDayKey(null, 'America/Denver')).toBe('')
  })

  it('a round trip through the input keeps the wall clock', () => {
    const tz = 'America/Denver'
    const shown = toZonedInput(nineAmMountain, tz)
    expect(shown).toBe('2026-01-15T09:00')
    expect(fromZonedInput(shown, tz)).toBe(nineAmMountain.replace('Z', '.000Z'))
  })
})
