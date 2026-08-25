import { describe, it, expect } from 'vitest'
import {
  matchInboundToEstimate, normalizeEmail, isDistinctiveQuoteId, stripQuotedReply,
} from './inboundMatch'

// quote_id shapes taken from production: Q-ML6TFDNZ, ST-11, Q001, and 695 rows
// that are a bare number.
const q = (over = {}) => ({
  id: 1, company_id: 3, quote_id: 'Q-ML6TFDNZ', sent_to_email: 'jane@acme.com',
  status: 'Sent', last_sent_at: '2026-08-20T10:00:00Z', sent_date: null, ...over,
})

describe('reading the sender', () => {
  it('pulls the address out of a display name', () => {
    expect(normalizeEmail('Jane Doe <Jane@Acme.com>')).toBe('jane@acme.com')
    expect(normalizeEmail('  JANE@acme.com ')).toBe('jane@acme.com')
    expect(normalizeEmail(null)).toBe('')
  })
})

describe('which quote_ids are safe to find in free text', () => {
  it('trusts ids that carry a letter', () => {
    expect(isDistinctiveQuoteId('Q-ML6TFDNZ')).toBe(true)
    expect(isDistinctiveQuoteId('EST-MSF2UIQ3')).toBe(true)
    expect(isDistinctiveQuoteId('ST-11')).toBe(true)
  })

  it('refuses bare numbers', () => {
    // 695 production rows look like this. "123" turns up in prices, addresses
    // and dates, so matching on it would attach a reply to a stranger's job.
    expect(isDistinctiveQuoteId('123')).toBe(false)
    expect(isDistinctiveQuoteId('4562')).toBe(false)
    expect(isDistinctiveQuoteId('')).toBe(false)
    expect(isDistinctiveQuoteId(null)).toBe(false)
  })
})

describe('matching a reply to its estimate', () => {
  it('will not guess when the sender was never mailed', () => {
    // The alternative is attaching a stranger's email to somebody's estimate.
    const r = matchInboundToEstimate('nobody@else.com', 'Re: your estimate', [q()])
    expect(r.quote).toBe(null)
    expect(r.reason).toBe('none')
  })

  it('matches on the address we mailed, case-insensitively', () => {
    const r = matchInboundToEstimate('JANE@ACME.COM', 'Re: something', [q()])
    expect(r.quote.id).toBe(1)
    expect(r.reason).toBe('most_recent_open')
  })

  it('lets a distinctive id in the subject beat recency', () => {
    const older = q({ id: 1, quote_id: 'Q-OLDER1', last_sent_at: '2026-08-01T10:00:00Z' })
    const newer = q({ id: 2, quote_id: 'Q-NEWER2', last_sent_at: '2026-08-24T10:00:00Z' })
    const r = matchInboundToEstimate('jane@acme.com', 'Re: Estimate Q-OLDER1 from HHH', [older, newer])
    expect(r.quote.id).toBe(1)
    expect(r.reason).toBe('subject')
  })

  it('ignores a bare number in the subject', () => {
    // "Re: Estimate 123" must not beat recency — the number could be anything.
    const bare = q({ id: 1, quote_id: '123', last_sent_at: '2026-08-01T10:00:00Z' })
    const newer = q({ id: 2, quote_id: '456', last_sent_at: '2026-08-24T10:00:00Z' })
    const r = matchInboundToEstimate('jane@acme.com', 'Re: Estimate 123', [bare, newer])
    expect(r.quote.id).toBe(2)
    expect(r.reason).toBe('most_recent_open')
  })

  it('prefers a still-open estimate over a newer closed one', () => {
    // Someone replying after a win is almost always talking about the live one.
    const open = q({ id: 1, status: 'Sent', last_sent_at: '2026-08-01T10:00:00Z' })
    const won = q({ id: 2, status: 'Approved', last_sent_at: '2026-08-24T10:00:00Z' })
    expect(matchInboundToEstimate('jane@acme.com', '', [open, won]).quote.id).toBe(1)
  })

  it('falls back to the newest closed one when nothing is open', () => {
    const a = q({ id: 1, status: 'Approved', last_sent_at: '2026-08-01T10:00:00Z' })
    const b = q({ id: 2, status: 'Rejected', last_sent_at: '2026-08-24T10:00:00Z' })
    const r = matchInboundToEstimate('jane@acme.com', '', [a, b])
    expect(r.quote.id).toBe(2)
    expect(r.reason).toBe('most_recent')
  })

  it('uses sent_date when last_sent_at is missing', () => {
    const a = q({ id: 1, last_sent_at: null, sent_date: '2026-08-01T10:00:00Z' })
    const b = q({ id: 2, last_sent_at: null, sent_date: '2026-08-24T10:00:00Z' })
    expect(matchInboundToEstimate('jane@acme.com', '', [a, b]).quote.id).toBe(2)
  })

  it('survives an empty world', () => {
    expect(matchInboundToEstimate('jane@acme.com', 'hi', []).quote).toBe(null)
    expect(matchInboundToEstimate('', 'hi', [q()]).quote).toBe(null)
  })
})

describe('stripping the quoted history', () => {
  it('keeps only what the person actually wrote', () => {
    const body = 'Yes, go ahead — Tuesday works.\n\nOn Mon, 24 Aug 2026, HHH Services wrote:\n> Here is your estimate\n> Total: $4,000'
    expect(stripQuotedReply(body)).toBe('Yes, go ahead — Tuesday works.')
  })

  it('handles the Outlook header block', () => {
    const body = 'Looks good.\n\nFrom: HHH Services\nSent: Monday\nSubject: Estimate'
    expect(stripQuotedReply(body)).toBe('Looks good.')
  })

  it('drops a phone signature', () => {
    expect(stripQuotedReply('Approved!\n\nSent from my iPhone')).toBe('Approved!')
  })

  it('leaves a clean reply alone', () => {
    expect(stripQuotedReply('Can you do it next week?')).toBe('Can you do it next week?')
  })

  it('never returns null for empty input', () => {
    expect(stripQuotedReply(null)).toBe('')
    expect(stripQuotedReply('')).toBe('')
  })
})
