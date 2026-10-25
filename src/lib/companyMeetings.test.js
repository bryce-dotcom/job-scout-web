import { describe, it, expect } from 'vitest'
import { deriveMeetings, formatTime, cadenceSentence, MEETING_SERIES } from './companyMeetings'

// October 2026: the 1st is a Thursday, so Mondays are 5, 12, 19, 26.
const OCT = { from: '2026-10-01', through: '2026-10-31' }
const NOV = { from: '2026-11-01', through: '2026-11-30' }

const HHH = { l10_day: 'Monday', l10_time: '08:30', quarterly_next: '2026-10-10', annual_next: '' }

const datesOf = (list, kind) => list.filter((m) => m.seriesKind === kind).map((m) => m.date)

describe('deriveMeetings — the rule', () => {
  it('draws nothing when no cadence is set', () => {
    expect(deriveMeetings({}, [], OCT)).toEqual([])
    expect(deriveMeetings(null, [], OCT)).toEqual([])
  })

  it('needs a window', () => {
    expect(deriveMeetings(HHH, [], {})).toEqual([])
  })

  it('puts the weekly L10 on every matching weekday in the window', () => {
    expect(datesOf(deriveMeetings(HHH, [], OCT), 'l10'))
      .toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  })

  it('carries the cadence time onto the L10', () => {
    const [first] = deriveMeetings(HHH, [], OCT).filter((m) => m.seriesKind === 'l10')
    expect(first.time).toBe('08:30')
    expect(first.title).toBe('L10 Meeting')
    expect(first.minutes).toBe(MEETING_SERIES.l10.minutes)
  })

  it('a day name it does not recognise draws nothing rather than guessing', () => {
    expect(deriveMeetings({ l10_day: 'Someday' }, [], OCT)).toEqual([])
  })
})

describe('deriveMeetings — the lapsed anchor', () => {
  // HHH's real state on the day this was built: quarterly_next = 2026-10-10,
  // fifteen days in the past, with the EOS page counting down into the
  // negative and nothing rolling it forward.
  it('steps a past quarterly anchor forward instead of showing nothing', () => {
    expect(datesOf(deriveMeetings(HHH, [], OCT), 'quarterly')).toEqual(['2026-10-10'])
    // Next one is 90 days on, in January — not in November.
    expect(datesOf(deriveMeetings(HHH, [], NOV), 'quarterly')).toEqual([])
    expect(datesOf(deriveMeetings(HHH, [], { from: '2027-01-01', through: '2027-01-31' }), 'quarterly'))
      .toEqual(['2027-01-10'])
  })

  it('keeps stepping for an anchor years behind', () => {
    const c = { quarterly_next: '2024-02-15' }
    expect(datesOf(deriveMeetings(c, [], { from: '2026-11-01', through: '2026-11-30' }), 'quarterly'))
      .toEqual(['2026-11-15'])
  })

  it('clamps a month-end anchor instead of skidding into the next month', () => {
    // 31 Jan + 3 months is 30 April, not 1 May. Left to setMonth it would
    // drift a day further every time it crossed a short month.
    const c = { quarterly_next: '2026-01-31' }
    expect(datesOf(deriveMeetings(c, [], { from: '2026-04-01', through: '2026-04-30' }), 'quarterly'))
      .toEqual(['2026-04-30'])
    // And it comes back to the 31st where the month allows it.
    expect(datesOf(deriveMeetings(c, [], { from: '2026-07-01', through: '2026-07-31' }), 'quarterly'))
      .toEqual(['2026-07-31'])
  })

  it('steps the annual by twelve months', () => {
    const c = { annual_next: '2025-12-04' }
    expect(datesOf(deriveMeetings(c, [], { from: '2026-12-01', through: '2026-12-31' }), 'annual'))
      .toEqual(['2026-12-04'])
  })
})

