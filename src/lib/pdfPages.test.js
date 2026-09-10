import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { selectPdfPages, pageIndicesFor, PAGES_FIRST, PAGES_ALL } from './pdfPages.js'

// Build a real PDF with n pages, each stamped so we can tell them apart.
// Each page gets its own size so the output can be told apart without text
// extraction (pdf-lib flate-compresses content streams).
const SIZES = [[300, 200], [400, 500], [500, 100]]
async function makePdf(n) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage(SIZES[i])
  return await doc.save()
}

const pageCount = async (bytes) => (await PDFDocument.load(bytes)).getPageCount()

describe('pageIndicesFor', () => {
  it('first = page one only; all = every page', () => {
    expect(pageIndicesFor(PAGES_FIRST, 2)).toEqual([0])
    expect(pageIndicesFor(PAGES_ALL, 3)).toEqual([0, 1, 2])
  })
  it('an empty document yields nothing to keep', () => {
    expect(pageIndicesFor(PAGES_FIRST, 0)).toEqual([])
  })
  it('an unknown choice keeps everything rather than dropping pages', () => {
    expect(pageIndicesFor('nonsense', 2)).toEqual([0, 1])
    expect(pageIndicesFor(undefined, 2)).toEqual([0, 1])
  })
})

describe('selectPdfPages — the submittal sends page one unless told otherwise', () => {
  it('trims a two-page invoice to page one', async () => {
    const two = await makePdf(2)
    const out = await selectPdfPages(two, PAGES_FIRST)
    expect(await pageCount(out)).toBe(1)
    expect(out).not.toBe(two)
  })

  it('leaves a one-page invoice untouched — page one IS the invoice', async () => {
    const one = await makePdf(1)
    const out = await selectPdfPages(one, PAGES_FIRST)
    expect(out).toBe(one)
    expect(await pageCount(out)).toBe(1)
  })

  it('keeps every page when all pages are wanted', async () => {
    const three = await makePdf(3)
    const out = await selectPdfPages(three, PAGES_ALL)
    expect(out).toBe(three)
    expect(await pageCount(out)).toBe(3)
  })

  it('keeps the FIRST page, not some other one', async () => {
    const two = await makePdf(2)
    const out = await selectPdfPages(two, PAGES_FIRST)
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect([width, height]).toEqual(SIZES[0])
    expect([width, height]).not.toEqual(SIZES[1])
  })
})
