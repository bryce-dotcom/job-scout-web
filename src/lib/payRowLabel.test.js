import { describe, it, expect } from 'vitest'
import { jobRef, payRowHeading, payRowSource } from './payRowLabel'

const JOBS = [
  { id: 12798, job_id: '8746', job_title: 'Redman Van & Storage' },
  { id: 12799, job_id: '8747', job_title: 'Redman #2' },
]

// Alayda: "Cole's My pay — Redman is on there twice." Two real jobs, two real
// utility invoices, both commissions correct — and nothing on the row to tell
// them apart.
describe('two jobs for one customer read as two jobs', () => {
  const a = { type: 'utility_commission', jobId: 12798, jobTitle: 'Redman Van & Storage', utilityInvoiceId: 'UTL-45' }
  const b = { type: 'utility_commission', jobId: 12799, jobTitle: 'Redman #2', utilityInvoiceId: 'UTL-42' }

  it('puts the job number on each heading', () => {
    expect(payRowHeading(a, JOBS)).toBe('Redman Van & Storage · 8746')
    expect(payRowHeading(b, JOBS)).toBe('Redman #2 · 8747')
    expect(payRowHeading(a, JOBS)).not.toBe(payRowHeading(b, JOBS))
  })

  it('names the utility invoice each was earned on', () => {
    expect(payRowSource(a)).toBe('Utility invoice UTL-45')
    expect(payRowSource(b)).toBe('Utility invoice UTL-42')
  })
})

// The row used to print `Invoice {d.invoiceId}` for every type. A utility
// detail has no invoiceId, so it read "Invoice undefined".
describe('it never says Invoice undefined again', () => {
  it('does not call a utility commission an invoice', () => {
    const got = payRowSource({ type: 'utility_commission', utilityInvoiceId: 'UTL-45' })
    expect(got).not.toMatch(/undefined/)
    expect(got).not.toMatch(/^Invoice /)
  })

  it('degrades to a plain label rather than printing undefined', () => {
    expect(payRowSource({ type: 'utility_commission' })).toBe('Utility invoice')
    expect(payRowSource({ type: 'invoice_commission' })).toBeNull()
    expect(payRowSource(null)).toBeNull()
  })

  it('still labels an ordinary invoice commission', () => {
    expect(payRowSource({ type: 'invoice_commission', invoiceId: 'INV-MQVEZ3Z8' })).toBe('Invoice INV-MQVEZ3Z8')
  })

  it('labels a processor commission as processing, not as a sale', () => {
    expect(payRowSource({ type: 'processor_commission', utilityInvoiceId: 'UTL-45' })).toBe('Processing UTL-45')
  })
})

describe('it copes with what the rows actually carry', () => {
  it('falls back when the job is not in the fetched set', () => {
    expect(payRowHeading({ jobId: 99999, jobTitle: 'Somewhere' }, JOBS)).toBe('Somewhere')
    expect(jobRef({ jobId: 99999 }, JOBS)).toBeNull()
  })

  it('matches a job id across the string/number divide', () => {
    expect(jobRef({ jobId: '12798' }, JOBS)).toBe('8746')
  })

  it('never renders an empty heading', () => {
    expect(payRowHeading({ jobTitle: '' }, JOBS)).toBe('Unknown job')
    expect(payRowHeading(null, JOBS)).toBe('Unknown job')
  })
})
