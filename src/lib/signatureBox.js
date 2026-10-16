// Placing a signature box on a form by hand.
//
// Most forms name their own signature line and need none of this
// (lib/signatureTargets reads the AcroForm field). The IRS W-9 does not: it
// signs on a printed rule with no field behind it, so somebody has to say
// where. Robert Anderson's W-9 is the one document on his job that still
// cannot be signed for exactly that reason.
//
// The arithmetic lives here rather than in the component because getting it
// wrong is silent. A PDF's origin is the BOTTOM-left corner and a canvas's is
// the top-left, so a box dragged near the signature line and stored without
// flipping lands near the top of the page — on a W-9, in the middle of the
// taxpayer's address. It still looks like a signature. It is just on the
// wrong part of the form, and nobody notices until the form is rejected.

/** A box smaller than this is a misclick, not an intention. In PDF points. */
export const MIN_BOX_POINTS = 8

/**
 * Two corners in PDF space → a normalized rectangle.
 *
 * The caller converts each canvas corner with the viewer's own
 * convertToPdfPoint, which already accounts for scale and page rotation;
 * what is left is deciding which corner is which. Dragging up-and-left is
 * as natural as down-and-right and must mean the same box.
 *
 * @param p1 [x, y] in PDF points
 * @param p2 [x, y] in PDF points
 * @returns {{x, y, width, height}} with x,y at the lower-left
 */
export function normalizeRect(p1, p2) {
  const [x1, y1] = p1 || []
  const [x2, y2] = p2 || []
  if (![x1, y1, x2, y2].every(n => Number.isFinite(n))) return null
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

/** Big enough to be a deliberate box rather than a stray click. */
export function isUsableBox(box) {
  if (!box) return false
  return Number.isFinite(box.width) && Number.isFinite(box.height)
    && box.width >= MIN_BOX_POINTS && box.height >= MIN_BOX_POINTS
}

/**
 * Build the row that gets stored on the template.
 *
 * `page` is zero-based, matching what signatureTargets returns and what
 * drawSignatureAt expects — the viewer counts pages from 1 and the mismatch
 * would put every signature one page out.
 */
export function boxForStorage(rect, pageIndex, name = 'Placed signature') {
  if (!isUsableBox(rect)) return null
  return {
    page: Math.max(0, parseInt(pageIndex) || 0),
    x: round2(rect.x),
    y: round2(rect.y),
    width: round2(rect.width),
    height: round2(rect.height),
    name,
  }
}

const round2 = (n) => Math.round(n * 100) / 100

/** The boxes that belong on the page being shown. */
export function boxesOnPage(boxes, pageIndex) {
  const page = Math.max(0, parseInt(pageIndex) || 0)
  return (Array.isArray(boxes) ? boxes : []).filter(b => (parseInt(b?.page) || 0) === page)
}

/**
 * What to tell someone opening a form to place a box.
 *
 * A form that already names its signature line needs nothing, and saying so
 * is more useful than a blank canvas: placing a second box on the General
 * Application would stamp the signature twice.
 */
export function placementAdvice({ detectedCount = 0, placedCount = 0 } = {}) {
  if (placedCount > 0) {
    return {
      tone: 'placed',
      text: `${placedCount} box${placedCount === 1 ? '' : 'es'} placed. These are used instead of anything the form declares.`,
    }
  }
  if (detectedCount > 0) {
    return {
      tone: 'detected',
      text: `This form already names its own signature line${detectedCount > 1 ? 's' : ''} (${detectedCount} found), so it signs itself. Place a box only to override that.`,
    }
  }
  return {
    tone: 'needed',
    text: 'This form has no signature field. Drag a box where the customer signs — every copy generated after that signs itself.',
  }
}

/** Strip a form name to the letters and digits that identify it. */
export function normalizeFormName(name) {
  return String(name || '')
    .replace(/\.[a-z0-9]+$/i, '')      // extension
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Which template produced this document?
 *
 * A generated document keeps no pointer back to its template, so a box
 * placed on the W-9 template would do nothing for the W-9 already sitting
 * on Robert Anderson's job — the file has no signature field of its own and
 * nothing to look the box up by. Matching on the name recovers the link:
 * "IRS_Form_W-9.pdf" normalizes to "irsformw9", which contains the template
 * "w9".
 *
 * Only templates that actually carry boxes are considered — matching one
 * that has none would replace a useful "this form has no signature field"
 * with silence. The longest match wins, so "w9" does not beat "w9sp" on a
 * file that is really the Spanish form.
 */
export function matchTemplateForFile(fileName, templates) {
  const file = normalizeFormName(fileName)
  if (!file) return null
  const candidates = (Array.isArray(templates) ? templates : [])
    .filter(t => Array.isArray(t?.signature_fields) && t.signature_fields.length)
    .map(t => ({ t, key: normalizeFormName(t.form_name) }))
    .filter(({ key }) => key.length >= 2 && (file.includes(key) || key.includes(file)))
    .sort((a, b) => b.key.length - a.key.length)
  return candidates.length ? candidates[0].t : null
}
