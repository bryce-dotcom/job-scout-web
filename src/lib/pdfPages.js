// Page selection for PDFs that go into a submittal package.
//
// A rebate invoice is two pages: page one is the utility's project (the part
// the utility audits), page two is the customer's add-ons and the invoice
// total. The utility does not allow add-ons or discounts in what it sees, so
// the submittal sends page one on its own unless someone chooses otherwise.
//
// pdf-lib is already what the package uses to merge documents; this reuses it
// to copy just the pages wanted. A single-page PDF passes through untouched
// either way — "page one only" of a one-page invoice is the whole invoice.

import { PDFDocument } from 'pdf-lib'

export const PAGES_FIRST = 'first'
export const PAGES_ALL = 'all'

// Which page indices of a source document to keep for the given choice.
export function pageIndicesFor(choice, pageCount) {
  const n = Math.max(0, Number(pageCount) || 0)
  if (n === 0) return []
  if (choice === PAGES_FIRST) return [0]
  return Array.from({ length: n }, (_, i) => i)
}

// Return the PDF bytes trimmed to the chosen pages. Returns the ORIGINAL
// bytes when nothing would change, so a one-page document is never
// re-serialised for no reason.
export async function selectPdfPages(bytes, choice = PAGES_ALL) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const keep = pageIndicesFor(choice, src.getPageCount())
  if (keep.length === src.getPageCount()) return bytes
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, keep)
  pages.forEach((p) => out.addPage(p))
  return await out.save()
}
