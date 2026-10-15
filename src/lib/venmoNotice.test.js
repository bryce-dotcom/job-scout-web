import { describe, it, expect } from 'vitest'
import { isVenmoSender, parseVenmoNotice, matchNoticeToInvoice, noticeRow } from './venmoNotice'
// The edge function has its own copy, because a browser module and a Deno
// module cannot import each other. The copy is only safe if something fails
// when they drift — so the same cases run through both, below.
import * as deno from '../../supabase/functions/_shared/venmoNotice.ts'

const notice = (over = {}) => ({
  from: 'venmo@venmo.com',
  subject: 'Jane Smith paid you $120.00',
  text: '',
  ...over,
})

describe('it has to be from Venmo', () => {
  it('accepts Venmo and its sending subdomains', () => {
    expect(isVenmoSender('venmo@venmo.com')).toBe(true)
    expect(isVenmoSender('Venmo <no-reply@email.venmo.com>')).toBe(true)
  })

  it('refuses a lookalike domain', () => {
    // The whole feature creates money records, so a convincing subject line
    // from venmo.com.scam.io must not be enough.
    expect(isVenmoSender('no-reply@venmo.com.scam.io')).toBe(false)
    expect(isVenmoSender('no-reply@notvenmo.com')).toBe(false)
    expect(isVenmoSender('')).toBe(false)
    expect(isVenmoSender(null)).toBe(false)
  })

  it('parses nothing at all from a stranger', () => {
    expect(parseVenmoNotice(notice({ from: 'someone@gmail.com' }))).toBe(null)
  })
})

describe('reading the notice', () => {
  it('takes the payer and the amount from the subject', () => {
    expect(parseVenmoNotice(notice())).toMatchObject({ payer: 'Jane Smith', amount: 120 })
  })

  it('handles thousands and cents', () => {
    expect(parseVenmoNotice(notice({ subject: 'Bob Vance paid you $1,250.75' })).amount).toBe(1250.75)
  })

  it('falls back to the body when the subject is not the usual shape', () => {
    const n = parseVenmoNotice(notice({
      subject: 'You have a new payment',
      text: 'Good news!\nJane Smith paid you $80.00\nNote: driveway',
    }))
    expect(n).toMatchObject({ payer: 'Jane Smith', amount: 80 })
  })

  it('picks up the note the payer typed', () => {
    const n = parseVenmoNotice(notice({ text: 'Note: windows INV-1042' }))
    expect(n.note).toBe('windows INV-1042')
  })

  it('returns nothing rather than guessing', () => {
    expect(parseVenmoNotice(notice({ subject: 'Your weekly summary', text: '' }))).toBe(null)
    expect(parseVenmoNotice(notice({ subject: 'Jane paid you $0.00' }))).toBe(null)
    expect(parseVenmoNotice({})).toBe(null)
  })
})

describe('which invoice it is for', () => {
  const invoices = [
    { id: 1, invoice_id: 'INV-1042', amount: 300, balance_due: 300, payment_status: 'Pending' },
    { id: 2, invoice_id: 'INV-1043', amount: 120, balance_due: 120, payment_status: 'Pending' },
    { id: 3, invoice_id: 'INV-1044', amount: 120, balance_due: 120, payment_status: 'Pending' },
    { id: 4, invoice_id: 'INV-1045', amount: 500, balance_due: 500, payment_status: 'Paid' },
  ]

  it('believes an invoice number the payer typed', () => {
    const m = matchNoticeToInvoice({ amount: 300, note: 'for INV-1042 thanks' }, invoices)
    expect(m.invoice.id).toBe(1)
    expect(m.confident).toBe(true)
  })

  it('matches on the amount when exactly one invoice is for it', () => {
    const m = matchNoticeToInvoice({ amount: 300 }, invoices)
    expect(m.invoice.id).toBe(1)
  })

  it('refuses to choose when two invoices are for the same amount', () => {
    // Guessing here silently marks the wrong customer paid.
    const m = matchNoticeToInvoice({ amount: 120 }, invoices)
    expect(m.invoice).toBe(null)
    expect(m.confident).toBe(false)
    expect(m.why).toMatch(/2 open invoices/)
  })

  it('ignores invoices that are already paid', () => {
    const m = matchNoticeToInvoice({ amount: 500 }, invoices)
    expect(m.invoice).toBe(null)
    expect(m.why).toMatch(/no open invoice/)
  })

  it('says plainly when nothing matches', () => {
    expect(matchNoticeToInvoice({ amount: 7.5 }, invoices).why).toMatch(/no open invoice/)
    expect(matchNoticeToInvoice(null, invoices)).toBe(null)
  })
})

describe('what gets filed', () => {
  it('is a notice, never a payment', () => {
    // Nothing becomes money until a person says which invoice it belongs to.
    const row = noticeRow({ companyId: 3, notice: parseVenmoNotice(notice()), raw: { subject: 'x' } })
    expect(row).toMatchObject({ company_id: 3, payer_name: 'Jane Smith', amount: 120, source: 'venmo_email' })
    expect(Object.keys(row)).not.toContain('invoice_id')
  })

  it('is nothing when there was nothing to read', () => {
    expect(noticeRow({ companyId: 3, notice: null })).toBe(null)
  })
})

describe('the edge-function twin says exactly the same thing', () => {
  // src/lib is read by Books; _shared is what actually files the notice from
  // the inbound email. If they disagree, the screen and the record disagree.
  const cases = [
    { from: 'venmo@venmo.com', subject: 'Jane Smith paid you $120.00', text: 'Note: windows INV-1042' },
    { from: 'Venmo <no-reply@email.venmo.com>', subject: 'Bob Vance paid you $1,250.75', text: '' },
    { from: 'no-reply@venmo.com.scam.io', subject: 'Jane Smith paid you $120.00', text: '' },
    { from: 'venmo@venmo.com', subject: 'Your weekly summary', text: 'nothing here' },
    { from: 'venmo@venmo.com', subject: 'You have a new payment', text: 'Jane Smith paid you $80.00' },
    { from: '', subject: '', text: '' },
  ]

  it('parses every case identically', () => {
    for (const c of cases) {
      expect(deno.parseVenmoNotice(c), JSON.stringify(c)).toEqual(parseVenmoNotice(c))
      expect(deno.isVenmoSender(c.from)).toBe(isVenmoSender(c.from))
    }
  })

  it('files an identical row', () => {
    const n = parseVenmoNotice(cases[0])
    const a = noticeRow({ companyId: 3, notice: n, raw: { subject: 'x', receivedAt: '2026-10-15T00:00:00Z' } })
    const b = deno.noticeRow({ companyId: 3, notice: deno.parseVenmoNotice(cases[0]), raw: { subject: 'x', receivedAt: '2026-10-15T00:00:00Z' } })
    expect(b).toEqual(a)
  })

  it('matches an invoice identically', () => {
    const invoices = [{ id: 1, invoice_id: 'INV-1042', amount: 120, balance_due: 120, payment_status: 'Pending' }]
    const n = { amount: 120, note: 'for INV-1042' }
    expect(deno.matchNoticeToInvoice(n, invoices)).toEqual(matchNoticeToInvoice(n, invoices))
  })
})
