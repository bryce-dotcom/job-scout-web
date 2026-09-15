import { describe, it, expect } from 'vitest'
import { buildInvoiceSendPayload, paymentMethodsFrom, businessUnitFor, logoUrlFrom, portalUrlFor, invoiceDeductionRows } from './invoiceSend'

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

// ── the email's deduction rows ────────────────────────────────────────────
// The email used to print one "Discount" row for whatever discount_applied
// held — the utility incentive included (Alayda, 550b056d). It now prints
// the same rows, with the same names, as the PDF's totals block.
describe('the deduction rows in the email', () => {
  const providers = [{ id: 116, provider_name: 'Rocky Mountain Power' }]

  it('a plain discount is the one row the email always had', () => {
    expect(invoiceDeductionRows({ invoice: { amount: 595, discount_applied: 54.59 } })).toEqual([{ label: 'Discount', amount: 54.59 }])
  })

  it('nothing to deduct, no rows', () => {
    expect(invoiceDeductionRows({ invoice: { amount: 595, discount_applied: 0 } })).toEqual([])
    expect(invoiceDeductionRows({ invoice: { amount: 595, discount_applied: null } })).toEqual([])
  })

  it('names the utility on a lighting invoice — ABC Supply', () => {
    const invoice = { amount: 9971.12, discount_applied: 6528, utility_owes: 6528, utility_provider_id: 116 }
    expect(invoiceDeductionRows({ invoice, utilityProviders: providers })).toEqual([{ label: 'Rocky Mountain Power Incentive', amount: 6528 }])
  })

  it('an invoice whose job carries the incentive but has no utility record yet — Intercon', () => {
    const invoice = { amount: 68235.64, discount_applied: 51176.73, utility_owes: null, utility_provider_id: null }
    expect(invoiceDeductionRows({ invoice, job: { utility_incentive: 51176.73 } })).toEqual([{ label: 'Utility Incentive', amount: 51176.73 }])
  })

  it('splits the rep\'s discount, the incentive and a down payment into their own rows — RSW', () => {
    const invoice = { amount: 6191.84, discount_applied: 4344, project_discount: 200, utility_owes: 4144, down_payment_applied: null }
    expect(invoiceDeductionRows({ invoice, linkedUtilityInvoice: { utility_name: 'Rocky Mountain Power' } })).toEqual([
      { label: 'Project Discount', amount: 200 },
      { label: 'Rocky Mountain Power Incentive', amount: 4144 },
    ])
    const withDown = { amount: 18203.8, discount_applied: 15602.85, down_payment_applied: 1950, utility_owes: 13652.85 }
    expect(invoiceDeductionRows({ invoice: withDown })).toEqual([
      { label: 'Utility Incentive', amount: 13652.85 },
      { label: 'Down Payment', amount: 1950 },
    ])
  })

  it('a deposit balance names the deposit when the parent is known, and stays plain when it is not', () => {
    const invoice = { amount: 10000, discount_applied: 5000, parent_invoice_id: 7, utility_owes: 3000 }
    const parent = { id: 7, invoice_type: 'deposit', amount: 2000 }
    expect(invoiceDeductionRows({ invoice, parentInvoice: parent })).toEqual([
      { label: 'Utility Incentive', amount: 3000 },
      { label: 'Deposit Applied', amount: 2000 },
    ])
    // Without the parent the deposit cannot be told apart from the incentive — one honest row.
    expect(invoiceDeductionRows({ invoice })).toEqual([{ label: 'Discount', amount: 5000 }])
  })

  it('a legacy-net invoice keeps its row', () => {
    expect(invoiceDeductionRows({ invoice: { amount: 3000, discount_applied: 6000 } })).toEqual([{ label: 'Discount', amount: 6000 }])
  })

  it('the rows ride in the payload, and sum to the discount the email subtracts', () => {
    const p = buildInvoiceSendPayload({
      invoice: { ...invoice, amount: 9971.12, discount_applied: 6528, utility_owes: 6528 }, lines, customer: null, company, settings, recipient: 'a@b.com', portalToken: null,
      linkedUtilityInvoice: { utility_name: 'Rocky Mountain Power' },
    })
    expect(p.deductions).toEqual([{ label: 'Rocky Mountain Power Incentive', amount: 6528 }])
    expect(p.deductions.reduce((s, d) => s + d.amount, 0)).toBe(p.discount)
  })
})

describe('the email rows with a company default utility', () => {
  it('names the default on an invoice whose job has no record yet', () => {
    const invoice = { amount: 68235.64, discount_applied: 51176.73, utility_owes: null, utility_provider_id: null }
    const rows = invoiceDeductionRows({ invoice, job: { utility_incentive: 51176.73 }, utilityProviders: [{ id: 116, provider_name: 'Rocky Mountain Power' }], defaultUtilityProviderId: 116 })
    expect(rows).toEqual([{ label: 'Rocky Mountain Power Incentive', amount: 51176.73 }])
  })
  it('does not name a plain discount after the default', () => {
    expect(invoiceDeductionRows({ invoice: { amount: 595, discount_applied: 54.59 }, utilityProviders: [{ id: 116, provider_name: 'Rocky Mountain Power' }], defaultUtilityProviderId: 116 })).toEqual([{ label: 'Discount', amount: 54.59 }])
  })
})
