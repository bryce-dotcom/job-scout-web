import { describe, it, expect } from 'vitest'
import { buildInvoiceSendPayload, paymentMethodsFrom, businessUnitFor, logoUrlFrom, portalUrlFor } from './invoiceSend'

const settings = [
  { key: 'business_units', value: JSON.stringify([{ name: 'HHH Building Services', phone: '801-555-0100', email: 'info@hhh.services', address: '6395 W 10400 N, Highland, UT', logo_url: 'https://x/bu.png' }]) },
  { key: 'payment_config', value: JSON.stringify({ stripe_enabled: true, bank_transfer_enabled: true, paypal_enabled: false }) },
  { key: 'company_logo_url', value: 'https://x/company.png' },
]
const company = { company_name: 'HHH Services, LLC', phone: '801-404-4848', owner_email: 'bryce@hhh.services', address: 'HQ', remit_to_address: 'PO Box 1' }
const invoice = { id: 32999, company_id: 3, invoice_id: 'INV-TEST1', amount: 595, discount_applied: 54.59, job_description: 'Windows', business_unit: 'HHH Building Services', customer_id: 1549 }
const lines = [{ description: 'Exterior windows', quantity: 30, unit_price: '6', line_total: '180' }, { item_name: 'Screen repair', quantity: 2, unit_price: 35, line_total: 70 }]

describe('the send payload', () => {
  it('is the same object the invoice page always sent, from the same inputs — greeting the person, not the company', () => {
    const p = buildInvoiceSendPayload({ invoice, lines, customer: { name: 'Sylvia', business_name: 'Jan Pro' }, company, settings, recipient: 'ap@janpro.com', portalToken: 'tok123' })
    expect(p).toMatchObject({
      company_id: 3, invoice_id: 32999, recipient_email: 'ap@janpro.com', invoice_number: 'INV-TEST1', amount: 595, discount: 54.59,
      customer_name: 'Sylvia', portal_url: 'https://jobscout.appsannex.com/portal/tok123',
      logo_url: 'https://x/bu.png', payment_methods: ['Credit Card', 'ACH / Bank Transfer'],
      business_unit_name: 'HHH Building Services', business_unit_phone: '801-555-0100', business_unit_email: 'info@hhh.services', business_unit_address: '6395 W 10400 N, Highland, UT',
    })
    expect(p.invoice_lines).toEqual([
      { description: 'Exterior windows', quantity: 30, unit_price: 6, line_total: 180 },
      { description: 'Screen repair', quantity: 2, unit_price: 35, line_total: 70 },
    ])
    expect(p.pdf_storage_path).toBeUndefined()
    expect(p.extra_attachments).toBeUndefined()
  })
  it('falls back to the company when the business unit is unknown, and to INV-<id> without a number', () => {
    const p = buildInvoiceSendPayload({ invoice: { ...invoice, invoice_id: null, business_unit: 'Nope' }, lines: [], customer: null, company, settings, recipient: 'a@b.com', portalToken: null })
    expect(p).toMatchObject({ invoice_number: 'INV-32999', customer_name: '', portal_url: null, logo_url: 'https://x/company.png', business_unit_name: 'Nope', business_unit_phone: '801-404-4848', business_unit_email: 'bryce@hhh.services', business_unit_address: 'PO Box 1' })
  })
  it('carries the desk-only extras when given them', () => {
    const p = buildInvoiceSendPayload({ invoice, lines, customer: null, company, settings, recipient: 'a@b.com', portalToken: 't', pdfPath: 'invoices/3/x.pdf', cc: 'c@d.com', subject: 'Hi', attachments: [{ filename: 'w9.pdf', content: 'AAA' }] })
    expect(p).toMatchObject({ pdf_storage_path: 'invoices/3/x.pdf', cc_emails: 'c@d.com', custom_subject: 'Hi', extra_attachments: [{ filename: 'w9.pdf', content: 'AAA' }] })
  })
})

describe('the pieces', () => {
  it('reads payment methods and survives bad config', () => {
    expect(paymentMethodsFrom(settings)).toEqual(['Credit Card', 'ACH / Bank Transfer'])
    expect(paymentMethodsFrom([{ key: 'payment_config', value: '{not json' }])).toEqual([])
    expect(paymentMethodsFrom([])).toEqual([])
  })
  it('finds the business unit and its logo', () => {
    expect(businessUnitFor(settings, invoice)?.phone).toBe('801-555-0100')
    expect(businessUnitFor(settings, { business_unit: null })).toBeNull()
    expect(logoUrlFrom(settings, null, company)).toBe('https://x/company.png')
    expect(logoUrlFrom([], null, { logo_url: 'https://x/c2.png' })).toBe('https://x/c2.png')
  })
  it('portal url', () => {
    expect(portalUrlFor('abc')).toBe('https://jobscout.appsannex.com/portal/abc')
    expect(portalUrlFor(null)).toBeNull()
  })
})
