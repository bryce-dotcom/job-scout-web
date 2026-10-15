import { describe, it, expect } from 'vitest'
import { segments, invoiceLink, invoiceTextBody, textInvoiceProblem, textInvoicePreview } from './invoiceText'

const company = { company_name: 'HHH Services' }
const invoice = { invoice_id: 'INV-1042', portal_token: 'abc123' }

describe('the message', () => {
  it('names the business, the invoice and what is owed, then one link', () => {
    const body = invoiceTextBody({ company, invoice, amountDue: 1250.5, link: 'https://x.test/portal/abc123' })
    expect(body).toBe('HHH Services: invoice INV-1042 for $1,250.50. View and pay: https://x.test/portal/abc123')
  })

  it('names the business first, so an unknown number is not a scam', () => {
    expect(invoiceTextBody({ company, invoice, amountDue: 10, link: 'l' }).startsWith('HHH Services:')).toBe(true)
  })

  it('copes when the invoice has no number or amount yet', () => {
    expect(invoiceTextBody({ company, invoice: {}, link: 'l' })).toBe('HHH Services: your invoice. View and pay: l')
  })

  it('says nothing about a link it does not have', () => {
    expect(invoiceTextBody({ company, invoice, amountDue: 10 })).toBe('HHH Services: invoice INV-1042 for $10.00.')
  })
})

describe('what it costs to send', () => {
  it('counts one segment for a short plain message', () => {
    expect(segments('HHH Services: invoice INV-1042 for $250.00. View and pay: https://x.test/portal/abc')).toBe(1)
  })

  it('counts two once it passes 160 characters', () => {
    expect(segments('a'.repeat(161))).toBe(2)
    expect(segments('a'.repeat(160))).toBe(1)
  })

  it('halves the room as soon as one character is not GSM-7', () => {
    // An emoji or a curly quote drops the whole message to UCS-2. This is why
    // the body has neither.
    expect(segments('a'.repeat(100))).toBe(1)
    expect(segments('a'.repeat(100) + '😀')).toBe(2)
    expect(segments('it’s')).toBe(1)
    expect(segments('a'.repeat(71))).toBe(1)
    expect(segments('a'.repeat(71) + '’')).toBe(2)
  })

  it('is nothing for nothing', () => {
    expect(segments('')).toBe(0)
    expect(segments(null)).toBe(0)
  })

  it('keeps a real invoice text to a single segment', () => {
    const p = textInvoicePreview({ company, invoice, amountDue: 12500, consentProblem: null })
    expect(p.segments).toBe(1)
  })
})

describe('the link is the invoice', () => {
  it('is the customer portal, the same page the email points at', () => {
    expect(invoiceLink(invoice, 'https://x.test')).toBe('https://x.test/portal/abc123')
  })

  it('is nothing without a token', () => {
    expect(invoiceLink({ invoice_id: 'INV-1' })).toBe(null)
    expect(invoiceLink(null)).toBe(null)
  })
})

describe('when it must not be sent', () => {
  it('defers to the consent rule rather than inventing a second one', () => {
    // lib/smsConsent#mayTextProblem owns who may be texted, including a STOP.
    expect(textInvoiceProblem({ invoice, consentProblem: 'No phone number on this customer.' }))
      .toBe('No phone number on this customer.')
  })

  it('refuses an invoice with no portal link, rather than texting a bare number', () => {
    expect(textInvoiceProblem({ invoice: { invoice_id: 'INV-9' }, consentProblem: null }))
      .toMatch(/no customer portal link/)
  })

  it('allows a real one', () => {
    expect(textInvoiceProblem({ invoice, consentProblem: null })).toBe(null)
  })

  it('reports the problem on the preview, so nothing has to re-derive it', () => {
    const p = textInvoicePreview({ company, invoice: { invoice_id: 'INV-9' }, amountDue: 5, consentProblem: null })
    expect(p.problem).toMatch(/no customer portal link/)
    expect(p.link).toBe(null)
  })
})
