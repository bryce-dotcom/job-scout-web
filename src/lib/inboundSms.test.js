import { describe, it, expect } from 'vitest'
import {
  INBOUND_TYPE, EMPTY_TWIML, NO_MATCH,
  phoneKey, samePhone, keywordOf, pickMatch, inboundLogRow, inboundNotification,
  inboundRecipients, signatureBase, safeEqual,
} from '../../supabase/functions/_shared/inboundSms.ts'

// JobScout could send a text and never receive one. A customer replying to an
// invoice reminder got silence: the number's webhook pointed at Twilio's demo
// autoresponder, and once the number joined a Messaging Service the service's
// inbound URL took over and was null.

describe('matching a number to a person', () => {
  it('compares the shapes this app actually stores', () => {
    // customers:'4357904777'  companies:'(801) 999-8430'  twilio:'+18014044848'
    expect(phoneKey('4357904777')).toBe('4357904777')
    expect(phoneKey('(801) 999-8430')).toBe('8019998430')
    expect(phoneKey('+18014044848')).toBe('8014044848')
    expect(phoneKey('1-801-404-4848')).toBe('8014044848')
  })

  it('treats those as the same line', () => {
    expect(samePhone('+18019998430', '(801) 999-8430')).toBe(true)
    expect(samePhone('8019998430', '801.999.8430')).toBe(true)
    expect(samePhone('8019998430', '8019998431')).toBe(false)
  })

  it('refuses anything too short to be a number rather than half-matching', () => {
    expect(phoneKey('5551234')).toBe(null)
    expect(phoneKey('')).toBe(null)
    expect(phoneKey(null)).toBe(null)
    expect(samePhone('5551234', '5551234')).toBe(false)
  })
})

describe('which record the number belongs to', () => {
  const customer = { kind: 'customer', match_id: 7, match_name: 'Dave Ruiz', salesperson_id: 3 }
  const lead = { kind: 'lead', match_id: 9, match_name: 'Dave R', salesperson_id: 4 }
  const employee = { kind: 'employee', match_id: 2, match_name: 'Marco', salesperson_id: null }

  it('prefers the customer, because a lead that converted is still on file', () => {
    expect(pickMatch([lead, customer]).kind).toBe('customer')
    expect(pickMatch([lead, customer]).id).toBe(7)
  })

  it('prefers a lead over an employee', () => {
    expect(pickMatch([employee, lead]).kind).toBe('lead')
  })

  it('takes an employee when that is all there is', () => {
    expect(pickMatch([employee])).toEqual({ kind: 'employee', id: 2, name: 'Marco', salespersonId: null })
  })

  it('returns no match rather than inventing one', () => {
    expect(pickMatch([])).toEqual(NO_MATCH)
    expect(pickMatch()).toEqual(NO_MATCH)
  })
})

describe('carrier keywords', () => {
  it('recognises the ways people say stop', () => {
    expect(keywordOf('STOP')).toBe('stop')
    expect(keywordOf('  stop  ')).toBe('stop')
    expect(keywordOf('Unsubscribe')).toBe('stop')
    expect(keywordOf('cancel')).toBe('stop')
    expect(keywordOf('STOP.')).toBe('stop')
  })

  it('recognises start and help', () => {
    expect(keywordOf('start')).toBe('start')
    expect(keywordOf('YES')).toBe('start')
    expect(keywordOf('help')).toBe('help')
  })

  it('does not read an ordinary sentence as a keyword', () => {
    // "stop by tomorrow" is a message, not an opt-out, and clearing someone's
    // consent because they used the word would be worse than missing it.
    expect(keywordOf('stop by tomorrow at 9')).toBe(null)
    expect(keywordOf('can you cancel the Tuesday visit?')).toBe(null)
    expect(keywordOf('')).toBe(null)
    expect(keywordOf(null)).toBe(null)
  })
})