describe('deriveMeetings — the exceptions', () => {
  it('a cancelled week disappears and the rest of the series stays', () => {
    const rows = [{ id: 1, series_kind: 'l10', series_date: '2026-10-12', cancelled: true, meeting_date: null }]
    expect(datesOf(deriveMeetings(HHH, rows, OCT), 'l10'))
      .toEqual(['2026-10-05', '2026-10-19', '2026-10-26'])
  })

  it('a moved week leaves its own day and lands on the new one', () => {
    const rows = [{ id: 2, series_kind: 'l10', series_date: '2026-10-12', meeting_date: '2026-10-13', start_time: '09:00:00', cancelled: false }]
    const got = deriveMeetings(HHH, rows, OCT).filter((m) => m.seriesKind === 'l10')
    expect(got.map((m) => m.date)).toEqual(['2026-10-05', '2026-10-13', '2026-10-19', '2026-10-26'])
    const moved = got.find((m) => m.date === '2026-10-13')
    expect(moved.moved).toBe(true)
    expect(moved.time).toBe('09:00')
    expect(moved.overrideId).toBe(2)
  })

  it('the series date survives the move, so the original day does not come back', () => {
    const rows = [{ id: 3, series_kind: 'l10', series_date: '2026-10-12', meeting_date: '2026-10-13', cancelled: false }]
    const moved = deriveMeetings(HHH, rows, OCT).find((m) => m.overrideId === 3)
    // The join key stays the date it WOULD have been on. Were it rewritten to
    // the new date, the rule would redraw 10-12 and the meeting would exist twice.
    expect(moved.seriesDate).toBe('2026-10-12')
    expect(deriveMeetings(HHH, rows, OCT).filter((m) => m.date === '2026-10-12')).toEqual([])
  })

  it('a meeting pushed into next month leaves this one entirely', () => {
    const rows = [{ id: 4, series_kind: 'l10', series_date: '2026-10-26', meeting_date: '2026-11-02', cancelled: false }]
    expect(datesOf(deriveMeetings(HHH, rows, OCT), 'l10'))
      .toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
  })

  it('and arrives in the month it was pushed into, beside that month\'s own series', () => {
    const rows = [{ id: 5, series_kind: 'l10', series_date: '2026-10-26', meeting_date: '2026-11-03', cancelled: false }]
    // November Mondays are 2, 9, 16, 23, 30 — plus the one pushed to Tue the 3rd.
    expect(datesOf(deriveMeetings(HHH, rows, NOV), 'l10'))
      .toEqual(['2026-11-02', '2026-11-03', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  })

  it('an override for a date the rule never produces is still honoured', () => {
    // Belt and braces: if the cadence day changes after a week was moved, the
    // row must not vanish — somebody deliberately put a meeting there.
    const rows = [{ id: 6, series_kind: 'l10', series_date: '2026-10-07', meeting_date: '2026-10-08', cancelled: false }]
    expect(deriveMeetings(HHH, rows, OCT).some((m) => m.date === '2026-10-08')).toBe(true)
  })
})

describe('deriveMeetings — one-offs', () => {
  it('a custom meeting appears on its own day with its own name', () => {
    const rows = [{ id: 7, series_kind: 'custom', series_date: null, meeting_date: '2026-10-14', start_time: '15:00:00', title: 'All-Hands', cancelled: false }]
    const got = deriveMeetings(HHH, rows, OCT).find((m) => m.overrideId === 7)
    expect(got).toMatchObject({ title: 'All-Hands', date: '2026-10-14', time: '15:00', custom: true, moved: false, seriesDate: null })
  })

  it('several one-offs coexist — they are not overrides of anything', () => {
    const rows = [
      { id: 8, series_kind: 'custom', series_date: null, meeting_date: '2026-10-14', title: 'All-Hands', cancelled: false },
      { id: 9, series_kind: 'custom', series_date: null, meeting_date: '2026-10-14', title: 'Safety Briefing', cancelled: false },
    ]
    expect(deriveMeetings(HHH, rows, OCT).filter((m) => m.custom).map((m) => m.title).sort())
      .toEqual(['All-Hands', 'Safety Briefing'])
  })

  it('a one-off outside the window is not drawn', () => {
    const rows = [{ id: 10, series_kind: 'custom', series_date: null, meeting_date: '2026-12-01', title: 'Christmas', cancelled: false }]
    expect(deriveMeetings(HHH, rows, OCT).some((m) => m.overrideId === 10)).toBe(false)
  })

  it('tolerates junk rows without throwing', () => {
    const rows = [null, {}, { id: 11, series_kind: 'custom', meeting_date: '', cancelled: false }]
    expect(() => deriveMeetings(HHH, rows, OCT)).not.toThrow()
    expect(datesOf(deriveMeetings(HHH, rows, OCT), 'l10').length).toBe(4)
  })
})

describe('deriveMeetings — ordering', () => {
  it('comes back in day order so the calendar does not have to sort it', () => {
    const rows = [{ id: 12, series_kind: 'custom', series_date: null, meeting_date: '2026-10-01', title: 'Kickoff', cancelled: false }]
    const dates = deriveMeetings(HHH, rows, OCT).map((m) => m.date)
    expect(dates).toEqual([...dates].sort())
  })
})

describe('formatTime', () => {
  it('renders a 24h cadence time the way people read it', () => {
    expect(formatTime('08:30')).toBe('8:30 AM')
    expect(formatTime('13:05')).toBe('1:05 PM')
    expect(formatTime('00:15')).toBe('12:15 AM')
    expect(formatTime('12:00')).toBe('12:00 PM')
    expect(formatTime('09:00:00')).toBe('9:00 AM')
  })
  it('is blank rather than wrong on junk', () => {
    expect(formatTime('')).toBe('')
    expect(formatTime(null)).toBe('')
    expect(formatTime('nope')).toBe('')
    expect(formatTime('25:00')).toBe('')
  })
})

describe('cadenceSentence', () => {
  it('says what is set and nothing about what is not', () => {
    expect(cadenceSentence(HHH)).toBe('L10 every Monday at 8:30 AM · quarterly every 90 days')
  })
  it('is empty when no cadence exists, so the caller can say so', () => {
    expect(cadenceSentence({})).toBe('')
    expect(cadenceSentence(null)).toBe('')
  })
})
