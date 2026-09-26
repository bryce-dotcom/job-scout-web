import { describe, it, expect } from 'vitest'
import { bidsInboxToken, bidsInboxAddress, parseBidsToken, bidsTokenFromAddresses, replyToken, feedbackReplyToken } from './replyToken'
import { recipientKind, isAutoReply } from './inboundWebhook'

// Sal's inbox address: bids+<token>@appsannex.com names a COMPANY. The same
// signed-token discipline as estimate replies, in its own namespace.

const SECRET = 'test-secret-not-the-real-one'

describe("Sal's address round-trips", () => {
  it('recovers the company it was built for', async () => {
    const t = await bidsInboxToken(25, SECRET)
    expect(await parseBidsToken(t, SECRET)).toBe(25)
  })

  it('is on the platform domain and the router knows it', async () => {
    const a = await bidsInboxAddress(25, SECRET, 'appsannex.com')
    expect(a).toMatch(/^bids\+[a-z0-9]+@appsannex\.com$/)
    expect(recipientKind(a)).toBe('bids')
    expect(recipientKind(a.toUpperCase())).toBe('bids')
  })

  it('is found in To or Cc, whichever the portal used', async () => {
    const a = await bidsInboxAddress(25, SECRET, 'appsannex.com')
    const t = bidsTokenFromAddresses(['procurement@vendor.example', `Sal <${a}>`])
    expect(await parseBidsToken(t, SECRET)).toBe(25)
  })
})

describe('what it refuses', () => {
  it('rejects a tampered company id', async () => {
    // The point: an unsigned id would let anyone fill any tenant's inbox by
    // counting upwards, since From is trivially forged.
    const t = await bidsInboxToken(25, SECRET)
    expect(await parseBidsToken('z' + t.slice(1), SECRET)).toBe(null)
  })

  it('rejects a different secret', async () => {
    const t = await bidsInboxToken(25, SECRET)
    expect(await parseBidsToken(t, 'other')).toBe(null)
  })

  it('never verifies an estimate or ticket token as a company', async () => {
    // Namespaced messages: the three token kinds cannot be swapped.
    const est = await replyToken(25, SECRET)
    expect(await parseBidsToken(est, SECRET)).toBe(null)
    const fb = await feedbackReplyToken('0f8fad5b-d9cb-469f-a165-70867728950e', SECRET)
    expect(await parseBidsToken(fb, SECRET)).toBe(null)
  })

  it('refuses to build an address for a non-company', async () => {
    await expect(bidsInboxAddress('abc', SECRET, 'appsannex.com')).rejects.toThrow()
    await expect(bidsInboxAddress(0, SECRET, 'appsannex.com')).rejects.toThrow()
  })
})

describe('portal alerts look like auto-replies', () => {
  // Bonfire, BidNet and DemandStar send with Auto-Submitted: auto-generated
  // and Precedence: bulk. The estimate path must keep dropping those; the
  // receiver routes bids+ mail BEFORE that filter, which is why the filter
  // itself stays strict here.
  it('the filter still flags them, so the receiver must route bids first', () => {
    expect(isAutoReply('New opportunity: Lorin Farr Park LED Retrofit', { 'Auto-Submitted': 'auto-generated' })).toBe(true)
    expect(isAutoReply('Bid Notification', { Precedence: 'bulk' })).toBe(true)
  })
})