describe('the row it writes', () => {
  const base = { companyId: 3, from: '+18014044848', body: 'Can you come Thursday instead?', messageSid: 'SM123', now: new Date('2026-10-05T19:00:00Z') }

  it('is marked as arriving, not sent', () => {
    const row = inboundLogRow(base)
    expect(row.direction).toBe('in')
    expect(row.type).toBe('sms')
    expect(row.status).toBe('received')
    expect(row.sent_date).toBe('2026-10-05')
  })

  it('carries Twilio message id, so a webhook retry is a no-op', () => {
    expect(inboundLogRow(base).communication_id).toBe('SM123')
  })

  it('files it against the customer when we know who it is', () => {
    const row = inboundLogRow({ ...base, match: { kind: 'customer', id: 7, name: 'Dave', salespersonId: 3 } })
    expect(row.customer_id).toBe(7)
    expect(row.employee_id).toBe(null)
  })

  it('files an employee text against the employee', () => {
    const row = inboundLogRow({ ...base, match: { kind: 'employee', id: 2, name: 'Marco', salespersonId: null } })
    expect(row.employee_id).toBe(2)
    expect(row.customer_id).toBe(null)
  })

  it('still records an unrecognised number', () => {
    const row = inboundLogRow(base)
    expect(row.customer_id).toBe(null)
    expect(row.recipient).toBe('+18014044848')
    expect(row.response).toBe('Can you come Thursday instead?')
  })

  it('does not let a long message blow the column', () => {
    expect(String(inboundLogRow({ ...base, body: 'x'.repeat(5000) }).response)).toHaveLength(1000)
  })
})

describe('who hears about it and what it says', () => {
  const base = { from: '+18014044848', body: 'Can you come Thursday instead?', messageSid: 'SM123' }

  it('names the person when we know them', () => {
    const n = inboundNotification({ ...base, match: { kind: 'customer', id: 7, name: 'Dave Ruiz', salespersonId: 3 } })
    expect(n.title).toBe('Text from Dave Ruiz')
    expect(n.route).toBe('/customers/7')
    expect(n.type).toBe(INBOUND_TYPE)
  })

  it('falls back to the number, and still raises one', () => {
    // "somebody texted and we don't know who" is exactly what a person needs
    // to see — dropping it is how the silence started.
    const n = inboundNotification(base)
    expect(n.title).toBe('Text from +18014044848')
    expect(n.route).toBe('/communications')
  })

  it('shortens a long text rather than filling the bell with it', () => {
    const n = inboundNotification({ ...base, body: 'y'.repeat(400) })
    expect(n.message.length).toBeLessThanOrEqual(160)
    expect(n.message.endsWith('…')).toBe(true)
  })

  it('says something even for an empty body', () => {
    expect(inboundNotification({ ...base, body: '   ' }).message).toBe('(no message)')
  })

  it('dedupes on the message id, so a Twilio retry cannot double-notify', () => {
    expect(inboundNotification(base).dedupe_key).toBe(`${INBOUND_TYPE}:SM123`)
  })

  it('goes to the rep whose customer it is, not the whole office', () => {
    expect(inboundRecipients({ kind: 'customer', id: 7, name: 'Dave', salespersonId: 3 }, [1, 2])).toEqual([3])
  })

  it('goes to the managers when nobody owns it', () => {
    expect(inboundRecipients(NO_MATCH, [1, 2, 2])).toEqual([1, 2])
    expect(inboundRecipients(undefined, [])).toEqual([])
  })
})

describe('proving the request really came from Twilio', () => {
  // The endpoint is public — Twilio cannot send a Supabase JWT — so the
  // signature is the only thing between it and anyone who can POST a form.
  it('builds the base string Twilio documents: url, then params sorted by name', () => {
    const base = signatureBase('https://x.test/inbound-sms', { To: '+1222', From: '+1111', Body: 'hi' })
    expect(base).toBe('https://x.test/inbound-smsBodyhiFrom+1111To+1222')
  })

  it('is just the url when there are no parameters', () => {
    expect(signatureBase('https://x.test/a')).toBe('https://x.test/a')
  })

  it('changes when any value changes', () => {
    const a = signatureBase('https://x.test/a', { Body: 'hi' })
    const b = signatureBase('https://x.test/a', { Body: 'hj' })
    expect(a).not.toBe(b)
  })

  it('compares without leaking length-by-length timing', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'ab')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('what Twilio gets back', () => {
  it('is an empty TwiML document, so Twilio sends no reply of its own', () => {
    expect(EMPTY_TWIML).toContain('<Response></Response>')
    expect(EMPTY_TWIML).not.toContain('<Message>')
  })
})
