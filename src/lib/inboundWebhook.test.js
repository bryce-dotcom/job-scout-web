import { describe, it, expect } from 'vitest'
import { createHmac, randomBytes } from 'node:crypto'
// Explicit, not ambient: the guard's no-undef pass does not know Node globals,
// and this one line is what stood between main and a green build.
import { Buffer } from 'node:buffer'

import { verifySvixSignature, htmlToText, SVIX_TOLERANCE_SEC } from './inboundWebhook'

// Signs the way Svix's own reference code does (docs.svix.com, "manual
// verification"), so a pass here means Resend's real headers will verify.
const secret = 'whsec_' + randomBytes(24).toString('base64')
function sign(id, ts, body, sec = secret) {
  const key = Buffer.from(sec.split('_')[1], 'base64')
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
}

const body = JSON.stringify({ type: 'email.received', data: { email_id: 'abc', from: 'x@y.com', to: ['reply+t@reply.appsannex.com'] } })
const now = 1_760_000_000_000
const ts = String(Math.floor(now / 1000))

describe('a genuine Resend webhook verifies', () => {
  it('accepts the reference signature', async () => {
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: ts, signature: `v1,${sign('msg_1', ts, body)}` }, body, secret, now)
    expect(v).toEqual({ ok: true })
  })

  it('accepts when the good signature is one of several (key rotation)', async () => {
    const sig = `v1,${sign('msg_1', ts, body, 'whsec_' + randomBytes(24).toString('base64'))} v1,${sign('msg_1', ts, body)}`
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: ts, signature: sig }, body, secret, now)
    expect(v.ok).toBe(true)
  })

  it('tolerates clock drift inside the window', async () => {
    const drifted = String(Math.floor(now / 1000) - (SVIX_TOLERANCE_SEC - 5))
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: drifted, signature: `v1,${sign('msg_1', drifted, body)}` }, body, secret, now)
    expect(v.ok).toBe(true)
  })
})

describe('what it refuses', () => {
  it('a body that was altered after signing', async () => {
    const tampered = body.replace('x@y.com', 'attacker@evil.com')
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: ts, signature: `v1,${sign('msg_1', ts, body)}` }, tampered, secret, now)
    expect(v).toEqual({ ok: false, reason: 'signature mismatch' })
  })

  it('a signature made with a different secret', async () => {
    const other = 'whsec_' + randomBytes(24).toString('base64')
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: ts, signature: `v1,${sign('msg_1', ts, body, other)}` }, body, secret, now)
    expect(v.ok).toBe(false)
  })

  it('a replay from outside the tolerance window', async () => {
    const old = String(Math.floor(now / 1000) - SVIX_TOLERANCE_SEC - 1)
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: old, signature: `v1,${sign('msg_1', old, body)}` }, body, secret, now)
    expect(v).toEqual({ ok: false, reason: 'timestamp outside tolerance' })
  })

  it('a request with no svix headers at all', async () => {
    const v = await verifySvixSignature({ id: null, timestamp: null, signature: null }, body, secret, now)
    expect(v).toEqual({ ok: false, reason: 'missing svix headers' })
  })

  it('a secret that is not base64', async () => {
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: ts, signature: 'v1,abc' }, body, 'whsec_***not*base64***', now)
    expect(v.ok).toBe(false)
  })
})

describe('reading an HTML-only reply', () => {
  it('keeps the words and the line breaks, drops the markup', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><div>Yes, go ahead.</div><p>Can you start <b>Monday</b>?</p><br>Thanks,<br>Sylvia</body></html>'
    expect(htmlToText(html)).toBe('Yes, go ahead.\nCan you start Monday?\n\nThanks,\nSylvia')
  })

  it('decodes the entities Outlook leaves behind', () => {
    expect(htmlToText('<p>Price&nbsp;is &lt; $5k &amp; that&#39;s fine &quot;ok&quot;</p>')).toBe("Price is < $5k & that's fine \"ok\"")
  })

  it('is empty for nothing', () => {
    expect(htmlToText('')).toBe('')
    expect(htmlToText(null)).toBe('')
  })
})
