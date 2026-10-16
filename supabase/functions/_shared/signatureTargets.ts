// Where does the signature go on this document?
//
// The plumbing to sign a generated document has been complete for a while:
// lib/customerSignature resolves the signature a customer gave, and
// lib/attachmentSignatureFiller stamps it at a list of rectangles. What was
// missing is the list. documentGenerator only stamps when the template row
// carries `signature_fields`, nothing in the app ever writes that column, and
// so on 14 Oct 2026 all three of HHH's templates had it empty — which is why
// Robert Anderson's W-9 and General Application came out filled with his
// details, dated, and unsigned, nine days after he signed the proposal.
//
// Most of these forms already say where the signature goes. The General
// Application carries a real AcroForm signature widget ("Signature Field 2"),
// a "Signatory" text field and a "Sign Date" next to it. Reading those costs
// nothing and needs no setup, so a document that names its own signature line
// signs itself. Forms that do not — the IRS W-9 signs on a printed rule with
// no field behind it — still need a box placed by hand, and that stays the
// exception rather than the price of entry.

// Bounded at both ends, because "de-sign" and "as-sign-ed" both contain
// "sign": an unbounded test reads a field named `assigned_to` as a place to
// put the customer's signature. "W9_SIG" — a real field inside the General
// Application — has to count, so `sig` is allowed on its own boundaries.
const SIGNATURE_NAME = /(^|[^a-z])(sign(ature|atory|ed[\s_-]*by)?|initial|sig)([^a-z]|$)/i
// "Sign Date" matches the signature pattern too, so dates are tested first
// and removed from the running — otherwise the signature lands in the date
// box, which is both wrong and the kind of wrong nobody notices until a
// utility rejects the application.
const DATE_NAME = /(sign|execut|approv)[a-z]*[\s_-]*date|date[\s_-]*(sign|of[\s_-]*sign)/i
const PRINTED_NAME = /signatory|printed[\s_-]*name|name[\s_-]*of[\s_-]*signer/i

/** Which page is this widget on? Compared by reference, not by position. */
function pageIndexOfWidget(pdfDoc: any, widget: any) {
  const widgetRef = widget?.ref
  const pages = pdfDoc.getPages()
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.Annots?.()
    if (!annots) continue
    for (let a = 0; a < annots.size(); a++) {
      const ref = annots.get(a)
      // A widget may be stored by reference or inline; compare both ways.
      if (widgetRef && ref === widgetRef) return i
      try {
        if (pdfDoc.context.lookup(ref) === widget.dict) return i
      } catch { /* a malformed annots entry is not a reason to fail */ }
    }
  }
  return 0
}

