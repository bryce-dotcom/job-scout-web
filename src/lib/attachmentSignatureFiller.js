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

  for (const field of signatureFields) {
    try {
      const pageIndex = Math.max(0, parseInt(field.page) || 0)
      if (pageIndex >= pdfDoc.getPageCount()) continue
      const page = pdfDoc.getPage(pageIndex)
      if (embeddedImg) {
        page.drawImage(embeddedImg, {
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
        })
      } else if (italicFont && typedText) {
        // Fit the typed text to the field height. pdf-lib drawText uses
        // baseline-anchored coordinates, so nudge y up by ~25% of height.
        const size = Math.max(10, Math.min(field.height || 24, 28))
        page.drawText(typedText, {
          x: field.x + 4,
          y: field.y + Math.max(4, (field.height || 24) * 0.25),
          size,
          font: italicFont,
        })
      }
    } catch (err) {
      console.warn('[stampSignatureOnPdf] field stamp failed', field, err)
    }
  }

  return await pdfDoc.save()
}
