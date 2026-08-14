import { describe, it, expect } from 'vitest'
import { specCoverage } from './specSheetPdf'

// Shapes taken from real quote_lines rows on company 3.
const fixture = (id, { specs = 0, pdf = false } = {}) => ({
  item: {
    id,
    name: `SMBE fixture ${id}`,
    datasheet_json: specs ? { specs: Array.from({ length: specs }, (_, i) => ({ label: `L${i}`, value: 'v' })) } : null,
    spec_sheet_url: pdf ? `https://example.test/${id}.pdf` : null,
  },
})
const labour = (id) => ({ item: { id, name: 'Installation labour', datasheet_json: null, spec_sheet_url: null } })

describe('what the rep is told they are attaching', () => {
  it('counts products with real specs separately from the total', () => {
    // The message a rep reads is "N of M products". Collapsing those to one
    // number is what let products drop off the sheet unnoticed.
    const c = specCoverage([
      fixture(1, { specs: 8, pdf: true }),
      fixture(2, { specs: 5, pdf: true }),
      fixture(3, { pdf: true }),
    ])
    expect(c).toEqual({ products: 3, withSpecs: 2, missing: 1, manufacturerPdfs: 3 })
  })

  it('ignores labour and service lines', () => {
    // 182 bundle rows and 245 electrical service rows have no specs and never
    // will. Counting them would report "1 of 4 products" on a one-fixture job.
    const c = specCoverage([fixture(1, { specs: 6, pdf: true }), labour(2), labour(3)])
    expect(c.products).toBe(1)
    expect(c.missing).toBe(0)
  })

  it('counts a product once however many lines it appears on', () => {
    const c = specCoverage([fixture(7, { specs: 4, pdf: true }), fixture(7, { specs: 4, pdf: true })])
    expect(c.products).toBe(1)
  })

  it('reports nothing to attach when no product has specs', () => {
    // The checkbox stays on by default, so this is the case that decides
    // whether the rep is promised a sheet that never arrives.
    const c = specCoverage([fixture(1, { pdf: true }), labour(2)])
    expect(c.withSpecs).toBe(0)
    expect(c.manufacturerPdfs).toBe(1)
  })

  it('counts manufacturer PDFs on their own — they are a separate attachment', () => {
    const c = specCoverage([fixture(1, { specs: 3 }), fixture(2, { specs: 3, pdf: true })])
    expect(c.withSpecs).toBe(2)
    expect(c.manufacturerPdfs).toBe(1)
  })

  it('survives an empty estimate and malformed lines', () => {
    expect(specCoverage([])).toEqual({ products: 0, withSpecs: 0, missing: 0, manufacturerPdfs: 0 })
    expect(specCoverage([null, {}, { item: null }]).products).toBe(0)
  })
})
