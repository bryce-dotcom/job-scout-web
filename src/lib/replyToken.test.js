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
