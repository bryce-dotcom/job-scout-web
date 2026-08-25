import { describe, it, expect } from 'vitest'
import { estimateCommsBadge, leadCommsBadge, QUIET_AFTER_DAYS } from './estimateComms'

const NOW = Date.parse('2026-08-25T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString()
const quote = (over = {}) => ({ id: 1, last_sent_at: daysAgo(1), status: 'Sent', followup_count: 0, ...over })

describe('what the card says', () => {
  it('says nothing about an estimate that was never sent', () => {
    // A badge here would be noise on every draft on the board.
    expect(estimateCommsBadge(quote({ last_sent_at: null, sent_date: null }), { now: NOW })).toBe(null)
    expect(estimateCommsBadge(null, { now: NOW })).toBe(null)
  })

  it('shows Sent for something that just went out', () => {
    const b = estimateCommsBadge(quote({ last_sent_at: daysAgo(0) }), { now: NOW })
    expect(b.id).toBe('sent')
    expect(b.title).toBe('Sent today')
  })

  it('turns quiet once it has been ignored for a week', () => {
    expect(estimateCommsBadge(quote({ last_sent_at: daysAgo(QUIET_AFTER_DAYS) }), { now: NOW }).id).toBe('quiet')
    expect(estimateCommsBadge(quote({ last_sent_at: daysAgo(QUIET_AFTER_DAYS - 1) }), { now: NOW }).id).toBe('sent')
  })

  it('shows how many times it has been chased', () => {
    const b = estimateCommsBadge(quote({ followup_count: 2, last_sent_at: daysAgo(10) }), { now: NOW })
    expect(b.id).toBe('chasing')
    expect(b.count).toBe(2)
    expect(b.title).toContain('2 follow-ups')
  })

  it('flags a bounce, because nobody read anything', () => {
    const b = estimateCommsBadge(quote({ email_status: 'bounced' }), { now: NOW })
    expect(b.id).toBe('bounced')
    expect(b.title).toContain('address')
  })

  it('puts a reply above everything else', () => {
    // A person waiting on an answer outranks a bounce on an earlier send and
    // any number of follow-ups.
    const b = estimateCommsBadge(
      quote({ email_status: 'bounced', followup_count: 3 }),
      { unreadReplies: 1, now: NOW },
    )
    expect(b.id).toBe('replied')
    expect(b.title).toContain('1 unread reply')
  })

  it('counts multiple replies in words a person reads', () => {
    const b = estimateCommsBadge(quote(), { unreadReplies: 3, now: NOW })
    expect(b.count).toBe(3)
    expect(b.title).toContain('3 unread replies')
  })

  it('falls back to sent_date when last_sent_at is missing', () => {
    const b = estimateCommsBadge({ id: 1, last_sent_at: null, sent_date: daysAgo(2) }, { now: NOW })
    expect(b.id).toBe('sent')
  })
})

describe('a lead with several estimates', () => {
  it('surfaces the one that most needs the rep', () => {
    // Otherwise a replied-to estimate hides behind a freshly sent one.
    const quiet = quote({ id: 1, last_sent_at: daysAgo(20) })
    const fresh = quote({ id: 2, last_sent_at: daysAgo(0) })
    const b = leadCommsBadge([quiet, fresh], { 1: 2 }, NOW)
    expect(b.id).toBe('replied')
    expect(b.count).toBe(2)
  })

  it('ignores estimates that were never sent', () => {
    const b = leadCommsBadge([{ id: 1, last_sent_at: null }, quote({ id: 2 })], {}, NOW)
    expect(b.id).toBe('sent')
  })

  it('returns nothing when no estimate has gone out', () => {
    expect(leadCommsBadge([{ id: 1, last_sent_at: null }], {}, NOW)).toBe(null)
    expect(leadCommsBadge([], {}, NOW)).toBe(null)
    expect(leadCommsBadge(null, {}, NOW)).toBe(null)
  })
})
