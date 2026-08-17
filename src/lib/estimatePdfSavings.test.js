import { describe, it, expect } from 'vitest'
import { showsSavingsOnPdf } from './estimatePdf'

// Damien: "just noticed the payback period time is gone off the PDF version of
// the estimate, i had to find it" — filed within the hour of savings becoming
// default-off. Payback is computed FROM savings, so switching savings off took
// payback with it.

describe('savings + payback on the regular estimate PDF', () => {
  it('is on when nobody has expressed a preference', () => {
    expect(showsSavingsOnPdf({})).toBe(true)
    expect(showsSavingsOnPdf(undefined)).toBe(true)
    expect(showsSavingsOnPdf(null)).toBe(true)
  })

  it('honours an explicit off — a bare price document is still available', () => {
    expect(showsSavingsOnPdf({ estimate_pdf_show_savings: false })).toBe(false)
  })

  it('honours an explicit on', () => {
    expect(showsSavingsOnPdf({ estimate_pdf_show_savings: true })).toBe(true)
  })

  // The checkbox and the renderer must never disagree about what the customer
  // will receive, which is why they share this one function rather than each
  // spelling out the default.
  it('gives the checkbox and the PDF the same answer for every input', () => {
    for (const s of [{}, { estimate_pdf_show_savings: true }, { estimate_pdf_show_savings: false }, { other: 1 }]) {
      expect(showsSavingsOnPdf(s)).toBe(showsSavingsOnPdf({ ...s }))
    }
  })
})
