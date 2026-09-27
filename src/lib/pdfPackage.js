// Merge PDFs into one document, in order. The utility submittal on JobDetail
// and the bid packet both hand a buyer "one PDF, please"; this is the one
// place that knows how (SAL_SCOUT_PLAN.md §5.7 — lifted from
// JobDetail.handleDownloadSubmittalPDF, which is the next caller to switch).

import { PDFDocument } from 'pdf-lib'
import { pageIndicesFor } from './pdfPages'

/**
 * @param {Array<{ bytes: ArrayBuffer|Uint8Array, pages?: string, label?: string }>} parts
 *   `pages` is a pdfPages choice ('all' | 'first'); label only names a skipped part in the result.
 * @returns {Promise<{ bytes: Uint8Array, merged: number, skipped: Array<{label: string, reason: string}>, pageCount: number }>}
 */
export async function mergePdfParts(parts) {
  const out = await PDFDocument.create()
  let merged = 0
  const skipped = []
  for (const part of parts || []) {
    if (!part?.bytes) { skipped.push({ label: part?.label || '?', reason: 'no bytes' }); continue }
    try {
      const src = await PDFDocument.load(part.bytes, { ignoreEncryption: true })
      const keep = part.pages ? pageIndicesFor(part.pages, src.getPageCount()) : src.getPageIndices()
      const pages = await out.copyPages(src, keep)
      pages.forEach((p) => out.addPage(p))
      merged++
    } catch (e) {
      skipped.push({ label: part.label || '?', reason: e?.message || 'not a PDF' })
    }
  }
  if (merged === 0) throw new Error('Nothing to merge — no readable PDF among the parts')
  const bytes = await out.save()
  return { bytes, merged, skipped, pageCount: out.getPageCount() }
}