function rectOf(widget: any) {
  try {
    const r = widget.getRectangle()
    if (!r) return null
    const width = Number(r.width), height = Number(r.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
    return { x: Number(r.x), y: Number(r.y), width, height }
  } catch {
    return null
  }
}

/**
 * Read a PDF's own form fields for the places a signature belongs.
 *
 * @param pdfDoc  a loaded pdf-lib PDFDocument
 * @returns {{ signature: Array, printedName: Array, date: Array }}
 *   each entry { page, x, y, width, height, name, kind }
 */
export function findSignatureTargets(pdfDoc: any) {
  const out: any = { signature: [], printedName: [], date: [] }
  let fields: any[] = []
  try {
    fields = pdfDoc.getForm().getFields()
  } catch {
    return out   // no AcroForm at all — a flat scan or a picture of a form
  }

  for (const field of fields) {
    let name = ''
    try { name = field.getName() || '' } catch { continue }

    const isSignatureWidget = field.constructor?.name === 'PDFSignature'
    // Order matters: a "Sign Date" field matches the signature pattern too.
    const kind = DATE_NAME.test(name) ? 'date'
      : PRINTED_NAME.test(name) ? 'printedName'
        : (isSignatureWidget || SIGNATURE_NAME.test(name)) ? 'signature'
          : null
    if (!kind) continue

    let widgets: any[] = []
    try { widgets = field.acroField.getWidgets() || [] } catch { continue }
    for (const w of widgets) {
      const rect = rectOf(w)
      if (!rect) continue
      out[kind].push({ ...rect, page: pageIndexOfWidget(pdfDoc, w), name, kind })
    }
  }
  return out
}

/**
 * The rectangles to stamp a signature into, preferring what was configured.
 *
 * A hand-placed box on the template always wins: someone looked at the form
 * and said "here". Auto-detection only fills the silence.
 */
export function signatureRects(pdfDoc: any, configuredFields: any) {
  const configured = Array.isArray(configuredFields) ? configuredFields.filter(f => f && f.width && f.height) : []
  if (configured.length) return { rects: configured, source: 'configured', targets: null }
  const targets = findSignatureTargets(pdfDoc)
  return { rects: targets.signature, source: targets.signature.length ? 'detected' : 'none', targets }
}

/**
 * Can this document be signed without someone placing a box first?
 * Used to tell a blank "no signature on it" apart from "this form has no
 * signature line we can find", which are different problems with different
 * fixes — and saying so is the difference between a button that works and a
 * button that silently does nothing.
 */
export function describeSignability(pdfDoc: any, configuredFields: any) {
  const { rects, source, targets } = signatureRects(pdfDoc, configuredFields)
  if (source === 'configured') return { signable: true, source, count: rects.length, reason: `${rects.length} placed signature box${rects.length === 1 ? '' : 'es'}` }
  if (source === 'detected') return { signable: true, source, count: rects.length, reason: `${rects.length} signature field${rects.length === 1 ? '' : 's'} on the form (${targets.signature.map(t => t.name).join(', ')})` }
  return { signable: false, source, count: 0, reason: 'This form has no signature field — place a signature box on the template once and every copy after it signs itself.' }
}

/**
 * Draw a signature into the rectangles found above.
 *
 * Takes an already-loaded PDFDocument and already-embedded pdf-lib objects,
 * so this file imports pdf-lib in neither runtime: the browser resolves it
 * from node_modules and Deno from esm.sh, and the arithmetic that decides
 * where the ink lands is written once for both. Loading, embedding and
 * saving belong to the caller.
 *
 * @param pdfDoc        a loaded PDFDocument
 * @param rects         from signatureRects() — {page,x,y,width,height}
 * @param embeddedImg   a pdf-lib PDFImage, or null to fall back to text
 * @param italicFont    a pdf-lib PDFFont, used when there is no image
 * @param typedText     the name the customer typed
 * @returns how many places were actually stamped
 */
export function drawSignatureAt(
  pdfDoc: any,
  { rects, embeddedImg, italicFont, typedText }: any,
): number {
  let drawn = 0
  for (const field of rects || []) {
    try {
      const pageIndex = Math.max(0, parseInt(field.page) || 0)
      if (pageIndex >= pdfDoc.getPageCount()) continue
      const page = pdfDoc.getPage(pageIndex)
      if (embeddedImg) {
        page.drawImage(embeddedImg, { x: field.x, y: field.y, width: field.width, height: field.height })
        drawn++
      } else if (italicFont && typedText) {
        // pdf-lib anchors text at the baseline, so a y of the field's bottom
        // edge hangs the name below the rule it is meant to sit on. Nudge up
        // by a quarter of the box, and cap the size so a tall signature box
        // does not render the name at 40pt.
        const size = Math.max(10, Math.min(field.height || 24, 28))
        page.drawText(typedText, {
          x: field.x + 4,
          y: field.y + Math.max(4, (field.height || 24) * 0.25),
          size,
          font: italicFont,
        })
        drawn++
      }
    } catch (err) {
      console.warn('[drawSignatureAt] field stamp failed', field, err)
    }
  }
  return drawn
}
