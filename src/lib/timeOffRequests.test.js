import { describe, it, expect } from 'vitest'
import { isPast, daysOverdue, splitPendingRequests } from './timeOffRequests'

// The real backlog on HHH: nine pending, eight of them already gone by.
const NOW = new Date('2026-08-19T12:00:00')
const req = (start, end, status = 'pending') => ({ start_date: start, end_date: end, status })

describe('a request whose dates have gone by', () => {
  it('is past once its last day is over', () => {
    expect(isPast(req('2026-01-13', '2026-01-13'), NOW)).toBe(true)
    expect(isPast(req('2026-06-23', '2026-06-27'), NOW)).toBe(true)
  })

  it('is not past on its final day — someone is off TODAY', () => {
    expect(isPast(req('2026-08-19', '2026-08-19'), NOW)).toBe(false)
  })

  it('is not past when it spans today', () => {
    expect(isPast(req('2026-08-17', '2026-08-25'), NOW)).toBe(false)
  })

  it('is not past when it is still ahead', () => {
    expect(isPast(req('2026-08-31', '2026-09-06'), NOW)).toBe(false)
  })

  it('uses start_date when there is no end', () => {
    expect(isPast({ start_date: '2026-01-13', status: 'pending' }, NOW)).toBe(true)
  })

  it('never calls a request with no dates past — that would hide it', () => {
    expect(isPast({ status: 'pending' }, NOW)).toBe(false)
    expect(isPast(null, NOW)).toBe(false)
  })
})

describe('how late it is', () => {
  it('counts whole days since the last day', () => {
    expect(daysOverdue(req('2026-08-07', '2026-08-07'), NOW)).toBe(11)
  })

  it('is 0 for anything still ahead', () => {
    expect(daysOverdue(req('2026-08-31', '2026-09-06'), NOW)).toBe(0)
  })
})

describe('splitting the queue', () => {
  const all = [
    req('2026-01-13', '2026-01-13'),
    req('2026-08-31', '2026-09-06'),
    req('2026-06-23', '2026-06-27'),
    req('2026-08-07', '2026-08-07'),
    req('2026-05-01', '2026-05-02', 'approved'),
  ]

  it('keeps only pending ones', () => {
    const { upcoming, past } = splitPendingRequests(all, NOW)
    expect(upcoming.length + past.length).toBe(4)
  })

  it('puts what is still ahead in upcoming', () => {
    expect(splitPendingRequests(all, NOW).upcoming.map(r => r.start_date)).toEqual(['2026-08-31'])
  })

  it('orders the backlog longest-waiting first', () => {
    expect(splitPendingRequests(all, NOW).past.map(r => r.start_date))
      .toEqual(['2026-01-13', '2026-06-23', '2026-08-07'])
  })

  it('hides nothing — every pending request lands in one list or the other', () => {
    const { upcoming, past } = splitPendingRequests(all, NOW)
    const pendingCount = all.filter(r => r.status === 'pending').length
    expect(upcoming.length + past.length).toBe(pendingCount)
  })

  it('survives an empty or missing list', () => {
    expect(splitPendingRequests()).toEqual({ upcoming: [], past: [] })
  })
})
