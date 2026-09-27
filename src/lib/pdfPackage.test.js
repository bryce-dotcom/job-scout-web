import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { mergePdfParts } from './pdfPackage'

const pdfWithPages = async (n) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(); return await d.save() }

describe('one PDF from many', () => {
  it('keeps the order and counts the pages', async () => {
    const a = await pdfWithPages(2), b = await pdfWithPages(3)
    const r = await mergePdfParts([{ bytes: a, label: 'a' }, { bytes: b, label: 'b' }])
    expect(r.merged).toBe(2)
    expect(r.pageCount).toBe(5)
    expect(r.skipped).toEqual([])
  })
  it('skips a part that is not a PDF and says which, and honours a page choice', async () => {
    const a = await pdfWithPages(4)
    const r = await mergePdfParts([{ bytes: new TextEncoder().encode('not a pdf'), label: 'photo.jpg' }, { bytes: a, label: 'a', pages: 'first' }])
    expect(r.merged).toBe(1)
    expect(r.pageCount).toBe(1)
    expect(r.skipped[0].label).toBe('photo.jpg')
  })
  it('refuses to produce an empty packet', async () => {
    await expect(mergePdfParts([{ bytes: new Uint8Array([1, 2, 3]), label: 'x' }])).rejects.toThrow(/Nothing to merge/)
  })
})
