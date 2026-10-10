// Print what is on the screen, or save it as a PDF.
//
// Noah (10/09): "need to be able to print out formal legal docs or save as
// pdf". The formal proposal could be previewed, emailed and signed, but there
// was no way to get a copy out of the app — which is the one thing a customer
// asks for when a lawyer or a landlord wants to see it.
//
// Deliberately the browser's own print dialog rather than a second PDF
// renderer. lib/estimatePdf already draws an estimate with jsPDF and it draws
// the PLAIN layout; teaching it the formal layout as well would be a second
// description of the same document, and the two would drift the first time
// somebody changed a heading. The browser prints exactly what the customer
// sees, and every platform's print dialog offers "Save as PDF".
//
// This works because FormalProposal styles everything inline, so a copy of its
// node carries its own appearance with no stylesheet to chase.

/**
 * A standalone HTML document around a copied node.
 *
 * Margins are the printer's business, so the page sets a modest one and lets
 * the dialog override it. `print-color-adjust` keeps the accent bars and the
 * totals panel from printing as white boxes, which is what Safari does by
 * default and makes a proposal look unfinished.
 */
export function buildPrintDocument(innerHtml, title = 'Document') {
  const safeTitle = String(title || 'Document').replace(/[<>]/g, '')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { margin: 12mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Nothing interactive survives on paper. */
  button, input, textarea, select { display: none !important; }
  a { color: inherit; text-decoration: none; }
  img { max-width: 100%; }
</style>
</head>
<body>${innerHtml || ''}</body>
</html>`
}

/** A filename a person can find again. */
export function printTitle({ docWord = 'Proposal', reference, customer } = {}) {
  return [docWord, reference, customer].filter(Boolean).join(' — ')
}

/**
 * Open a print view of one element.
 *
 * Returns a sentence when it could not, rather than failing silently — a
 * blocked pop-up is the usual reason and the person needs telling.
 */
export function printElement(el, title) {
  if (!el) return 'There is nothing on screen to print yet.'
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return 'Your browser blocked the print window. Allow pop-ups for this site and try again.'
  win.document.write(buildPrintDocument(el.outerHTML, title))
  win.document.close()
  // Give the copied markup a moment to lay out — printing an empty page is
  // worse than waiting a beat for it.
  win.onload = () => { win.focus(); win.print() }
  setTimeout(() => { try { win.focus(); win.print() } catch { /* already printed */ } }, 400)
  return null
}
