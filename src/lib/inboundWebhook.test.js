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

import { isAutoReply, recipientKind } from './inboundWebhook'

describe('mail nobody wrote', () => {
  it('is caught by the RFC 3834 header whatever the subject says', () => {
    expect(isAutoReply('Re: Your estimate', { 'Auto-Submitted': 'auto-replied' })).toBe(true)
    expect(isAutoReply('Re: Your estimate', { 'auto-submitted': 'auto-generated' })).toBe(true)
    expect(isAutoReply('Re: Your estimate', { 'Auto-Submitted': 'no' })).toBe(false)
  })

  it('is caught by the Exchange and Gmail flavours', () => {
    expect(isAutoReply('Re: Your estimate', { 'X-Auto-Response-Suppress': 'All' })).toBe(true)
    expect(isAutoReply('Re: Your estimate', { Precedence: 'bulk' })).toBe(true)
    expect(isAutoReply('Re: Your estimate', { 'Content-Type': 'multipart/report; report-type=delivery-status' })).toBe(true)
  })

  it('is caught by subject when the client sends no header', () => {
    for (const s of ['Automatic reply: Your estimate', 'Out of Office', 'Re: Out of the office until Monday', 'Undeliverable: Your estimate', 'Mail delivery failed: returning message', 'Delivery Status Notification (Failure)', 'Auto: gone fishing']) {
      expect(isAutoReply(s, {})).toBe(true)
    }
  })

  it('leaves a real reply alone, including ones that mention being away', () => {
    expect(isAutoReply('Re: Your estimate from HHH', { 'Message-ID': '<x@y>' })).toBe(false)
    expect(isAutoReply("Re: EST-4567 — I'm out of office next week but yes, go ahead", {})).toBe(false)
    expect(isAutoReply('', null)).toBe(false)
  })
})

describe('what an address is allowed to do', () => {
  it('trusts only the tokened address to name an estimate', () => {
    expect(recipientKind('reply+a1b2c3@appsannex.com')).toBe('token')
    expect(recipientKind('REPLY+A1B2C3@APPSANNEX.COM')).toBe('token')
  })
  it('lets the sending address be matched by sender', () => {
    expect(recipientKind('estimates@appsannex.com')).toBe('estimates')
  })
  it('keeps everything else off estimates', () => {
    expect(recipientKind('invoices@appsannex.com')).toBe('other')
    expect(recipientKind('receipts@appsannex.com')).toBe('other')
    expect(recipientKind('noreply@appsannex.com')).toBe('other')
    expect(recipientKind('')).toBe('other')
    expect(recipientKind(null)).toBe('other')
  })
})

describe('the secret as it actually arrives', () => {
  it('verifies with a url-safe alphabet, quotes, and no padding', async () => {
    // Same key bytes, written the way a dashboard or a shell might hand them over.
    const keyBytes = randomBytes(24)
    const standard = 'whsec_' + keyBytes.toString('base64')
    const urlSafeUnpaddedQuoted = '"whsec_' + keyBytes.toString('base64url') + '"\n'
    const sig = `v1,${sign('msg_1', ts, body, standard)}`
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: ts, signature: sig }, body, urlSafeUnpaddedQuoted, now)
    expect(v).toEqual({ ok: true })
  })
})

describe('the prefix pasted twice', () => {
  it('still verifies', async () => {
    const sig = `v1,${sign('msg_1', ts, body)}`
    const v = await verifySvixSignature({ id: 'msg_1', timestamp: ts, signature: sig }, body, 'whsec_' + secret, now)
    expect(v).toEqual({ ok: true })
  })
})

import { readEmail } from './inboundWebhook'

describe('reading what each provider actually sends', () => {
  it('Resend email.received — the payload as delivered on 2026-09-11', () => {
    const resend = {
      created_at: '2026-09-11T20:38:26.000Z',
      type: 'email.received',
      data: {
        attachments: [], bcc: [], cc: [],
        created_at: '2026-09-11T20:38:27.969Z',
        email_id: 'b52bbf3e-09f8-4e7e-8795-36d13dce8d19',
        from: 'probe.4627@appsannex.com',
        message_id: '<010001a09231689f@email.amazonses.com>',
        received_for: ['estimates@appsannex.com'],
        subject: 'Re: ZZ TEST - loop test',
        to: ['estimates@appsannex.com'],
      },
    }
    const m = readEmail(resend)
    expect(m.from).toBe('probe.4627@appsannex.com')
    expect(m.to).toBe('estimates@appsannex.com')
    expect(m.allRecipients).toEqual(['estimates@appsannex.com'])
    expect(m.subject).toBe('Re: ZZ TEST - loop test')
    expect(m.body).toBe('')
  })

  it('Resend with a display name and a tokened reply address in cc', () => {
    const m = readEmail({ type: 'email.received', data: { from: 'Sylvia <sylvia@teamnsc.com>', to: ['office@customer.com'], cc: ['reply+abc123@appsannex.com'], subject: 'Re: estimate' } })
    expect(m.from).toBe('sylvia@teamnsc.com')
    expect(m.to).toBe('office@customer.com')
    expect(m.allRecipients).toEqual(['office@customer.com', 'reply+abc123@appsannex.com'])
  })

  it('Cloudflare / SendGrid shapes with address objects and an inline body', () => {
    const m = readEmail({ from: { address: 'A@B.com', name: 'A' }, to: [{ address: 'reply+t@appsannex.com' }], subject: 's', text: 'hello' })
    expect(m.from).toBe('a@b.com')
    expect(m.to).toBe('reply+t@appsannex.com')
    expect(m.body).toBe('hello')
  })

  it('a flat forwarder payload', () => {
    const m = readEmail({ from: 'x@y.com', to: 'estimates@appsannex.com', subject: 's', 'body-plain': 'hi' })
    expect(m.to).toBe('estimates@appsannex.com')
    expect(m.body).toBe('hi')
  })

  it('nothing at all', () => {
    expect(readEmail(null).from).toBe('')
    expect(readEmail({}).to).toBe('')
  })
})
