import { describe, it, expect } from 'vitest'
import { replyToken, replyAddress, parseReplyToken, tokenFromAddresses } from './replyToken'

const SECRET = 'test-secret-not-the-real-one'

describe('a reply address round-trips', () => {
  it('recovers the estimate id it was built from', async () => {
    const t = await replyToken(4620, SECRET)
    expect(await parseReplyToken(t, SECRET)).toBe(4620)
  })

  it('builds the full address on the PLATFORM domain', async () => {
    // Never the tenant's domain: tenants configure no DNS to send, so demanding
    // MX records before replies work would break every new customer's week.
    const a = await replyAddress(4620, SECRET, 'reply.appsannex.com')
    expect(a).toMatch(/^reply\+[a-z0-9]+@reply\.appsannex\.com$/)
  })

  it('survives a mail system lower-casing the local part', async () => {
    const t = await replyToken(99, SECRET)
    expect(await parseReplyToken(t.toUpperCase(), SECRET)).toBe(99)
  })
})

describe('what it refuses', () => {
  it('rejects a token signed with a different secret', async () => {
    const t = await replyToken(4620, SECRET)
    expect(await parseReplyToken(t, 'some-other-secret')).toBe(null)
  })

  it('rejects a tampered id', async () => {
    // The whole point: an unsigned id would let anyone write into any estimate
    // by counting upwards, since the From address is trivially forged.
    const t = await replyToken(4620, SECRET)
    const forged = '1' + t.slice(1)
    expect(await parseReplyToken(forged, SECRET)).toBe(null)
  })

  it('rejects a tampered signature', async () => {
    const t = await replyToken(4620, SECRET)
    const bad = t.slice(0, -1) + (t.slice(-1) === 'a' ? 'b' : 'a')
    expect(await parseReplyToken(bad, SECRET)).toBe(null)
  })

  it('returns null for junk rather than throwing', async () => {
    // Bots probe inbound domains. A throw here would 500 and make the provider
    // retry the same rubbish for days.
    for (const junk of ['', null, undefined, 'x', 'notatoken', '@@@']) {
      expect(await parseReplyToken(junk, SECRET)).toBe(null)
    }
  })

  it('gives different ids different tokens', async () => {
    expect(await replyToken(1, SECRET)).not.toBe(await replyToken(2, SECRET))
  })
})

describe('finding the token on an inbound email', () => {
  it('picks it out of the To list', () => {
    expect(tokenFromAddresses(['reply+3fabc123de@reply.appsannex.com'])).toBe('3fabc123de')
  })

  it('finds it among several recipients', () => {
    const got = tokenFromAddresses(['someone@else.com', 'Reply+ABC123@Reply.AppsAnnex.com'])
    expect(got).toBe('abc123')
  })

  it('returns null when nothing carries one', () => {
    expect(tokenFromAddresses(['estimates@appsannex.com'])).toBe(null)
    expect(tokenFromAddresses([])).toBe(null)
    expect(tokenFromAddresses(null)).toBe(null)
  })
})

// ── feedback tickets ──────────────────────────────────────────────────────
// A ticket answer goes out with reply_to = feedback+<token>@domain. The
// inbound router must get the ticket back from that address and nothing else
// — not from a forged one, not from an estimate token, not from noreply@.
import { feedbackReplyAddress, parseFeedbackToken, feedbackTokenFromAddresses } from './replyToken.js'
import { recipientKind } from './inboundWebhook.js'

const FB_SECRET = 'test-secret-not-real'
const TICKET = 'ac100312-d4a5-4c2d-8264-1ffdb7c56d7e'

describe('feedback reply token', () => {
  it('round-trips the ticket id through the address', async () => {
    const addr = await feedbackReplyAddress(TICKET, FB_SECRET, 'appsannex.com')
    expect(addr).toMatch(/^feedback\+[0-9a-f]{42}@appsannex\.com$/)
    const token = feedbackTokenFromAddresses(['Someone <x@y.com>', addr])
    expect(await parseFeedbackToken(token, FB_SECRET)).toBe(TICKET)
  })

  it('is case-insensitive — mail systems may not preserve the local part', async () => {
    const addr = (await feedbackReplyAddress(TICKET, FB_SECRET, 'appsannex.com')).toUpperCase()
    expect(await parseFeedbackToken(feedbackTokenFromAddresses([addr]), FB_SECRET)).toBe(TICKET)
  })

  it('refuses a token signed with another secret, or tampered with', async () => {
    const addr = await feedbackReplyAddress(TICKET, FB_SECRET, 'appsannex.com')
    const token = feedbackTokenFromAddresses([addr])
    expect(await parseFeedbackToken(token, 'other-secret')).toBeNull()
    const flipped = token.slice(0, 5) + (token[5] === '0' ? '1' : '0') + token.slice(6)
    expect(await parseFeedbackToken(flipped, FB_SECRET)).toBeNull()
    expect(await parseFeedbackToken('', FB_SECRET)).toBeNull()
    expect(await parseFeedbackToken(null, FB_SECRET)).toBeNull()
  })

  it('an estimate token can never verify as a ticket, and vice versa', async () => {
    const est = await replyAddress(4242, FB_SECRET, 'appsannex.com')
    expect(feedbackTokenFromAddresses([est])).toBeNull()
    expect(await parseFeedbackToken(tokenFromAddresses([est]), FB_SECRET)).toBeNull()
    const fb = await feedbackReplyAddress(TICKET, FB_SECRET, 'appsannex.com')
    expect(tokenFromAddresses([fb])).toBeNull()
    expect(await parseReplyToken(feedbackTokenFromAddresses([fb]), FB_SECRET)).toBeNull()
  })

  it('refuses to build an address for something that is not a uuid', async () => {
    await expect(feedbackReplyAddress('4242', FB_SECRET, 'appsannex.com')).rejects.toThrow()
  })

  it('the router tells the kinds apart from the recipient alone', async () => {
    expect(recipientKind(await feedbackReplyAddress(TICKET, FB_SECRET, 'appsannex.com'))).toBe('feedback')
    expect(recipientKind(await replyAddress(4242, FB_SECRET, 'appsannex.com'))).toBe('token')
    expect(recipientKind('estimates@appsannex.com')).toBe('estimates')
    expect(recipientKind('noreply@appsannex.com')).toBe('other')
  })
})
