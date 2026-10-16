// Post-process a filled PDF by stamping the canonical customer signature
// onto any configured signature fields. Wraps pdf-lib so we have one
// place in the codebase that knows how to "drop a signature on a signature
// line" regardless of which document it came from.
//
// Input formats:
//   - signatureFields: [{ page?: 0, x, y, width, height, name? }, ...]
//   - signatureBytes: Uint8Array PNG (from resolveCustomerSignature)
//   - typedText: string fallback when no image is available

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { drawSignatureAt } from '../../supabase/functions/_shared/signatureTargets.ts'

/**
 * @param {Uint8Array|ArrayBuffer} pdfBytes - the PDF to stamp
 * @param {Object} opts
 * @param {Uint8Array|null} opts.signatureBytes
 * @param {string|null} opts.typedText
 * @param {Array<{page?:number,x:number,y:number,width:number,height:number,name?:string}>} opts.signatureFields
 * @returns {Promise<Uint8Array>} modified PDF bytes
 */
export async function stampSignatureOnPdf(pdfBytes, { signatureBytes, typedText, signatureFields } = {}) {
  if (!signatureFields || signatureFields.length === 0) return pdfBytes
  if (!signatureBytes && !typedText) return pdfBytes

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

  // Embed the signature image once and reuse across all fields
  let embeddedImg = null
  if (signatureBytes) {
    try {
      embeddedImg = await pdfDoc.embedPng(signatureBytes)
    } catch (err) {
      console.warn('[stampSignatureOnPdf] embedPng failed, falling back to typed text', err)
      embeddedImg = null
    }
  }

  // Cursive fallback font (Times Italic is closest in StandardFonts).
  let italicFont = null
  if (!embeddedImg && typedText) {
    try {
      italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic)
    } catch (err) {
      console.warn('[stampSignatureOnPdf] italic font embed failed', err)
    }
  }

  // The placement arithmetic lives in _shared/signatureTargets so the
  // portal, the job page and approve-document all put the ink in the same
  // place (see lib/signatureTargets).
  drawSignatureAt(pdfDoc, { rects: signatureFields, embeddedImg, italicFont, typedText })

  return await pdfDoc.save()
}
